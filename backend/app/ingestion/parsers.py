"""Safe, streaming-friendly parsers for CSV, XLSX, XLS, JSON, and XML enterprise business datasets."""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import date, datetime
from io import BytesIO, StringIO
import json
import os
from pathlib import Path
import re
from typing import Any
from xml.etree.ElementTree import ParseError
from zipfile import BadZipFile, ZipFile

import defusedxml.ElementTree as DefusedET
from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException
import xlrd


SUPPORTED_EXTENSIONS = {"csv", "xlsx", "xls", "json", "xml"}
MAX_FILE_BYTES = int(os.getenv("INGESTION_MAX_FILE_BYTES", 50 * 1024 * 1024))
MAX_UNCOMPRESSED_XLSX_BYTES = int(os.getenv("INGESTION_MAX_UNCOMPRESSED_XLSX_BYTES", 150 * 1024 * 1024))
MAX_COLUMNS = int(os.getenv("INGESTION_MAX_COLUMNS", 250))
MAX_ROWS = int(os.getenv("INGESTION_MAX_ROWS", 250_000))

XLSX_MAGIC = b"PK\x03\x04"
XLS_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
XXE_PATTERN = re.compile(rb"<!(?:DOCTYPE|ENTITY)\b", re.I)
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


class IngestionValidationError(ValueError):
    """Raised when uploaded file bytes violate format, safety, or non-empty requirements."""


class FileTooLargeError(IngestionValidationError):
    """Raised when uploaded payload exceeds configured size limits (maps cleanly to HTTP 413)."""


@dataclass
class ParsedDataset:
    file_format: str
    columns: list[str]
    rows: list[dict[str, Any]]
    total_rows: int
    sheets: list[str] = field(default_factory=list)
    selected_sheet: str | None = None
    encoding: str | None = None
    delimiter: str | None = None
    parse_warnings: list[str] = field(default_factory=list)
    row_numbers: list[int] = field(default_factory=list)


def safe_filename(raw_name: str) -> str:
    cleaned = Path((raw_name or "").replace("\\", "/")).name.strip()
    cleaned = re.sub(r"[\x00-\x1f<>:\"/\\|?*]+", "_", cleaned).strip("._ ")
    if not cleaned:
        raise IngestionValidationError("Filename is required.")
    return cleaned[:180]


def detect_extension(filename: str) -> str:
    clean = safe_filename(filename)
    ext = Path(clean).suffix.lower().lstrip(".")
    if ext not in SUPPORTED_EXTENSIONS:
        raise IngestionValidationError(
            f"Unsupported file format '.{ext or 'unknown'}'. Supported formats: CSV, XLSX, XLS, JSON, XML."
        )
    return ext


def neutralize_csv_cell(value: Any) -> str:
    """Prevent spreadsheet formula injection when exporting error reports back to CSV."""
    text = "" if value is None else str(value)
    if text and text[0] in FORMULA_PREFIXES:
        # Preserve pure negative numbers such as -123.45 cleanly; quote expressions/formulas
        if text[0] == "-" and re.fullmatch(r"-\d+(?:\.\d+)?", text.strip()):
            return text
        return "'" + text
    return text


def validate_upload_bytes(blob: bytes, filename: str) -> tuple[str, str]:
    clean_name = safe_filename(filename)
    ext = detect_extension(clean_name)
    if len(blob) == 0:
        raise IngestionValidationError("Uploaded file is empty (0 bytes).")
    if len(blob) > MAX_FILE_BYTES:
        limit_mb = MAX_FILE_BYTES // (1024 * 1024)
        raise FileTooLargeError(f"Upload exceeds maximum allowed file size ({limit_mb} MiB).")
    if ext == "xlsx":
        if not blob.startswith(XLSX_MAGIC):
            raise IngestionValidationError("Invalid .xlsx file: file signature does not match an OOXML workbook.")
        _inspect_xlsx_zip_safety(blob)
    elif ext == "xls":
        if not blob.startswith(XLS_MAGIC):
            raise IngestionValidationError("Invalid .xls file: file signature does not match an Excel 97-2003 BIFF workbook.")
    elif ext == "csv":
        if b"\x00\x00" in blob[:8192]:
            raise IngestionValidationError("Invalid .csv file: binary null bytes detected.")
    elif ext == "json":
        if b"\x00\x00" in blob[:4096] and not (blob.startswith(b"\xff\xfe") or blob.startswith(b"\xfe\xff")):
            raise IngestionValidationError("Invalid .json file: unexpected binary content.")
    elif ext == "xml":
        if b"\x00\x00" in blob[:4096] and not (blob.startswith(b"\xff\xfe") or blob.startswith(b"\xfe\xff")):
            raise IngestionValidationError("Invalid .xml file: unexpected binary content.")
        if XXE_PATTERN.search(blob[:16384]):
            raise IngestionValidationError("Unsafe XML directive (DOCTYPE/ENTITY) detected in XML payload.")
    return clean_name, ext


