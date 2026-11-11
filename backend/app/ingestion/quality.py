"""Enterprise Data Quality Engine: Completeness, Validity, Consistency, Uniqueness & Verifiable Accuracy checks."""
from __future__ import annotations

from collections import Counter
import csv
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from io import StringIO
import json
import math
import re
from typing import Any

from backend.app.ingestion.mapper import CANONICAL_FIELDS, CUSTOM_PREFIX, IGNORE_FIELD, compute_capabilities
from backend.app.ingestion.parsers import neutralize_csv_cell


MISSING_TOKENS = {"", "na", "n/a", "null", "none", "nan", "-", "--", "nil"}
CURRENCY_TOKENS = {
    "$": "USD",
    "usd": "USD",
    "₫": "VND",
    "vnd": "VND",
    "đ": "VND",
    "vnđ": "VND",
    "€": "EUR",
    "eur": "EUR",
    "£": "GBP",
    "gbp": "GBP",
}


@dataclass
class RowIssue:
    row_number: int
    severity: str  # "error" | "warning"
    column: str
    target_field: str
    issue_code: str
    raw_value: str
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "row_number": self.row_number,
            "severity": self.severity,
            "column": self.column,
            "target_field": self.target_field,
            "issue_code": self.issue_code,
            "raw_value": self.raw_value,
            "message": self.message,
        }


@dataclass
class QualityEvaluationResult:
    report: dict[str, Any]
    cleaned_rows: list[dict[str, Any]]
    all_issues: list[RowIssue]
    detected_currency: str
    capabilities: dict[str, bool]
    date_start: date | None = None
    date_end: date | None = None


def _is_missing(val: Any) -> bool:
    if val is None:
        return True
    if isinstance(val, str) and val.strip().lower() in MISSING_TOKENS:
        return True
    return False


def _infer_dayfirst(values: list[Any]) -> tuple[bool, bool]:
    """Inspect slash/dash date strings across a column; returns (dayfirst, is_ambiguous)."""
    dmy_evidence = 0
    mdy_evidence = 0
    slash_seen = 0
    for val in values[:2000]:
        if _is_missing(val):
            continue
        s = str(val).strip()
        m = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s.*)?", s)
        if not m:
            continue
        slash_seen += 1
        first, second = int(m.group(1)), int(m.group(2))
        if first > 12 and 1 <= second <= 12:
            dmy_evidence += 1
        elif second > 12 and 1 <= first <= 12:
            mdy_evidence += 1
    if mdy_evidence > dmy_evidence and dmy_evidence == 0:
        return False, False
    if dmy_evidence > 0 and mdy_evidence > 0:
        return True, True
    if slash_seen > 0 and dmy_evidence == 0 and mdy_evidence == 0:
        return True, True
    return True, False


