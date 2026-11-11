"""Document Processor for PDF (native + scanned OCR fallback), DOCX, PPTX, and TXT with strict page/slide provenance."""
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
import logging
import os
from typing import Any

from docx import Document as DocxDocument
import pymupdf
from pptx import Presentation

from backend.app.ingestion.mapper import CANONICAL_FIELDS, suggest_column_mapping
from backend.app.ingestion.parsers import _decode_text
from backend.app.ingestion.quality import evaluate_and_clean
from backend.app.multimodal.ocr_and_extractors import (
    extract_business_entities_from_text,
    run_local_ocr_image_bytes,
)

log = logging.getLogger(__name__)
MAX_PDF_PAGES = int(os.getenv("MULTIMODAL_MAX_PDF_PAGES", "80"))


def _records_from_table_grid(
    grid: list[list[str]],
    *,
    filename: str,
    location: dict[str, Any],
    extraction_method: str,
    table_confidence: float,
) -> list[dict[str, Any]]:
    cleaned_rows = [[str(cell or "").replace("\n", " ").strip() for cell in row] for row in grid]
    cleaned_rows = [r for r in cleaned_rows if any(c != "" for c in r)]
    if len(cleaned_rows) < 2:
        return []
    raw_headers = cleaned_rows[0]
    headers = [h if h else f"column_{idx + 1}" for idx, h in enumerate(raw_headers)]
    dict_rows: list[dict[str, Any]] = []
    for row in cleaned_rows[1:]:
        padded = row[: len(headers)] + [""] * max(0, len(headers) - len(row))
        if any(c != "" for c in padded):
            dict_rows.append(dict(zip(headers, padded)))
    if not dict_rows:
        return []

    sugg = suggest_column_mapping(headers, dict_rows[:50])
    mapping = sugg["suggested_mapping"]
    mapped_canon = {t for t in mapping.values() if t in CANONICAL_FIELDS}
    out: list[dict[str, Any]] = []

    if {"date", "revenue"}.issubset(mapped_canon) or {"product", "revenue"}.issubset(mapped_canon):
        qual = evaluate_and_clean(headers, dict_rows, mapping, invalid_row_policy="skip_invalid", duplicate_policy="keep_all")
        cleaned_by_rn = {r["row_num"]: r for r in qual.cleaned_rows}
        for r_idx, raw_r in enumerate(dict_rows, start=1):
            c_row = cleaned_by_rn.get(r_idx)
            if c_row:
                data = {
                    "date": c_row["date"].isoformat() if c_row.get("date") else None,
                    "product": c_row.get("product"),
                    "category": c_row.get("category"),
                    "quantity": c_row.get("quantity"),
                    "revenue": c_row.get("revenue"),
                    "cost": c_row.get("total_cost"),
                    "profit": c_row.get("gross_profit"),
                    "customer": c_row.get("customer"),
                    "region": c_row.get("region"),
                    "channel": c_row.get("channel"),
                    "currency": qual.detected_currency,
                    "title": f"{filename} · Row {r_idx}",
                }
                conf = round(table_confidence if c_row.get("date") else max(0.55, table_confidence - 0.18), 3)
            else:
                data = raw_r
                conf = round(max(0.45, table_confidence - 0.25), 3)
            out.append({
                "entity_type": "transaction" if c_row and c_row.get("date") else "table_row",
                "confidence_score": conf,
                "extraction_method": extraction_method,
                "source_location": {**location, "table_row": r_idx},
                "raw_payload": raw_r,
                "extracted_data": data,
                "needs_human_review": conf < 0.85,
                "transformation_history": [{
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "action": "document_table_mapped",
                    "columns": headers,
                }],
            })
        return out

    # Non-sales table: emit structured key-value rows honestly
    for r_idx, raw_r in enumerate(dict_rows, start=1):
        out.append({
            "entity_type": "table_row",
            "confidence_score": round(max(0.65, table_confidence - 0.1), 3),
            "extraction_method": extraction_method,
            "source_location": {**location, "table_row": r_idx},
            "raw_payload": raw_r,
            "extracted_data": {
                **raw_r,
                "title": " · ".join(f"{k}: {v}" for k, v in list(raw_r.items())[:3] if v)[:180],
                "summary": " | ".join(f"{k}={v}" for k, v in raw_r.items() if v)[:400],
            },
            "needs_human_review": True,
            "transformation_history": [],
        })
    return out