def _inspect_xlsx_zip_safety(blob: bytes) -> None:
    try:
        with ZipFile(BytesIO(blob)) as archive:
            infos = archive.infolist()
            if not infos:
                raise IngestionValidationError("Invalid .xlsx archive: workbook is empty.")
            total_uncompressed = sum(max(0, info.file_size) for info in infos)
            if total_uncompressed > MAX_UNCOMPRESSED_XLSX_BYTES:
                raise FileTooLargeError("Uncompressed .xlsx contents exceed safe safety limit.")
            if len(infos) != len({info.filename for info in infos}):
                raise IngestionValidationError("Invalid .xlsx archive: duplicate ZIP entries detected.")
            for info in infos:
                if info.filename.lower().endswith(".xml") and info.file_size <= 5 * 1024 * 1024:
                    head = archive.read(info.filename)[:4096]
                    if XXE_PATTERN.search(head):
                        raise IngestionValidationError("Unsafe XML directive detected inside .xlsx workbook.")
    except (BadZipFile, OSError) as exc:
        raise IngestionValidationError("Corrupted .xlsx workbook archive.") from exc


def _normalize_headers(raw_headers: list[Any], warnings: list[str]) -> list[str]:
    headers: list[str] = []
    seen: dict[str, int] = {}
    blank_count = 0
    for idx, cell in enumerate(raw_headers, start=1):
        name = " ".join(str(cell or "").replace("\ufeff", "").split())
        if not name:
            blank_count += 1
            name = f"column_{idx}"
        name = name[:120]
        count = seen.get(name, 0) + 1
        seen[name] = count
        if count > 1:
            renamed = f"{name}_{count}"
            warnings.append(f"Duplicate header '{name}' automatically disambiguated as '{renamed}'.")
            headers.append(renamed)
        else:
            headers.append(name)
    if blank_count:
        warnings.append(f"{blank_count} unnamed header column(s) were labeled as column_N.")
    if len(headers) > MAX_COLUMNS:
        raise IngestionValidationError(f"Dataset has {len(headers)} columns, exceeding limit of {MAX_COLUMNS}.")
    return headers


def _decode_text(blob: bytes) -> tuple[str, str]:
    for enc in ("utf-8-sig", "utf-8", "utf-16", "cp1252", "latin-1"):
        try:
            return blob.decode(enc), enc
        except UnicodeDecodeError:
            continue
    raise IngestionValidationError("Unable to decode text file with supported character encodings (UTF-8 / CP1252 / Latin-1).")


def _detect_csv_delimiter(sample: str) -> str:
    first_lines = "\n".join(sample.splitlines()[:20])
    try:
        dialect = csv.Sniffer().sniff(first_lines, delimiters=[",", ";", "\t", "|"])
        return dialect.delimiter
    except csv.Error:
        counts = {sep: first_lines.count(sep) for sep in (",", ";", "\t", "|")}
        best = max(counts.items(), key=lambda item: item[1])
        return best[0] if best[1] > 0 else ","