def parse_date_value(raw: Any, *, dayfirst: bool = True) -> tuple[date | None, str | None, str | None]:
    """Return (parsed_date, format_tag, error_reason)."""
    if isinstance(raw, datetime):
        return raw.date(), "native_datetime", None
    if isinstance(raw, date):
        return raw, "native_date", None
    s = str(raw).strip()
    if s.startswith("#"):
        return None, None, f"Spreadsheet error token '{s}'"
    if re.fullmatch(r"\d{5}(?:\.0+)?", s):
        serial = int(float(s))
        if 20_000 <= serial <= 75_000:
            parsed = date(1899, 12, 30) + timedelta(days=serial)
            return parsed, "excel_serial", None

    m_iso = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m_iso:
        try:
            return date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))), "YYYY-MM-DD", None
        except ValueError as exc:
            return None, None, str(exc)

    m_ymd_slash = re.fullmatch(r"(\d{4})/(\d{1,2})/(\d{1,2})", s)
    if m_ymd_slash:
        try:
            return date(int(m_ymd_slash.group(1)), int(m_ymd_slash.group(2)), int(m_ymd_slash.group(3))), "YYYY/MM/DD", None
        except ValueError as exc:
            return None, None, str(exc)

    # ISO timestamp e.g. 2026-09-30T10:15:00Z or 2026-09-30 10:15:00
    m_ts = re.fullmatch(r"(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?", s)
    if m_ts:
        try:
            return date.fromisoformat(m_ts.group(1)), "ISO-8601 Timestamp", None
        except ValueError as exc:
            return None, None, str(exc)

    m_dmy = re.fullmatch(r"(\d{1,2})([/-])(\d{1,2})\2(\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?", s)
    if m_dmy:
        p1, sep, p2, yr_str = int(m_dmy.group(1)), m_dmy.group(2), int(m_dmy.group(3)), m_dmy.group(4)
        yr = (2000 + int(yr_str)) if len(yr_str) == 2 else int(yr_str)
        day_num, mon_num = (p1, p2) if dayfirst else (p2, p1)
        fmt_tag = f"{'DD' if dayfirst else 'MM'}{sep}{'MM' if dayfirst else 'DD'}{sep}{'YYYY' if len(yr_str)==4 else 'YY'}"
        try:
            return date(yr, mon_num, day_num), fmt_tag, None
        except ValueError:
            # Do not silently swap in inconsistent columns unless clearly flagged
            return None, None, f"Invalid calendar date '{s}' for expected order {'DD/MM' if dayfirst else 'MM/DD'}"

    for fmt, tag in (("%b %d, %Y", "MMM DD, YYYY"), ("%d %b %Y", "DD MMM YYYY"), ("%d-%b-%Y", "DD-MMM-YYYY")):
        try:
            return datetime.strptime(s, fmt).date(), tag, None
        except ValueError:
            continue
    return None, None, f"Unrecognized date format '{s}'"


def parse_numeric_value(raw: Any) -> tuple[float | None, str | None, str | None, str | None]:
    """Parse multi-locale numeric & currency strings; return (value, currency_code, format_tag, error_reason)."""
    if isinstance(raw, bool):
        return None, None, None, "Boolean cannot be parsed as financial number"
    if isinstance(raw, (int, float)):
        val = float(raw)
        if not math.isfinite(val):
            return None, None, None, "Non-finite numeric value"
        return val, None, "native_number", None

    s = str(raw).replace("\u00a0", " ").strip()
    if s.startswith("#"):
        return None, None, None, f"Spreadsheet error token '{s}'"
    if not s:
        return None, None, None, "Empty numeric value"

    detected_cur: str | None = None
    lower = s.lower()
    for sym, cur_code in CURRENCY_TOKENS.items():
        if sym in lower:
            detected_cur = cur_code
            break

    negative = False
    work = s
    if work.startswith("(") and work.endswith(")"):
        negative = True
        work = work[1:-1].strip()

    # Strip known currency markers
    work = re.sub(r"(?i)\b(?:vnd|usd|eur|gbp|vnđ)\b", "", work)
    work = re.sub(r"[$€£¥₫đ]", "", work).strip()

    if work.startswith("-"):
        negative = not negative
        work = work[1:].strip()
    elif work.startswith("+"):
        work = work[1:].strip()

    multiplier = 1.0
    if work.endswith(("k", "K")):
        multiplier = 1_000.0
        work = work[:-1].strip()
    elif work.endswith(("m", "M")):
        multiplier = 1_000_000.0
        work = work[:-1].strip()
    elif work.endswith(("b", "B")):
        multiplier = 1_000_000_000.0
        work = work[:-1].strip()

    work = work.replace(" ", "")
    if not work:
        return None, detected_cur, None, f"Invalid numeric string '{s}'"

    fmt_tag = "plain"
    if "," in work and "." in work:
        if work.rfind(".") > work.rfind(","):
            work = work.replace(",", "")
            fmt_tag = "us_comma_dot"
        else:
            work = work.replace(".", "").replace(",", ".")
            fmt_tag = "eu_dot_comma"
    elif "." in work:
        if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", work):
            work = work.replace(".", "")
            fmt_tag = "dot_thousands"
        else:
            fmt_tag = "dot_decimal"
    elif "," in work:
        if re.fullmatch(r"\d{1,3}(?:,\d{3})+", work):
            work = work.replace(",", "")
            fmt_tag = "comma_thousands"
        elif work.count(",") == 1 and len(work.split(",")[1]) in {1, 2}:
            work = work.replace(",", ".")
            fmt_tag = "comma_decimal"
        else:
            return None, detected_cur, None, f"Ambiguous comma grouping '{s}'"

    try:
        val = float(work) * multiplier
    except ValueError:
        return None, detected_cur, None, f"Invalid numeric value '{s}'"
    if not math.isfinite(val):
        return None, detected_cur, None, "Non-finite numeric value"
    if negative:
        val = -val
    if detected_cur:
        fmt_tag = f"{detected_cur}:{fmt_tag}"
    return val, detected_cur, fmt_tag, None