def _process_pdf(blob: bytes, filename: str, *, source_id: str, consent_external_ai: bool) -> dict[str, Any]:
    doc = pymupdf.open(stream=blob, filetype="pdf")
    try:
        total_pages = doc.page_count
        pages_to_scan = min(total_pages, MAX_PDF_PAGES)
        records: list[dict[str, Any]] = []
        page_summaries: list[dict[str, Any]] = []
        scanned_pages: list[int] = []
        ocr_engines_used: set[str] = set()
        warnings: list[str] = []
        if total_pages > MAX_PDF_PAGES:
            warnings.append(f"PDF has {total_pages} pages; truncated extraction at {MAX_PDF_PAGES} page cap.")

        for p_idx in range(pages_to_scan):
            page_num = p_idx + 1
            page = doc.load_page(p_idx)
            native_text = (page.get_text("text") or "").strip()
            used_ocr = False
            ocr_engine = None
            page_conf = 0.91

            # Extract structured native tables first
            tables_found = 0
            try:
                finder = page.find_tables()
                for t_idx, tbl in enumerate(finder.tables if finder else [], start=1):
                    grid = tbl.extract() or []
                    t_recs = _records_from_table_grid(
                        grid,
                        filename=filename,
                        location={"file": filename, "page": page_num, "table_index": t_idx},
                        extraction_method="pymupdf_table_extract",
                        table_confidence=0.91,
                    )
                    if t_recs:
                        tables_found += 1
                        records.extend(t_recs)
            except Exception as exc:
                log.debug("PDF table finder skipped page %d: %s", page_num, exc)

            effective_text = native_text
            # Scanned PDF fallback: page has near-zero selectable text -> rasterize & run real OCR
            if len("".join(native_text.split())) < 20:
                pix = page.get_pixmap(matrix=pymupdf.Matrix(2.0, 2.0), alpha=False)
                png_bytes = pix.tobytes("png")
                ocr_res = run_local_ocr_image_bytes(png_bytes, consent_external_ai=consent_external_ai)
                if ocr_res.text:
                    effective_text = ocr_res.text
                    used_ocr = True
                    ocr_engine = ocr_res.engine
                    page_conf = ocr_res.confidence or 0.78
                    scanned_pages.append(page_num)
                    ocr_engines_used.add(ocr_res.engine)
                elif ocr_res.warnings:
                    warnings.extend([f"Page {page_num}: {w}" for w in ocr_res.warnings])

            if effective_text and tables_found == 0:
                ent_recs = extract_business_entities_from_text(
                    effective_text,
                    source_id=source_id,
                    modality="document",
                    extraction_method=f"pdf_ocr_{ocr_engine}" if used_ocr else "pymupdf_pdf_text",
                    source_location={"file": filename, "page": page_num, "scanned_ocr": used_ocr},
                    base_confidence=page_conf,
                )
                records.extend(ent_recs)
            elif effective_text and tables_found > 0:
                # Also capture any summary metrics/narrative outside the table on that page
                non_table_ents = extract_business_entities_from_text(
                    effective_text,
                    source_id=source_id,
                    modality="document",
                    extraction_method="pymupdf_pdf_text",
                    source_location={"file": filename, "page": page_num, "scanned_ocr": used_ocr},
                    base_confidence=page_conf,
                )
                for e in non_table_ents:
                    if e["entity_type"].endswith("_insight") or e["entity_type"] == "invoice":
                        records.append(e)

            page_summaries.append({
                "page": page_num,
                "char_count": len(effective_text),
                "tables_extracted": tables_found,
                "scanned_ocr": used_ocr,
                "ocr_engine": ocr_engine,
                "excerpt": effective_text[:280],
            })

        pdf_meta = {k: str(v) for k, v in (doc.metadata or {}).items() if v}
    finally:
        doc.close()

    status = "completed" if records else "partial"
    if not records:
        warnings.append("PDF contained no extractable selectable text or recognizable OCR text.")
    return {
        "extraction_status": status,
        "metadata": {
            "format": "pdf",
            "page_count": total_pages,
            "pages_scanned": pages_to_scan,
            "scanned_ocr_pages": scanned_pages,
            "ocr_engines": sorted(ocr_engines_used),
            "pdf_metadata": pdf_meta,
            "page_summaries": page_summaries[:15],
            "warnings": warnings,
        },
        "extracted_records": records,
    }


def _process_docx(blob: bytes, filename: str, *, source_id: str) -> dict[str, Any]:
    doc = DocxDocument(BytesIO(blob))
    records: list[dict[str, Any]] = []
    para_texts: list[tuple[int, str]] = []
    for p_idx, para in enumerate(doc.paragraphs, start=1):
        txt = (para.text or "").strip()
        if txt:
            para_texts.append((p_idx, txt))

    for t_idx, table in enumerate(doc.tables, start=1):
        grid = [[cell.text.strip() for cell in row.cells] for row in table.rows]
        t_recs = _records_from_table_grid(
            grid,
            filename=filename,
            location={"file": filename, "table_index": t_idx},
            extraction_method="python_docx_table",
            table_confidence=0.92,
        )
        records.extend(t_recs)

    joined_text = "\n".join(txt for _, txt in para_texts)
    if joined_text.strip():
        loc = {
            "file": filename,
            "paragraph_start": para_texts[0][0],
            "paragraph_end": para_texts[-1][0],
        }
        ents = extract_business_entities_from_text(
            joined_text,
            source_id=source_id,
            modality="document",
            extraction_method="python_docx_text",
            source_location=loc,
            base_confidence=0.90,
        )
        records.extend(ents)

    warnings = [] if records else ["DOCX document contained no readable paragraphs or tables."]
    return {
        "extraction_status": "completed" if records else "partial",
        "metadata": {
            "format": "docx",
            "paragraph_count": len(para_texts),
            "table_count": len(doc.tables),
            "excerpt": joined_text[:500],
            "warnings": warnings,
        },
        "extracted_records": records,
    }