def _parse_csv(blob: bytes, limit: int | None = None) -> ParsedDataset:
    text, encoding = _decode_text(blob)
    if not text.strip():
        raise IngestionValidationError("CSV file contains no content.")
    delimiter = _detect_csv_delimiter(text[:16384])
    warnings: list[str] = []
    reader = csv.reader(StringIO(text), delimiter=delimiter)
    header_row = next(reader, None)
    while header_row is not None and not any(str(c).strip() for c in header_row):
        header_row = next(reader, None)
    if not header_row:
        raise IngestionValidationError("CSV file has no header row.")
    columns = _normalize_headers(header_row, warnings)
    rows: list[dict[str, Any]] = []
    row_numbers: list[int] = []
    total = 0
    extra_cell_rows = 0
    for line_idx, raw_row in enumerate(reader, start=2):
        if not raw_row or not any(str(v).strip() for v in raw_row):
            continue
        total += 1
        if total > MAX_ROWS:
            raise IngestionValidationError(f"Row count exceeds {MAX_ROWS:,} row ingestion limit.")
        if len(raw_row) > len(columns):
            extra_cell_rows += 1
        if limit is None or len(rows) < limit:
            padded = list(raw_row[: len(columns)]) + [None] * max(0, len(columns) - len(raw_row))
            rows.append(dict(zip(columns, padded)))
            row_numbers.append(line_idx)
    if total == 0:
        raise IngestionValidationError("CSV file contains headers but zero data records.")
    if extra_cell_rows:
        warnings.append(f"{extra_cell_rows} row(s) had extra trailing columns beyond the header and were truncated to defined columns.")
    return ParsedDataset(
        file_format="csv",
        columns=columns,
        rows=rows,
        total_rows=total,
        encoding=encoding,
        delimiter=delimiter,
        parse_warnings=warnings,
        row_numbers=row_numbers,
    )


def _format_excel_value(val: Any) -> Any:
    if isinstance(val, datetime):
        if val.hour == 0 and val.minute == 0 and val.second == 0:
            return val.date().isoformat()
        return val.isoformat(sep=" ")
    if isinstance(val, date):
        return val.isoformat()
    if isinstance(val, float) and val.is_integer():
        return int(val)
    return val


def _parse_xlsx(blob: bytes, sheet_name: str | None = None, limit: int | None = None) -> ParsedDataset:
    _inspect_xlsx_zip_safety(blob)
    warnings: list[str] = []
    try:
        book = load_workbook(BytesIO(blob), read_only=True, data_only=True, keep_links=False)
    except (BadZipFile, OSError, ParseError, InvalidFileException, KeyError) as exc:
        raise IngestionValidationError("Failed to read .xlsx workbook. Ensure the file is a valid Excel document.") from exc
    try:
        sheets = list(book.sheetnames)
        if not sheets:
            raise IngestionValidationError("Excel workbook has no worksheets.")
        chosen = sheet_name if sheet_name and sheet_name in sheets else None
        if sheet_name and chosen is None:
            raise IngestionValidationError(f"Worksheet '{sheet_name}' not found. Available sheets: {', '.join(sheets)}.")
        if chosen is None:
            best_fallback = None
            for name in sheets:
                non_empty_rows = 0
                max_cols = 0
                for probe_row in book[name].iter_rows(values_only=True):
                    vals = [v for v in probe_row if v is not None and str(v).strip() != ""]
                    if vals:
                        non_empty_rows += 1
                        max_cols = max(max_cols, len(vals))
                    if non_empty_rows >= 2 and max_cols >= 2:
                        chosen = name
                        break
                if chosen is not None:
                    break
                if non_empty_rows >= 2 and best_fallback is None:
                    best_fallback = name
                elif non_empty_rows >= 1 and best_fallback is None:
                    best_fallback = name
            if chosen is None:
                chosen = best_fallback or sheets[0]
        ws = book[chosen]
        iterator = ws.iter_rows(values_only=True)
        raw_header = next(iterator, None)
        while raw_header is not None and not any(v is not None and str(v).strip() != "" for v in raw_header):
            raw_header = next(iterator, None)
        if not raw_header:
            raise IngestionValidationError(f"Worksheet '{chosen}' is empty.")
        # Trim trailing None cells from header row
        trimmed_header = list(raw_header)
        while trimmed_header and (trimmed_header[-1] is None or str(trimmed_header[-1]).strip() == ""):
            trimmed_header.pop()
        if not trimmed_header:
            raise IngestionValidationError(f"Worksheet '{chosen}' has no valid column headers.")
        columns = _normalize_headers(trimmed_header, warnings)
        rows: list[dict[str, Any]] = []
        row_numbers: list[int] = []
        total = 0
        for r_idx, values in enumerate(iterator, start=2):
            sliced = list(values[: len(columns)]) + [None] * max(0, len(columns) - len(values))
            if not any(v is not None and str(v).strip() != "" for v in sliced):
                continue
            total += 1
            if total > MAX_ROWS:
                raise IngestionValidationError(f"Row count exceeds {MAX_ROWS:,} row ingestion limit.")
            if limit is None or len(rows) < limit:
                rows.append({col: _format_excel_value(val) for col, val in zip(columns, sliced)})
                row_numbers.append(r_idx)
        if total == 0:
            raise IngestionValidationError(f"Worksheet '{chosen}' contains headers but zero data rows.")
        return ParsedDataset(
            file_format="xlsx",
            columns=columns,
            rows=rows,
            total_rows=total,
            sheets=sheets,
            selected_sheet=chosen,
            parse_warnings=warnings,
            row_numbers=row_numbers,
        )
    finally:
        book.close()