def evaluate_and_clean(
    columns: list[str],
    raw_rows: list[dict[str, Any]],
    mapping: dict[str, str],
    *,
    row_numbers: list[int] | None = None,
    custom_fields: list[str] | None = None,
    invalid_row_policy: str = "skip_invalid",
    duplicate_policy: str = "keep_all",
    preferred_currency: str | None = None,
) -> QualityEvaluationResult:
    """
    Inspect every row under the supplied column mapping:
    - Computes completeness, validity, consistency, uniqueness & accuracy scores
    - Never silently discards bad/duplicate records in the quality evaluation
    - Builds cleaned transactional dicts honoring explicit import policies
    """
    total_rows = len(raw_rows)
    row_nums = row_numbers if row_numbers and len(row_numbers) == total_rows else list(range(1, total_rows + 1))

    # Build reverse target -> list of mapped source columns
    target_to_cols: dict[str, list[str]] = {}
    for src_col, tgt in mapping.items():
        if src_col in columns and tgt and tgt != IGNORE_FIELD:
            target_to_cols.setdefault(tgt, []).append(src_col)

    date_col = (target_to_cols.get("date") or [None])[0]
    dayfirst, date_order_ambiguous = _infer_dayfirst([r.get(date_col) for r in raw_rows]) if date_col else (True, False)

    all_issues: list[RowIssue] = []
    warnings: list[str] = []

    if not date_col:
        warnings.append("Missing required mapping: no source column mapped to 'Date'. Map a Date column before importing.")
    if "revenue" not in target_to_cols:
        warnings.append("Missing required mapping: no source column mapped to 'Revenue'. Map a Revenue column before importing.")

    # Column-level tracking
    col_stats: dict[str, dict[str, Any]] = {}
    for col in columns:
        tgt = mapping.get(col, IGNORE_FIELD)
        col_stats[col] = {
            "column": col,
            "mapped_to": tgt,
            "total": total_rows,
            "missing": 0,
            "valid": 0,
            "invalid": 0,
            "unique_values": set(),
            "date_formats": Counter(),
            "numeric_formats": Counter(),
            "currencies": Counter(),
        }

    currency_votes: Counter[str] = Counter()
    seen_row_hashes: dict[tuple[Any, ...], int] = {}
    duplicate_rows_count = 0
    invalid_row_indices: set[int] = set()
    cleaned_candidates: list[tuple[int, dict[str, Any], bool, bool]] = []  # (row_num, cleaned_dict, is_valid, is_duplicate)

    accuracy_checks_applicable = 0
    accuracy_checks_passed = 0
    consistency_penalties = 0

    entity_case_variants: dict[str, dict[str, set[str]]] = {
        field: {} for field in ("product", "category", "region", "channel")
    }

    required_mapped_targets = [t for t in ("date", "revenue") if t in target_to_cols]
    has_cost = "cost" in target_to_cols
    has_profit = "profit" in target_to_cols
    has_qty = "quantity" in target_to_cols

    for idx, raw in enumerate(raw_rows):
        row_num = row_nums[idx]
        row_valid = True
        parsed_canon: dict[str, Any] = {}
        custom_map: dict[str, Any] = {}

        # Count missing across all columns for column metrics, validate mapped columns rigorously
        for col in columns:
            val = raw.get(col)
            st = col_stats[col]
            tgt = st["mapped_to"]
            if _is_missing(val):
                st["missing"] += 1
                if tgt in {"date", "revenue"}:
                    row_valid = False
                    all_issues.append(
                        RowIssue(
                            row_number=row_num,
                            severity="error",
                            column=col,
                            target_field=tgt,
                            issue_code="missing_required_value",
                            raw_value="" if val is None else str(val),
                            message=f"Required field '{CANONICAL_FIELDS[tgt]['label']}' is missing.",
                        )
                    )
                continue

            st["unique_values"].add(str(val).strip())

            if tgt == IGNORE_FIELD or not tgt:
                st["valid"] += 1
                continue

            if tgt.startswith(CUSTOM_PREFIX) or (custom_fields and tgt in custom_fields):
                custom_key = tgt[len(CUSTOM_PREFIX):] if tgt.startswith(CUSTOM_PREFIX) else tgt
                custom_map[custom_key] = str(val).strip()
                st["valid"] += 1
                continue

            if tgt == "date":
                d_val, fmt_tag, err = parse_date_value(val, dayfirst=dayfirst)
                if d_val is None:
                    st["invalid"] += 1
                    row_valid = False
                    all_issues.append(
                        RowIssue(
                            row_number=row_num,
                            severity="error",
                            column=col,
                            target_field="date",
                            issue_code="invalid_date",
                            raw_value=str(val),
                            message=err or "Invalid date value.",
                        )
                    )
                elif d_val.year < 1990 or d_val > date.today() + timedelta(days=366):
                    st["invalid"] += 1
                    row_valid = False
                    all_issues.append(
                        RowIssue(
                            row_number=row_num,
                            severity="error",
                            column=col,
                            target_field="date",
                            issue_code="out_of_range_date",
                            raw_value=str(val),
                            message=f"Date {d_val.isoformat()} is outside plausible business range (1990 to +1y).",
                        )
                    )
                else:
                    st["valid"] += 1
                    if fmt_tag:
                        st["date_formats"][fmt_tag] += 1
                    parsed_canon["date"] = d_val
            elif tgt in {"revenue", "cost", "profit", "quantity", "marketing_spend", "inventory"}:
                num_val, cur_code, num_fmt, err = parse_numeric_value(val)
                if num_val is None:
                    st["invalid"] += 1
                    row_valid = False
                    all_issues.append(
                        RowIssue(
                            row_number=row_num,
                            severity="error",
                            column=col,
                            target_field=tgt,
                            issue_code="invalid_number",
                            raw_value=str(val),
                            message=err or f"Invalid numeric format for '{tgt}'.",
                        )
                    )
                else:
                    if cur_code:
                        st["currencies"][cur_code] += 1
                        currency_votes[cur_code] += 1
                    if num_fmt:
                        st["numeric_formats"][num_fmt] += 1
                    if tgt in {"quantity", "marketing_spend", "inventory", "cost"} and num_val < 0:
                        st["invalid"] += 1
                        row_valid = False
                        all_issues.append(
                            RowIssue(
                                row_number=row_num,
                                severity="error",
                                column=col,
                                target_field=tgt,
                                issue_code="negative_nonnegative_field",
                                raw_value=str(val),
                                message=f"Field '{CANONICAL_FIELDS[tgt]['label']}' cannot be negative ({num_val}).",
                            )
                        )
                    elif tgt == "revenue" and num_val < 0:
                        st["invalid"] += 1
                        row_valid = False
                        all_issues.append(
                            RowIssue(
                                row_number=row_num,
                                severity="error",
                                column=col,
                                target_field="revenue",
                                issue_code="negative_revenue",
                                raw_value=str(val),
                                message=f"Negative revenue ({num_val}) flagged for explicit credit/refund handling.",
                            )
                        )
                    else:
                        st["valid"] += 1
                        parsed_canon[tgt] = num_val
            else:
                text_val = " ".join(str(val).split())
                if len(text_val) > 160:
                    text_val = text_val[:160]
                if str(val) != text_val:
                    consistency_penalties += 1
                if tgt in entity_case_variants:
                    entity_case_variants[tgt].setdefault(text_val.lower(), set()).add(text_val)
                st["valid"] += 1
                parsed_canon[tgt] = text_val

        # Verifiable cross-field accuracy checks
        rev = parsed_canon.get("revenue")
        cost = parsed_canon.get("cost")
        profit = parsed_canon.get("profit")
        qty = parsed_canon.get("quantity")

        if has_cost and has_profit and rev is not None and cost is not None and profit is not None:
            accuracy_checks_applicable += 1
            expected_profit = rev - cost
            tol = max(1.0, abs(rev) * 0.015)
            if abs(expected_profit - profit) > tol:
                all_issues.append(
                    RowIssue(
                        row_number=row_num,
                        severity="warning",
                        column=(target_to_cols.get("profit") or ["profit"])[0],
                        target_field="profit",
                        issue_code="profit_mismatch",
                        raw_value=f"rev={rev}, cost={cost}, profit={profit}",
                        message=f"Profit ({profit:,.2f}) does not reconcile with Revenue - Cost ({expected_profit:,.2f}).",
                    )
                )
            else:
                accuracy_checks_passed += 1

        if has_qty and qty is not None and rev is not None:
            accuracy_checks_applicable += 1
            if qty == 0 and rev > 0:
                all_issues.append(
                    RowIssue(
                        row_number=row_num,
                        severity="warning",
                        column=(target_to_cols.get("quantity") or ["quantity"])[0],
                        target_field="quantity",
                        issue_code="zero_qty_with_revenue",
                        raw_value=str(qty),
                        message="Quantity is 0 while Revenue is positive.",
                    )
                )
            else:
                accuracy_checks_passed += 1

        # Uniqueness / Duplicate check over business attributes + raw fingerprint
        sig_key = tuple(
            (k, str(raw.get(k, "")).strip())
            for k in columns
            if mapping.get(k, IGNORE_FIELD) != IGNORE_FIELD
        )
        if not sig_key:
            sig_key = tuple((k, str(raw.get(k, "")).strip()) for k in columns)
        first_seen_row = seen_row_hashes.get(sig_key)
        is_duplicate = False
        if first_seen_row is not None:
            is_duplicate = True
            duplicate_rows_count += 1
            all_issues.append(
                RowIssue(
                    row_number=row_num,
                    severity="warning",
                    column="*",
                    target_field="record",
                    issue_code="duplicate_record",
                    raw_value=f"Matches row {first_seen_row}",
                    message=f"Duplicate record of row {first_seen_row}.",
                )
            )
        else:
            seen_row_hashes[sig_key] = row_num

        if not row_valid:
            invalid_row_indices.add(row_num)

        # Build canonical normalized transaction record
        qty_clean = float(qty) if qty is not None else 1.0
        rev_clean = float(rev) if rev is not None else 0.0
        if has_cost and not has_profit and cost is not None:
            cost_clean = float(cost)
            profit_clean: float | None = rev_clean - cost_clean
        elif has_profit and not has_cost and profit is not None:
            profit_clean = float(profit)
            cost_clean = max(0.0, rev_clean - profit_clean)
        elif has_cost and has_profit:
            cost_clean = float(cost) if cost is not None else 0.0
            profit_clean = float(profit) if profit is not None else (rev_clean - cost_clean)
        else:
            cost_clean = 0.0
            profit_clean = None

        unit_price = (rev_clean / qty_clean) if qty_clean > 0 else rev_clean
        unit_cost = (cost_clean / qty_clean) if qty_clean > 0 else cost_clean

        cleaned_record = {
            "row_num": row_num,
            "date": parsed_canon.get("date"),
            "product": parsed_canon.get("product") or "All Products",
            "category": parsed_canon.get("category") or "Uncategorized",
            "customer": parsed_canon.get("customer") or f"Row-{row_num}",
            "region": parsed_canon.get("region") or "All Regions",
            "channel": parsed_canon.get("channel") or "Direct",
            "quantity": max(1, int(round(qty_clean))) if qty_clean >= 1 else (0 if qty == 0 else 1),
            "unit_price": round(unit_price, 4),
            "revenue": round(rev_clean, 4),
            "unit_cost": round(unit_cost, 4),
            "total_cost": round(cost_clean, 4),
            "gross_profit": round(profit_clean, 4) if profit_clean is not None else None,
            "marketing_spend": round(float(parsed_canon["marketing_spend"]), 4) if "marketing_spend" in parsed_canon else None,
            "inventory_level": int(round(float(parsed_canon["inventory"]))) if "inventory" in parsed_canon else None,
            "custom_fields_json": custom_map or None,
        }
        cleaned_candidates.append((row_num, cleaned_record, row_valid, is_duplicate))

    # Summarize column consistency warnings
    inconsistent_date_columns: list[dict[str, Any]] = []
    mixed_currency_columns: list[dict[str, Any]] = []
    column_metrics: list[dict[str, Any]] = []

    mapped_cells = 0
    missing_mapped_cells = 0
    valid_mapped_cells = 0
    total_nonempty_mapped_cells = 0

    for col in columns:
        st = col_stats[col]
        tgt = st["mapped_to"]
        is_mapped = tgt and tgt != IGNORE_FIELD
        if is_mapped:
            mapped_cells += total_rows
            missing_mapped_cells += st["missing"]
            non_empty = total_rows - st["missing"]
            total_nonempty_mapped_cells += non_empty
            valid_mapped_cells += st["valid"]

        if len(st["date_formats"]) > 1:
            formats_dict = dict(st["date_formats"])
            inconsistent_date_columns.append({"column": col, "formats": formats_dict})
            consistency_penalties += max(1, total_rows // 10)
            warnings.append(
                f"Inconsistent date formats detected in column '{col}': {', '.join(f'{k} ({v})' for k, v in formats_dict.items())}."
            )
        if date_order_ambiguous and tgt == "date":
            warnings.append(
                f"Slash/dash dates in '{col}' have values <= 12 in both positions; interpreted as DD/MM/YYYY by default."
            )
        if len(st["currencies"]) > 1:
            cur_dict = dict(st["currencies"])
            mixed_currency_columns.append({"column": col, "currencies": cur_dict})
            consistency_penalties += max(1, total_rows // 10)
            warnings.append(
                f"Multiple currency symbols found in '{col}': {', '.join(cur_dict.keys())}."
            )

        completeness_col = round(((total_rows - st["missing"]) / max(1, total_rows)) * 100, 1)
        non_empty_col = total_rows - st["missing"]
        validity_col = round((st["valid"] / max(1, non_empty_col)) * 100, 1) if non_empty_col else 100.0
        column_metrics.append(
            {
                "column": col,
                "mapped_to": tgt,
                "total_rows": total_rows,
                "missing_values": st["missing"],
                "valid_values": st["valid"],
                "invalid_values": st["invalid"],
                "unique_values": len(st["unique_values"]),
                "completeness_pct": completeness_col,
                "validity_pct": validity_col,
                "detected_formats": dict(st["date_formats"] or st["numeric_formats"]),
                "currencies": dict(st["currencies"]),
            }
        )

    for entity_field, groups in entity_case_variants.items():
        mixed_cases = [list(variants) for variants in groups.values() if len(variants) > 1]
        if mixed_cases:
            consistency_penalties += len(mixed_cases)
            warnings.append(
                f"Inconsistent capitalization/spacing in '{entity_field}' (e.g., {', '.join(mixed_cases[0][:3])})."
            )

    if duplicate_rows_count:
        warnings.append(f"Detected {duplicate_rows_count} duplicate record(s). Choose whether to keep or deduplicate before importing.")
    if invalid_row_indices:
        warnings.append(
            f"Detected {len(invalid_row_indices)} row(s) with missing required values or invalid types/dates. "
            "No records will be dropped without your explicit import confirmation."
        )

    completeness_score = round(((mapped_cells - missing_mapped_cells) / max(1, mapped_cells)) * 100, 1) if mapped_cells else 0.0
    validity_score = round((valid_mapped_cells / max(1, total_nonempty_mapped_cells)) * 100, 1) if total_nonempty_mapped_cells else 0.0
    uniqueness_score = round(((total_rows - duplicate_rows_count) / max(1, total_rows)) * 100, 1) if total_rows else 0.0
    consistency_ratio = max(0.0, 1.0 - (consistency_penalties / max(1, total_rows * max(1, len(columns) // 2))))
    consistency_score = round(consistency_ratio * 100, 1)
    accuracy_score = round((accuracy_checks_passed / accuracy_checks_applicable) * 100, 1) if accuracy_checks_applicable else validity_score

    overall_score = round(
        0.25 * completeness_score
        + 0.30 * validity_score
        + 0.15 * consistency_score
        + 0.15 * uniqueness_score
        + 0.15 * accuracy_score,
        1,
    )

    # Apply requested explicit cleaning selection for downstream import
    cleaned_rows: list[dict[str, Any]] = []
    skipped_invalid_count = 0
    deduplicated_count = 0
    for row_num, rec, is_valid, is_duplicate in cleaned_candidates:
        if not is_valid:
            if invalid_row_policy == "fail_on_error":
                continue
            skipped_invalid_count += 1
            continue
        if is_duplicate and duplicate_policy == "deduplicate":
            deduplicated_count += 1
            continue
        cleaned_rows.append(rec)

    valid_dates = [r["date"] for r in cleaned_rows if r["date"] is not None]
    date_start = min(valid_dates) if valid_dates else None
    date_end = max(valid_dates) if valid_dates else None

    detected_currency = preferred_currency or (currency_votes.most_common(1)[0][0] if currency_votes else "USD")
    mapped_canon = {t for t in mapping.values() if t in CANONICAL_FIELDS}
    capabilities = compute_capabilities(mapped_canon)
    capabilities["day_span"] = ((date_end - date_start).days + 1) if date_start and date_end else 0

    invalid_rows_count = len(invalid_row_indices)
    valid_rows_count = total_rows - invalid_rows_count
    issue_counts = Counter(issue.issue_code for issue in all_issues)

    report = {
        "overall_score": overall_score,
        "dimensions": {
            "completeness": completeness_score,
            "validity": validity_score,
            "consistency": consistency_score,
            "uniqueness": uniqueness_score,
            "accuracy": accuracy_score,
        },
        "total_rows": total_rows,
        "valid_rows": valid_rows_count,
        "invalid_rows": invalid_rows_count,
        "missing_values": missing_mapped_cells,
        "duplicate_records": duplicate_rows_count,
        "detected_currency": detected_currency,
        "required_mapping_satisfied": len(required_mapped_targets) == 2,
        "inconsistent_date_formats": inconsistent_date_columns,
        "mixed_currency_formats": mixed_currency_columns,
        "warnings": list(dict.fromkeys(warnings)),
        "issue_breakdown": dict(issue_counts),
        "column_quality": column_metrics,
        "sample_errors": [issue.to_dict() for issue in all_issues[:100]],
        "total_issues": len(all_issues),
        "date_start": date_start.isoformat() if date_start else None,
        "date_end": date_end.isoformat() if date_end else None,
        "capabilities": capabilities,
        "cleaning_summary": {
            "invalid_row_policy": invalid_row_policy,
            "duplicate_policy": duplicate_policy,
            "skipped_invalid_rows": skipped_invalid_count,
            "deduplicated_rows": deduplicated_count,
            "importable_rows": len(cleaned_rows),
        },
    }

    return QualityEvaluationResult(
        report=report,
        cleaned_rows=cleaned_rows,
        all_issues=all_issues,
        detected_currency=detected_currency,
        capabilities=capabilities,
        date_start=date_start,
        date_end=date_end,
    )


def render_error_report_csv(issues: list[RowIssue] | list[dict[str, Any]]) -> bytes:
    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(["row_number", "severity", "column", "target_field", "issue_code", "raw_value", "message"])
    for item in issues:
        d = item.to_dict() if isinstance(item, RowIssue) else item
        writer.writerow(
            [
                d.get("row_number"),
                d.get("severity"),
                neutralize_csv_cell(d.get("column")),
                neutralize_csv_cell(d.get("target_field")),
                neutralize_csv_cell(d.get("issue_code")),
                neutralize_csv_cell(d.get("raw_value")),
                neutralize_csv_cell(d.get("message")),
            ]
        )
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def render_error_report_json(report: dict[str, Any], issues: list[RowIssue] | list[dict[str, Any]]) -> bytes:
    payload = {
        "summary": {
            "overall_score": report.get("overall_score"),
            "total_rows": report.get("total_rows"),
            "valid_rows": report.get("valid_rows"),
            "invalid_rows": report.get("invalid_rows"),
            "duplicate_records": report.get("duplicate_records"),
            "warnings": report.get("warnings"),
        },
        "issues": [item.to_dict() if isinstance(item, RowIssue) else item for item in issues],
    }
    return json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")