def _process_pptx(blob: bytes, filename: str, *, source_id: str) -> dict[str, Any]:
    prs = Presentation(BytesIO(blob))
    records: list[dict[str, Any]] = []
    slide_summaries: list[dict[str, Any]] = []

    for s_idx, slide in enumerate(prs.slides, start=1):
        slide_texts: list[str] = []
        tables_cnt = 0
        for sh_idx, shape in enumerate(slide.shapes, start=1):
            if getattr(shape, "has_table", False) and shape.table is not None:
                grid = [[cell.text.strip() for cell in row.cells] for row in shape.table.rows]
                t_recs = _records_from_table_grid(
                    grid,
                    filename=filename,
                    location={"file": filename, "slide": s_idx, "shape_index": sh_idx},
                    extraction_method="python_pptx_table",
                    table_confidence=0.91,
                )
                if t_recs:
                    tables_cnt += 1
                    records.extend(t_recs)
            if getattr(shape, "has_text_frame", False) and shape.text_frame is not None:
                txt = "\n".join(p.text.strip() for p in shape.text_frame.paragraphs if p.text.strip())
                if txt:
                    slide_texts.append(txt)
        if getattr(slide, "has_notes_slide", False) and slide.notes_slide and slide.notes_slide.notes_text_frame:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                slide_texts.append(f"[Speaker Notes] {notes}")

        combined = "\n".join(slide_texts).strip()
        if combined:
            ents = extract_business_entities_from_text(
                combined,
                source_id=source_id,
                modality="document",
                extraction_method="python_pptx_slide",
                source_location={"file": filename, "slide": s_idx},
                base_confidence=0.89,
            )
            records.extend(ents)
        slide_summaries.append({"slide": s_idx, "tables": tables_cnt, "excerpt": combined[:240]})

    warnings = [] if records else ["PPTX presentation contained no readable slide text or tables."]
    return {
        "extraction_status": "completed" if records else "partial",
        "metadata": {
            "format": "pptx",
            "slide_count": len(prs.slides),
            "slide_summaries": slide_summaries[:20],
            "warnings": warnings,
        },
        "extracted_records": records,
    }


def _process_txt(blob: bytes, filename: str, *, source_id: str) -> dict[str, Any]:
    text, encoding = _decode_text(blob)
    lines = text.splitlines()
    non_empty = [(idx + 1, ln.strip()) for idx, ln in enumerate(lines) if ln.strip()]
    records: list[dict[str, Any]] = []
    if non_empty:
        # Check for pipe/tab structured table inside TXT
        if sum(1 for _, ln in non_empty[:10] if "|" in ln or "\t" in ln) >= 2:
            sep = "|" if non_empty[0][1].count("|") >= non_empty[0][1].count("\t") else "\t"
            grid = [[c.strip() for c in ln.strip(sep + " ").split(sep)] for _, ln in non_empty]
            records.extend(
                _records_from_table_grid(
                    grid,
                    filename=filename,
                    location={"file": filename, "line_start": non_empty[0][0], "line_end": non_empty[-1][0]},
                    extraction_method="txt_delimited_table",
                    table_confidence=0.89,
                )
            )
        if not records:
            ents = extract_business_entities_from_text(
                "\n".join(ln for _, ln in non_empty),
                source_id=source_id,
                modality="document",
                extraction_method="utf_text_parser",
                source_location={"file": filename, "line_start": non_empty[0][0], "line_end": non_empty[-1][0]},
                base_confidence=0.87,
            )
            records.extend(ents)
    warnings = [] if records else ["TXT file contained no non-empty content."]
    return {
        "extraction_status": "completed" if records else "partial",
        "metadata": {
            "format": "txt",
            "encoding": encoding,
            "line_count": len(lines),
            "non_empty_lines": len(non_empty),
            "excerpt": text[:500],
            "warnings": warnings,
        },
        "extracted_records": records,
    }


def process_document_bytes(
    blob: bytes,
    filename: str,
    ext: str,
    *,
    source_id: str,
    consent_external_ai: bool = False,
) -> dict[str, Any]:
    if ext == "pdf":
        return _process_pdf(blob, filename, source_id=source_id, consent_external_ai=consent_external_ai)
    if ext == "docx":
        return _process_docx(blob, filename, source_id=source_id)
    if ext == "pptx":
        return _process_pptx(blob, filename, source_id=source_id)
    if ext == "txt":
        return _process_txt(blob, filename, source_id=source_id)
    raise ValueError(f"Unsupported document format: {ext}")