def _parse_xls(blob: bytes, sheet_name: str | None = None, limit: int | None = None) -> ParsedDataset:
    warnings: list[str] = []
    try:
        book = xlrd.open_workbook(file_contents=blob)
    except Exception as exc:
        raise IngestionValidationError("Failed to read .xls workbook. Ensure it is a valid Excel 97-2003 BIFF workbook.") from exc
    sheets = list(book.sheet_names())
    if not sheets:
        raise IngestionValidationError("Legacy .xls workbook has no worksheets.")
    chosen = sheet_name if sheet_name and sheet_name in sheets else None
    if sheet_name and chosen is None:
        raise IngestionValidationError(f"Worksheet '{sheet_name}' not found. Available sheets: {', '.join(sheets)}.")
    if chosen is None:
        chosen = next(
            (s for s in sheets if sum(1 for r in range(book.sheet_by_name(s).nrows) if any(str(book.sheet_by_name(s).cell_value(r, c)).strip() != "" for c in range(book.sheet_by_name(s).ncols))) >= 2),
            None,
        ) or next((s for s in sheets if book.sheet_by_name(s).nrows > 0), sheets[0])
    sheet = book.sheet_by_name(chosen)
    if sheet.nrows == 0:
        raise IngestionValidationError(f"Worksheet '{chosen}' is empty.")

    def cell_val(row_idx: int, col_idx: int) -> Any:
        cell = sheet.cell(row_idx, col_idx)
        if cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK):
            return None
        if cell.ctype == xlrd.XL_CELL_DATE:
            dt = xlrd.xldate_as_datetime(cell.value, book.datemode)
            return _format_excel_value(dt)
        if cell.ctype == xlrd.XL_CELL_BOOLEAN:
            return bool(cell.value)
        if cell.ctype == xlrd.XL_CELL_ERROR:
            return "#XL_ERR"
        if cell.ctype == xlrd.XL_CELL_NUMBER and isinstance(cell.value, float) and cell.value.is_integer():
            return int(cell.value)
        return cell.value

    header_row_idx = 0
    raw_header = []
    while header_row_idx < sheet.nrows:
        candidate = [cell_val(header_row_idx, c) for c in range(sheet.ncols)]
        if any(v is not None and str(v).strip() != "" for v in candidate):
            raw_header = candidate
            break
        header_row_idx += 1
    while raw_header and (raw_header[-1] is None or str(raw_header[-1]).strip() == ""):
        raw_header.pop()
    if not raw_header:
        raise IngestionValidationError(f"Worksheet '{chosen}' has no valid headers.")
    columns = _normalize_headers(raw_header, warnings)
    rows: list[dict[str, Any]] = []
    row_numbers: list[int] = []
    total = 0
    for r_idx in range(header_row_idx + 1, sheet.nrows):
        values = [cell_val(r_idx, c) if c < sheet.ncols else None for c in range(len(columns))]
        if not any(v is not None and str(v).strip() != "" for v in values):
            continue
        total += 1
        if total > MAX_ROWS:
            raise IngestionValidationError(f"Row count exceeds {MAX_ROWS:,} row ingestion limit.")
        if limit is None or len(rows) < limit:
            rows.append(dict(zip(columns, values)))
            row_numbers.append(r_idx + 1)
    if total == 0:
        raise IngestionValidationError(f"Worksheet '{chosen}' contains headers but zero data records.")
    return ParsedDataset(
        file_format="xls",
        columns=columns,
        rows=rows,
        total_rows=total,
        sheets=sheets,
        selected_sheet=chosen,
        parse_warnings=warnings,
        row_numbers=row_numbers,
    )


