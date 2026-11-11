"""Tabular Processor for CSV, XLSX, XLS, JSON, XML using Pandas profiling & schema suggestions."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

from backend.app.ingestion.mapper import CANONICAL_FIELDS, suggest_column_mapping
from backend.app.ingestion.parsers import parse_uploaded_dataset
from backend.app.ingestion.quality import evaluate_and_clean


MAX_INDIVIDUAL_EXTRACTED_ROWS = 200


def process_tabular_bytes(
    blob: bytes,
    filename: str,
    *,
    source_id: str,
    templates: list[dict[str, Any]] | None = None,
    sheet_name: str | None = None,
) -> dict[str, Any]:
    """Parse structured tabular data (CSV, XLSX, XLS, JSON, XML), profile with Pandas, and produce extracted records."""
    parsed = parse_uploaded_dataset(blob, filename, sheet_name=sheet_name, limit=None)
    df = pd.DataFrame(parsed.rows, columns=parsed.columns)
    missing_cells = int(df.isna().sum().sum() + (df == "").sum().sum()) if not df.empty else 0
    duplicate_rows = int(df.duplicated().sum()) if not df.empty else 0
    dtypes = {str(col): str(dtype) for col, dtype in df.dtypes.items()}

    suggestions = suggest_column_mapping(parsed.columns, parsed.rows[:200], templates=templates)
    mapping = suggestions["suggested_mapping"]
    quality = evaluate_and_clean(
        parsed.columns,
        parsed.rows,
        mapping,
        row_numbers=parsed.row_numbers,
        invalid_row_policy="skip_invalid",
        duplicate_policy="keep_all",
    )

    extracted: list[dict[str, Any]] = []
    mapped_canon = {t for t in mapping.values() if t in CANONICAL_FIELDS}
    has_required = {"date", "revenue"}.issubset(mapped_canon)

    if len(parsed.rows) <= MAX_INDIVIDUAL_EXTRACTED_ROWS:
        cleaned_by_rownum = {r["row_num"]: r for r in quality.cleaned_rows}
        issue_rows = {iss["row_number"] for iss in quality.all_issues if iss.get("severity") == "error"}
        for idx, raw_row in enumerate(parsed.rows):
            rnum = parsed.row_numbers[idx] if idx < len(parsed.row_numbers) else (idx + 1)
            cleaned_row = cleaned_by_rownum.get(rnum)
            is_err = rnum in issue_rows
            if cleaned_row and has_required:
                data = {
                    "date": cleaned_row["date"].isoformat() if cleaned_row.get("date") else None,
                    "product": cleaned_row.get("product"),
                    "category": cleaned_row.get("category"),
                    "quantity": cleaned_row.get("quantity"),
                    "revenue": cleaned_row.get("revenue"),
                    "cost": cleaned_row.get("total_cost"),
                    "profit": cleaned_row.get("gross_profit"),
                    "customer": cleaned_row.get("customer"),
                    "region": cleaned_row.get("region"),
                    "channel": cleaned_row.get("channel"),
                    "marketing_spend": cleaned_row.get("marketing_spend"),
                    "inventory": cleaned_row.get("inventory_level"),
                    "currency": quality.detected_currency,
                    "custom_fields": cleaned_row.get("custom_fields_json"),
                }
                conf = 0.96 if not is_err else 0.52
                needs_review = bool(is_err)
            else:
                data = {str(k): v for k, v in raw_row.items()}
                conf = 0.60 if has_required else 0.50
                needs_review = True
            extracted.append({
                "entity_type": "transaction" if has_required else "tabular_row",
                "confidence_score": conf,
                "extraction_method": f"pandas_{parsed.file_format}_parser",
                "source_location": {
                    "file": filename,
                    "sheet": parsed.selected_sheet,
                    "row": rnum,
                },
                "raw_payload": {str(k): v for k, v in raw_row.items()},
                "extracted_data": data,
                "needs_human_review": needs_review,
                "transformation_history": [{
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "action": "column_mapping_applied",
                    "mapping_confirmed_by_human": False,
                }],
            })
    else:
        # Large structured dataset (>200 rows): store summary + top preview sample rows for fast approval
        for cleaned_row in quality.cleaned_rows[:50]:
            extracted.append({
                "entity_type": "transaction",
                "confidence_score": 0.95,
                "extraction_method": f"pandas_{parsed.file_format}_parser",
                "source_location": {"file": filename, "sheet": parsed.selected_sheet, "row": cleaned_row["row_num"]},
                "raw_payload": {"row_num": cleaned_row["row_num"]},
                "extracted_data": {
                    "date": cleaned_row["date"].isoformat() if cleaned_row.get("date") else None,
                    "product": cleaned_row.get("product"),
                    "category": cleaned_row.get("category"),
                    "quantity": cleaned_row.get("quantity"),
                    "revenue": cleaned_row.get("revenue"),
                    "cost": cleaned_row.get("total_cost"),
                    "profit": cleaned_row.get("gross_profit"),
                    "customer": cleaned_row.get("customer"),
                    "region": cleaned_row.get("region"),
                    "channel": cleaned_row.get("channel"),
                    "currency": quality.detected_currency,
                },
                "needs_human_review": False,
                "transformation_history": [],
            })

    metadata = {
        "file_format": parsed.file_format,
        "columns": parsed.columns,
        "dtypes": dtypes,
        "sheets": parsed.sheets,
        "selected_sheet": parsed.selected_sheet,
        "row_count": parsed.total_rows,
        "missing_cells": missing_cells,
        "duplicate_rows": duplicate_rows,
        "detected_currency": quality.detected_currency,
        "quality_score": quality.report["overall_score"],
        "valid_rows": quality.report["valid_rows"],
        "invalid_rows": quality.report["invalid_rows"],
        "suggested_mapping": mapping,
        "parse_warnings": parsed.parse_warnings + quality.report["warnings"],
    }
    return {
        "extraction_status": "completed" if quality.report["valid_rows"] > 0 else "partial",
        "metadata": metadata,
        "parsed": parsed,
        "quality": quality,
        "extracted_records": extracted,
    }