def _flatten_record(item: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, val in item.items():
        if isinstance(val, dict):
            for sub_key, sub_val in val.items():
                if not isinstance(sub_val, (dict, list)):
                    out[f"{key}.{sub_key}"] = sub_val
        elif isinstance(val, list):
            out[str(key)] = json.dumps(val, ensure_ascii=False)
        else:
            out[str(key)] = val
    return out


def _extract_json_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, dict):
        records = None
        for key in ("records", "data", "rows", "items", "transactions", "results", "sales"):
            candidate = payload.get(key)
            if isinstance(candidate, list):
                records = candidate
                break
        if records is None:
            for candidate in payload.values():
                if isinstance(candidate, list) and (not candidate or isinstance(candidate[0], dict)):
                    records = candidate
                    break
        if records is None:
            raise IngestionValidationError("JSON object must contain an array of record objects under 'records', 'data', or 'rows'.")
    else:
        raise IngestionValidationError("JSON root must be an array of objects or an object containing a records array.")
    if not records:
        raise IngestionValidationError("JSON dataset contains zero records.")
    if not all(isinstance(row, dict) for row in records):
        raise IngestionValidationError("Each JSON dataset item must be a key-value object.")
    return [_flatten_record(row) for row in records]


def _parse_json(blob: bytes, limit: int | None = None) -> ParsedDataset:
    text, encoding = _decode_text(blob)
    stripped = text.strip()
    if not stripped:
        raise IngestionValidationError("JSON file is empty.")
    warnings: list[str] = []
    try:
        payload = json.loads(stripped)
        flat_records = _extract_json_records(payload)
    except json.JSONDecodeError:
        # Attempt NDJSON (one JSON object per non-empty line)
        lines = [line.strip() for line in stripped.splitlines() if line.strip()]
        flat_records = []
        try:
            for line in lines:
                obj = json.loads(line)
                if not isinstance(obj, dict):
                    raise IngestionValidationError("NDJSON lines must each be a JSON object.")
                flat_records.append(_flatten_record(obj))
            if flat_records:
                warnings.append("Parsed newline-delimited JSON (NDJSON) stream.")
        except json.JSONDecodeError as exc:
            raise IngestionValidationError("Invalid JSON syntax.") from exc

    total = len(flat_records)
    if total > MAX_ROWS:
        raise IngestionValidationError(f"Row count exceeds {MAX_ROWS:,} row ingestion limit.")
    ordered_keys: list[str] = []
    seen_keys: set[str] = set()
    for rec in flat_records:
        for k in rec.keys():
            if k not in seen_keys:
                seen_keys.add(k)
                ordered_keys.append(k)
                if len(ordered_keys) > MAX_COLUMNS:
                    raise IngestionValidationError(f"Dataset exceeds {MAX_COLUMNS} columns limit.")
    columns = _normalize_headers(ordered_keys, warnings)
    key_to_col = dict(zip(ordered_keys, columns))
    selected = flat_records if limit is None else flat_records[:limit]
    rows = [{key_to_col[k]: rec.get(k) for k in ordered_keys} for rec in selected]
    row_numbers = list(range(1, len(rows) + 1))
    return ParsedDataset(
        file_format="json",
        columns=columns,
        rows=rows,
        total_rows=total,
        encoding=encoding,
        parse_warnings=warnings,
        row_numbers=row_numbers,
    )


def _strip_xml_ns(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def _xml_element_to_flat_dict(el: Any, prefix: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {}
    for attr_k, attr_v in (el.attrib or {}).items():
        clean_k = _strip_xml_ns(str(attr_k))
        col_name = f"{prefix}.{clean_k}" if prefix else clean_k
        out[col_name] = attr_v
    children = list(el)
    if not children:
        txt = (el.text or "").strip()
        if prefix and txt:
            out[prefix] = txt
        elif not prefix and txt:
            out["value"] = txt
        return out
    seen_child_tags: dict[str, int] = {}
    for ch in children:
        tag = _strip_xml_ns(ch.tag)
        seen_child_tags[tag] = seen_child_tags.get(tag, 0) + 1
    for ch in children:
        tag = _strip_xml_ns(ch.tag)
        sub_prefix = f"{prefix}.{tag}" if prefix else tag
        sub_children = list(ch)
        if not sub_children and not ch.attrib:
            val = (ch.text or "").strip()
            if seen_child_tags[tag] > 1:
                existing = out.get(sub_prefix)
                out[sub_prefix] = f"{existing}; {val}" if existing else val
            else:
                out[sub_prefix] = val
        else:
            nested = _xml_element_to_flat_dict(ch, prefix=sub_prefix)
            out.update(nested)
    return out


def _parse_xml(blob: bytes, limit: int | None = None) -> ParsedDataset:
    if XXE_PATTERN.search(blob[:16384]):
        raise IngestionValidationError("Unsafe XML directive (DOCTYPE/ENTITY) detected in XML payload.")
    text, encoding = _decode_text(blob)
    stripped = text.strip()
    if not stripped:
        raise IngestionValidationError("XML file is empty.")
    try:
        root = DefusedET.fromstring(stripped.encode("utf-8"))
    except Exception as exc:
        raise IngestionValidationError(f"Invalid or unsafe XML structure: {type(exc).__name__}") from exc

    children = list(root)
    if not children:
        flat_one = _xml_element_to_flat_dict(root)
        if not flat_one:
            raise IngestionValidationError("XML document contains zero data records.")
        flat_records = [flat_one]
    else:
        # Prefer container child that holds repeated record children (e.g. <report><meta/><rows><row/>...</rows></report>)
        target_nodes: list[Any] | None = None
        tag_counts: dict[str, int] = {}
        for ch in children:
            t = _strip_xml_ns(ch.tag)
            tag_counts[t] = tag_counts.get(t, 0) + 1
        repeated_top = [ch for ch in children if tag_counts[_strip_xml_ns(ch.tag)] > 1]
        if repeated_top:
            target_nodes = repeated_top
        else:
            for ch in children:
                sub = list(ch)
                if len(sub) >= 1 and all(list(gc) or gc.attrib for gc in sub):
                    target_nodes = sub
                    break
            if target_nodes is None:
                if all(not list(ch) and not ch.attrib for ch in children):
                    # Single object represented directly under root attributes/elements
                    target_nodes = [root]
                else:
                    target_nodes = children

        flat_records = []
        for node in target_nodes:
            flat = _xml_element_to_flat_dict(node)
            if any(v is not None and str(v).strip() != "" for v in flat.values()):
                flat_records.append(flat)

    if not flat_records:
        raise IngestionValidationError("XML dataset contains zero non-empty records.")

    total = len(flat_records)
    if total > MAX_ROWS:
        raise IngestionValidationError(f"Row count exceeds {MAX_ROWS:,} row ingestion limit.")

    warnings: list[str] = []
    ordered_keys: list[str] = []
    seen_keys: set[str] = set()
    for rec in flat_records:
        for k in rec.keys():
            if k not in seen_keys:
                seen_keys.add(k)
                ordered_keys.append(k)
                if len(ordered_keys) > MAX_COLUMNS:
                    raise IngestionValidationError(f"Dataset exceeds {MAX_COLUMNS} columns limit.")
    columns = _normalize_headers(ordered_keys, warnings)
    key_to_col = dict(zip(ordered_keys, columns))
    selected = flat_records if limit is None else flat_records[:limit]
    rows = [{key_to_col[k]: rec.get(k) for k in ordered_keys} for rec in selected]
    row_numbers = list(range(1, len(rows) + 1))
    return ParsedDataset(
        file_format="xml",
        columns=columns,
        rows=rows,
        total_rows=total,
        encoding=encoding,
        parse_warnings=warnings,
        row_numbers=row_numbers,
    )


def parse_uploaded_dataset(
    blob: bytes,
    filename: str,
    *,
    sheet_name: str | None = None,
    limit: int | None = None,
) -> ParsedDataset:
    """Validate and parse CSV, XLSX, XLS, JSON, or XML bytes into uniform rows."""
    _, ext = validate_upload_bytes(blob, filename)
    if ext == "csv":
        return _parse_csv(blob, limit=limit)
    if ext == "xlsx":
        return _parse_xlsx(blob, sheet_name=sheet_name, limit=limit)
    if ext == "xls":
        return _parse_xls(blob, sheet_name=sheet_name, limit=limit)
    if ext == "json":
        return _parse_json(blob, limit=limit)
    if ext == "xml":
        return _parse_xml(blob, limit=limit)
    raise IngestionValidationError(f"Unsupported format: {ext}")
