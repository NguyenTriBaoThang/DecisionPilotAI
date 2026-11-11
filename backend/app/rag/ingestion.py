"""RAG Document Ingestion & Synchronization Service: Tabular, PDF/DOCX/PPTX/TXT, OCR Images, Audio/Video Transcripts & Dataset Knowledge."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
import logging
from typing import Any
from uuid import uuid4

from docx import Document as DocxDocument
from fastapi import HTTPException
from pptx import Presentation
import pymupdf
import sqlalchemy as sa

from backend.app.analytics import dataset_info, grouped, marketing_summary, sales_total
from backend.app.db import (
    audit,
    companies,
    enterprise_datasets,
    extracted_records,
    multimodal_files,
    rag_chunks,
    rag_documents,
    tenant_multimodal_insights,
)
from backend.app.ingestion.parsers import IngestionValidationError, parse_uploaded_dataset, safe_filename
from backend.app.ingestion.storage import ObjectStorage, get_object_storage
from backend.app.multimodal.audio import process_audio_bytes
from backend.app.multimodal.image import process_image_bytes
from backend.app.multimodal.ocr_and_extractors import run_local_ocr_image_bytes
from backend.app.multimodal.security import EICAR_SIGNATURE, MODALITY_BY_EXT, max_bytes_for_modality
from backend.app.multimodal.video import process_video_bytes
from backend.app.rag.chunking import (
    ChunkCandidate,
    TextSegment,
    chunk_segments,
    split_structure_sections,
    table_chunk_rows,
)
from backend.app.rag.config import extract_concepts, get_rag_settings, term_frequencies, tokenize
from backend.app.rag.embeddings import EmbeddingProvider, get_embedding_provider
from backend.app.rag.security import sanitize_retrieved_text
from backend.app.rag.vector_store import get_vector_store

log = logging.getLogger(__name__)

SUPPORTED_RAG_EXTS = {
    "pdf", "docx", "pptx", "txt", "md",
    "csv", "xlsx", "xls", "json", "xml",
    "jpg", "jpeg", "png", "webp",
    "mp3", "wav", "m4a",
    "mp4", "mov", "avi",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def infer_domain(text: str, explicit_domain: str | None = None) -> str:
    if explicit_domain and explicit_domain in {"sales", "finance", "marketing", "inventory", "operations", "executive", "general"}:
        return explicit_domain
    concepts = extract_concepts(text[:3000])
    if "concept_marketing" in concepts:
        return "marketing"
    if "concept_inventory" in concepts:
        return "inventory"
    if "concept_profit" in concepts or "concept_cost" in concepts:
        return "finance"
    if "concept_revenue" in concepts or "concept_orders" in concepts:
        return "sales"
    if "concept_policy" in concepts:
        return "operations"
    return "general"


def _doc_type_for_ext(ext: str) -> str:
    if ext in {"jpg", "jpeg", "png", "webp"}:
        return "image_ocr"
    if ext in {"mp3", "wav", "m4a"}:
        return "audio_transcript"
    if ext in {"mp4", "mov", "avi"}:
        return "video_transcript"
    return ext


def _table_grid_to_markdown(grid: list[list[Any]]) -> str:
    rows = [[str(c or "").replace("\n", " ").strip() for c in r] for r in grid]
    rows = [r for r in rows if any(cell != "" for cell in r)]
    if len(rows) < 2:
        return "\n".join(" | ".join(r) for r in rows)
    headers = [h if h else f"col_{i+1}" for i, h in enumerate(rows[0])]
    md_lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for r in rows[1:]:
        padded = r[: len(headers)] + [""] * max(0, len(headers) - len(r))
        md_lines.append("| " + " | ".join(padded) + " |")
    return "\n".join(md_lines)


def extract_segments_from_bytes(
    blob: bytes,
    filename: str,
    *,
    company_id: str,
    dataset_id: str | None,
    consent_external_ai: bool = False,
) -> tuple[list[TextSegment], dict[str, Any]]:
    """Extract structured, metadata-rich text/table segments from any supported file format without raw binary vectorization."""
    clean_name = safe_filename(filename)
    ext = clean_name.rsplit(".", 1)[-1].lower() if "." in clean_name else "txt"
    max_limit = max_bytes_for_modality(MODALITY_BY_EXT.get(ext, "document"))
    if len(blob) > max_limit:
        raise HTTPException(413, f"File exceeds maximum RAG upload limit ({max_limit // (1024 * 1024)} MiB).")
    if ext not in SUPPORTED_RAG_EXTS:
        raise HTTPException(422, f"Unsupported RAG file extension '.{ext}'. Supported formats: {', '.join(sorted(SUPPORTED_RAG_EXTS))}.")

    if EICAR_SIGNATURE in blob:
        raise HTTPException(422, "Upload rejected: malware/EICAR signature detected.")

    segments: list[TextSegment] = []
    meta: dict[str, Any] = {"file_name": clean_name, "format": ext}

    if ext == "pdf":
        doc = pymupdf.open(stream=blob, filetype="pdf")
        try:
            meta["page_count"] = doc.page_count
            scanned_pages: list[int] = []
            for p_idx in range(min(doc.page_count, 80)):
                page_num = p_idx + 1
                page = doc.load_page(p_idx)
                text = (page.get_text("text") or "").strip()
                used_ocr = False
                if len("".join(text.split())) < 20:
                    pix = page.get_pixmap(matrix=pymupdf.Matrix(2.0, 2.0), alpha=False)
                    ocr_res = run_local_ocr_image_bytes(pix.tobytes("png"), consent_external_ai=consent_external_ai)
                    if ocr_res.text:
                        text = ocr_res.text
                        used_ocr = True
                        scanned_pages.append(page_num)
                if text:
                    page_segs = split_structure_sections(text, default_page=page_num)
                    for ps in page_segs:
                        ps.metadata["scanned_ocr"] = used_ocr
                        segments.append(ps)
                try:
                    finder = page.find_tables()
                    for t_idx, tbl in enumerate(finder.tables if finder else [], start=1):
                        grid = tbl.extract() or []
                        md = _table_grid_to_markdown(grid)
                        if md.strip():
                            segments.append(
                                TextSegment(
                                    text=md,
                                    page_number=page_num,
                                    section=f"Page {page_num} · Table {t_idx}",
                                    is_table=True,
                                    metadata={"table_index": t_idx},
                                )
                            )
                except Exception:
                    pass
            meta["scanned_ocr_pages"] = scanned_pages
        finally:
            doc.close()

    elif ext == "docx":
        doc = DocxDocument(BytesIO(blob))
        para_buf: list[str] = []
        current_heading: str | None = None
        for p in doc.paragraphs:
            txt = (p.text or "").strip()
            if not txt:
                continue
            style_name = getattr(getattr(p, "style", None), "name", "") or ""
            if style_name.lower().startswith("heading"):
                if para_buf:
                    segments.append(TextSegment(text="\n".join(para_buf), section=current_heading))
                    para_buf = []
                current_heading = txt[:180]
            else:
                para_buf.append(txt)
        if para_buf:
            segments.append(TextSegment(text="\n".join(para_buf), section=current_heading))
        for t_idx, tbl in enumerate(doc.tables, start=1):
            grid = [[cell.text.strip() for cell in row.cells] for row in tbl.rows]
            md = _table_grid_to_markdown(grid)
            if md.strip():
                segments.append(TextSegment(text=md, section=f"Table {t_idx}", is_table=True))
        meta["table_count"] = len(doc.tables)

    elif ext == "pptx":
        prs = Presentation(BytesIO(blob))
        meta["slide_count"] = len(prs.slides)
        for s_idx, slide in enumerate(prs.slides, start=1):
            title_txt = ""
            if getattr(slide.shapes, "title", None) and slide.shapes.title.text:
                title_txt = slide.shapes.title.text.strip()
            slide_parts: list[str] = []
            for shape in slide.shapes:
                if getattr(shape, "has_table", False) and shape.table is not None:
                    grid = [[c.text.strip() for c in r.cells] for r in shape.table.rows]
                    md = _table_grid_to_markdown(grid)
                    if md.strip():
                        segments.append(
                            TextSegment(
                                text=md,
                                page_number=s_idx,
                                section=title_txt or f"Slide {s_idx}",
                                is_table=True,
                            )
                        )
                if getattr(shape, "has_text_frame", False) and shape.text_frame is not None:
                    t = "\n".join(p.text.strip() for p in shape.text_frame.paragraphs if p.text.strip())
                    if t and t != title_txt:
                        slide_parts.append(t)
            if getattr(slide, "has_notes_slide", False) and slide.notes_slide and slide.notes_slide.notes_text_frame:
                notes = slide.notes_slide.notes_text_frame.text.strip()
                if notes:
                    slide_parts.append(f"Speaker Notes: {notes}")
            if slide_parts or title_txt:
                segments.append(
                    TextSegment(
                        text="\n".join([title_txt, *slide_parts]).strip(),
                        page_number=s_idx,
                        section=title_txt or f"Slide {s_idx}",
                    )
                )

    elif ext in {"txt", "md"}:
        try:
            decoded = blob.decode("utf-8")
        except UnicodeDecodeError:
            decoded = blob.decode("utf-8", errors="replace")
        segments.extend(split_structure_sections(decoded))

    elif ext in {"csv", "xlsx", "xls", "json", "xml"}:
        try:
            parsed = parse_uploaded_dataset(blob, clean_name, limit=400)
        except IngestionValidationError as exc:
            raise HTTPException(422, str(exc)) from exc
        meta["columns"] = parsed.columns
        meta["total_rows"] = parsed.total_rows
        summary_txt = (
            f"Tabular Dataset File: {clean_name} ({ext.upper()})\n"
            f"Total Rows: {parsed.total_rows} | Columns ({len(parsed.columns)}): {', '.join(parsed.columns)}"
        )
        segments.append(TextSegment(text=summary_txt, section="Schema & File Overview"))
        for tbl_slice in table_chunk_rows(parsed.columns, parsed.rows[:250], section=clean_name):
            segments.append(TextSegment(text=tbl_slice, section=f"{clean_name} · Records", is_table=True))

    elif ext in {"jpg", "jpeg", "png", "webp"}:
        img_res = process_image_bytes(
            blob, clean_name, ext, source_id="rag-ingest", consent_external_ai=consent_external_ai
        )
        meta.update(img_res.get("metadata") or {})
        ocr_text = ((img_res.get("metadata") or {}).get("ocr_text_preview") or "").strip()
        recs = img_res.get("extracted_records") or []
        full_ocr = ""
        for r in recs:
            txt_cand = (r.get("extracted_data") or {}).get("ocr_text") or (r.get("extracted_data") or {}).get("summary") or ""
            if len(str(txt_cand)) > len(full_ocr):
                full_ocr = str(txt_cand)
        body = full_ocr or ocr_text or f"Image capture {clean_name} analyzed locally ({meta.get('classification', 'visual')})."
        segments.append(TextSegment(text=body, page_number=1, section="Image OCR & Extracted Content"))

    elif ext in {"mp3", "wav", "m4a"}:
        aud_res = process_audio_bytes(blob, clean_name, ext, source_id="rag-ingest", consent_external_ai=consent_external_ai)
        meta.update(aud_res.get("metadata") or {})
        for r in aud_res.get("extracted_records") or []:
            ed = r.get("extracted_data") or {}
            txt = ed.get("transcript") or ed.get("summary") or ""
            if txt:
                segments.append(TextSegment(text=str(txt), section=f"Audio ({meta.get('stt_status', 'audio')})"))

    elif ext in {"mp4", "mov", "avi"}:
        store = get_object_storage()
        vid_res = process_video_bytes(
            blob,
            clean_name,
            ext,
            company_id=company_id,
            dataset_id=dataset_id or "rag-media",
            file_id=f"rag-{uuid4().hex[:10]}",
            source_id="rag-ingest",
            storage=store,
            max_frames=6,
            consent_external_ai=consent_external_ai,
        )
        meta.update(vid_res.get("metadata") or {})
        for r in vid_res.get("extracted_records") or []:
            ed = r.get("extracted_data") or {}
            txt = ed.get("summary") or ed.get("ocr_text") or ""
            if txt:
                segments.append(TextSegment(text=str(txt), section=f"Video Frame ({r.get('source_location', {}).get('timestamp_sec', 0)}s)"))

    return segments, meta


def _persist_document_and_chunks(
    conn: sa.Connection,
    *,
    document_id: str,
    company_id: str,
    dataset_id: str | None,
    source_file_id: str | None,
    source_type: str,
    file_name: str,
    mime_type: str | None,
    document_type: str,
    domain: str,
    checksum_sha256: str,
    candidates: list[ChunkCandidate],
    allowed_roles: list[str],
    metadata: dict[str, Any],
    actor: str,
    embedder: EmbeddingProvider,
    dialect_name: str,
) -> dict[str, Any]:
    now = _utc_now()
    # Replace existing doc with identical ID or (company_id, source_file_id, source_type) cleanly
    if source_file_id:
        existing_ids = list(
            conn.scalars(
                sa.select(rag_documents.c.id).where(
                    rag_documents.c.company_id == company_id,
                    rag_documents.c.source_file_id == source_file_id,
                    rag_documents.c.source_type == source_type,
                )
            )
        )
        for old_id in existing_ids:
            conn.execute(rag_chunks.delete().where(rag_chunks.c.document_id == old_id))
            conn.execute(rag_documents.delete().where(rag_documents.c.id == old_id))

    existing_doc = conn.scalar(sa.select(rag_documents.c.id).where(rag_documents.c.id == document_id))
    if existing_doc:
        conn.execute(rag_chunks.delete().where(rag_chunks.c.document_id == document_id))
        conn.execute(rag_documents.delete().where(rag_documents.c.id == document_id))

    clean_texts = [sanitize_retrieved_text(c.content) for c in candidates]
    embeddings = embedder.embed_texts(clean_texts) if clean_texts else []
    full_content_hash = hashlib.sha256("\n".join(clean_texts).encode("utf-8")).hexdigest()
    total_chars = sum(len(t) for t in clean_texts)
    access_perms = {"roles": allowed_roles, "company_id": company_id, "dataset_id": dataset_id}

    conn.execute(
        rag_documents.insert().values(
            id=document_id,
            company_id=company_id,
            dataset_id=dataset_id,
            source_file_id=source_file_id,
            source_type=source_type,
            file_name=file_name[:255],
            mime_type=mime_type,
            document_type=document_type,
            domain=domain,
            language="auto",
            checksum_sha256=checksum_sha256,
            content_hash=full_content_hash,
            status="indexed" if candidates else "empty",
            chunk_count=len(candidates),
            char_count=total_chars,
            access_permissions_json=access_perms,
            metadata_json=metadata,
            created_by=actor[:100],
            created_at=now,
            updated_at=now,
        )
    )

    chunk_rows: list[dict[str, Any]] = []
    for idx, (cand, clean_txt, vec) in enumerate(zip(candidates, clean_texts, embeddings)):
        chunk_id = f"chk-{hashlib.sha1(f'{document_id}:{idx}:{cand.content_hash}'.encode('utf-8')).hexdigest()[:20]}"
        toks = tokenize(clean_txt, include_stopwords=False, include_concepts=True)
        sparse_tf = term_frequencies(toks)
        chunk_rows.append({
            "id": chunk_id,
            "document_id": document_id,
            "company_id": company_id,
            "dataset_id": dataset_id,
            "chunk_index": cand.chunk_index,
            "content": clean_txt,
            "content_hash": cand.content_hash,
            "token_count": cand.token_count,
            "source_file": cand.source_file[:255],
            "page_number": cand.page_number,
            "section": cand.section[:200] if cand.section else None,
            "document_type": cand.document_type,
            "domain": cand.domain,
            "chunking_strategy": cand.chunking_strategy,
            "embedding_provider": embedder.provider_name,
            "embedding_dim": len(vec) if vec else embedder.dimension,
            "embedding_json": vec,
            "sparse_terms_json": sparse_tf,
            "access_permissions_json": access_perms,
            "metadata_json": {**cand.metadata, "source_url": metadata.get("source_url")},
            "created_at": now,
        })

    if chunk_rows:
        conn.execute(rag_chunks.insert(), chunk_rows)
        store = get_vector_store(dialect_name)
        store.upsert_external_vectors(chunk_rows)

    return {
        "document_id": document_id,
        "company_id": company_id,
        "dataset_id": dataset_id,
        "file_name": file_name,
        "document_type": document_type,
        "domain": domain,
        "chunk_count": len(chunk_rows),
        "char_count": total_chars,
        "embedding_provider": embedder.provider_name,
        "status": "indexed" if chunk_rows else "empty",
        "created_at": now.isoformat(),
    }


def ingest_uploaded_document(
    engine: sa.Engine,
    *,
    company_id: str,
    file_name: str,
    blob: bytes,
    mime_type: str | None = None,
    dataset_id: str | None = None,
    domain: str | None = None,
    chunking_strategy: str = "auto",
    allowed_roles: list[str] | None = None,
    consent_external_ai: bool = False,
    actor: str = "workspace-user",
) -> dict[str, Any]:
    """Ingest, normalize, chunk, embed, and store any uploaded document/media/tabular file for Hybrid RAG."""
    if not blob:
        raise HTTPException(422, "Uploaded document is empty.")

    clean_name = safe_filename(file_name)
    ext = clean_name.rsplit(".", 1)[-1].lower() if "." in clean_name else "txt"
    max_limit = max_bytes_for_modality(MODALITY_BY_EXT.get(ext, "document"))
    if len(blob) > max_limit:
        raise HTTPException(413, f"File exceeds maximum RAG upload limit ({max_limit // (1024 * 1024)} MiB).")
    doc_type = _doc_type_for_ext(ext)
    checksum = hashlib.sha256(blob).hexdigest()

    segments, meta = extract_segments_from_bytes(
        blob,
        clean_name,
        company_id=company_id,
        dataset_id=dataset_id,
        consent_external_ai=consent_external_ai,
    )
    if not segments:
        raise HTTPException(422, f"No readable text or structured tables could be extracted from '{clean_name}'.")

    full_preview = "\n".join(s.text for s in segments[:6])
    resolved_domain = infer_domain(full_preview, explicit_domain=domain)
    settings = get_rag_settings()
    embedder = get_embedding_provider()

    candidates = chunk_segments(
        segments,
        source_file=clean_name,
        document_type=doc_type,
        domain=resolved_domain,
        strategy=chunking_strategy,
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        embedder=embedder,
    )
    if not candidates:
        raise HTTPException(422, f"Extracted content from '{clean_name}' produced zero indexable chunks.")

    roles = allowed_roles or ["viewer", "analyst", "admin"]
    doc_id = f"ragdoc-{uuid4().hex[:14]}"
    with engine.begin() as conn:
        res = _persist_document_and_chunks(
            conn,
            document_id=doc_id,
            company_id=company_id,
            dataset_id=dataset_id,
            source_file_id=None,
            source_type="rag_upload",
            file_name=clean_name,
            mime_type=mime_type,
            document_type=doc_type,
            domain=resolved_domain,
            checksum_sha256=checksum,
            candidates=candidates,
            allowed_roles=roles,
            metadata=meta,
            actor=actor,
            embedder=embedder,
            dialect_name=conn.dialect.name,
        )
        conn.execute(
            audit.insert().values(
                company_id=company_id,
                kind="rag_ingested",
                subject=doc_id,
                payload={"file_name": clean_name, "dataset_id": dataset_id, "chunks": len(candidates), "domain": resolved_domain, "actor": actor},
            )
        )
    return res


def ingest_text_document(
    engine: sa.Engine,
    *,
    company_id: str,
    title: str,
    text: str,
    dataset_id: str | None = None,
    document_type: str = "txt",
    domain: str | None = None,
    chunking_strategy: str = "auto",
    allowed_roles: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
    actor: str = "workspace-user",
) -> dict[str, Any]:
    clean_text = (text or "").strip()
    if not clean_text:
        raise HTTPException(422, "Document text cannot be empty.")

    segments = split_structure_sections(clean_text)
    resolved_domain = infer_domain(clean_text, explicit_domain=domain)
    settings = get_rag_settings()
    embedder = get_embedding_provider()

    candidates = chunk_segments(
        segments,
        source_file=title,
        document_type=document_type,
        domain=resolved_domain,
        strategy=chunking_strategy,
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        embedder=embedder,
    )
    checksum = hashlib.sha256(clean_text.encode("utf-8")).hexdigest()
    doc_id = f"ragdoc-{uuid4().hex[:14]}"
    with engine.begin() as conn:
        res = _persist_document_and_chunks(
            conn,
            document_id=doc_id,
            company_id=company_id,
            dataset_id=dataset_id,
            source_file_id=None,
            source_type="knowledge_note",
            file_name=title,
            mime_type="text/plain",
            document_type=document_type,
            domain=resolved_domain,
            checksum_sha256=checksum,
            candidates=candidates,
            allowed_roles=allowed_roles or ["viewer", "analyst", "admin"],
            metadata=metadata or {},
            actor=actor,
            embedder=embedder,
            dialect_name=conn.dialect.name,
        )
    return res


def index_multimodal_file(
    engine: sa.Engine,
    *,
    company_id: str,
    file_id: str,
    actor: str = "system",
) -> dict[str, Any] | None:
    """Sync extracted records & insights from an approved/extracted multimodal file into the Hybrid RAG store."""
    with engine.connect() as conn:
        frow = conn.execute(
            sa.select(multimodal_files).where(multimodal_files.c.id == file_id, multimodal_files.c.company_id == company_id)
        ).mappings().first()
        if not frow:
            return None
        recs = [
            dict(r)
            for r in conn.execute(
                sa.select(extracted_records)
                .where(extracted_records.c.file_id == file_id, extracted_records.c.company_id == company_id)
                .order_by(extracted_records.c.id.asc())
            ).mappings()
        ]
        insights = [
            dict(r)
            for r in conn.execute(
                sa.select(tenant_multimodal_insights)
                .where(tenant_multimodal_insights.c.source_file_id == file_id, tenant_multimodal_insights.c.company_id == company_id)
            ).mappings()
        ]

    segments: list[TextSegment] = []
    meta = dict(frow.get("source_metadata_json") or {})
    meta["source_url"] = f"/api/v1/files/{file_id}/content"

    for idx, rec in enumerate(recs, start=1):
        if rec["validation_status"] == "rejected":
            continue
        eff = {**(rec.get("extracted_json") or {}), **(rec.get("corrected_json") or {})}
        loc = rec.get("source_location_json") or {}
        page = loc.get("page") or loc.get("slide") or (1 if frow["modality"] == "image" else None)
        sec = f"{rec['entity_type'].replace('_', ' ').title()} #{idx}"
        lines: list[str] = []
        if eff.get("title"):
            lines.append(f"Title: {eff['title']}")
        if eff.get("summary"):
            lines.append(str(eff["summary"]))
        if eff.get("ocr_text"):
            lines.append(f"OCR Text:\n{eff['ocr_text']}")
        if eff.get("transcript"):
            lines.append(f"Transcript:\n{eff['transcript']}")
        kv_pairs = [
            f"{k}: {eff[k]}"
            for k in ("date", "product", "category", "quantity", "revenue", "cost", "profit", "customer", "region", "channel", "currency")
            if eff.get(k) is not None and str(eff.get(k)).strip() != ""
        ]
        if kv_pairs:
            lines.append("Extracted Fields: " + " | ".join(kv_pairs))
        text_block = "\n".join(lines).strip()
        if text_block:
            segments.append(
                TextSegment(
                    text=text_block,
                    page_number=int(page) if isinstance(page, int) else None,
                    section=sec,
                    metadata={"extraction_id": rec["id"], "confidence": rec.get("confidence_score"), "source_location": loc},
                )
            )

    for ins in insights:
        loc = ins.get("source_location_json") or {}
        page = loc.get("page") or loc.get("slide")
        text_block = f"{ins['title']}\n{ins['summary_text']}"
        if ins.get("metrics_json"):
            text_block += "\nMetrics: " + json.dumps(ins["metrics_json"], ensure_ascii=False)
        segments.append(
            TextSegment(
                text=text_block,
                page_number=int(page) if isinstance(page, int) else None,
                section=f"Approved Insight ({ins['modality']})",
                metadata={"insight_id": ins["id"], "confidence": ins.get("confidence_score")},
            )
        )

    if not segments:
        return None

    full_txt = "\n".join(s.text for s in segments)
    domain = infer_domain(full_txt)
    doc_type = _doc_type_for_ext(frow["file_format"])
    settings = get_rag_settings()
    embedder = get_embedding_provider()
    candidates = chunk_segments(
        segments,
        source_file=frow["file_name"],
        document_type=doc_type,
        domain=domain,
        strategy="auto",
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        embedder=embedder,
    )
    doc_id = f"ragmm-{file_id[:48]}"
    with engine.begin() as conn:
        return _persist_document_and_chunks(
            conn,
            document_id=doc_id,
            company_id=company_id,
            dataset_id=frow["dataset_id"],
            source_file_id=file_id,
            source_type="multimodal_file",
            file_name=frow["file_name"],
            mime_type=frow["mime_type"],
            document_type=doc_type,
            domain=domain,
            checksum_sha256=frow["checksum_sha256"],
            candidates=candidates,
            allowed_roles=["viewer", "analyst", "admin"],
            metadata=meta,
            actor=actor,
            embedder=embedder,
            dialect_name=conn.dialect.name,
        )


def index_enterprise_dataset(
    engine: sa.Engine,
    *,
    company_id: str,
    dataset_id: str | None = None,
    actor: str = "system",
) -> dict[str, Any] | None:
    """Index active/specified structured dataset's schema, KPI summary, top products/regions/channels as searchable RAG knowledge."""
    with engine.connect() as conn:
        try:
            info = dataset_info(conn, company_id=company_id, dataset_id=dataset_id)
        except HTTPException:
            return None
        if not info.get("start") or not info.get("end"):
            return None

        from datetime import date

        start_d = date.fromisoformat(info["start"])
        end_d = date.fromisoformat(info["end"])
        tot = sales_total(conn, start_d, end_d, {}, info=info)
        top_prods = grouped(conn, start_d, end_d, {}, "product", 10, info=info)
        top_regions = grouped(conn, start_d, end_d, {}, "region", 10, info=info)
        top_channels = grouped(conn, start_d, end_d, {}, "channel", 10, info=info)
        mkt_tot, mkt_channels = marketing_summary(conn, start_d, end_d, info=info) if (info.get("capabilities") or {}).get("has_marketing", True) else (None, [])

    did = info["dataset_id"]
    cur = info.get("currency", "USD")
    segments: list[TextSegment] = [
        TextSegment(
            text=(
                f"Workspace Dataset Profile: {info.get('title', did)} (dataset_id={did}, company_id={company_id})\n"
                f"Date Coverage: {info['start']} to {info['end']} | Currency: {cur} | Storage Mode: {info.get('storage_mode')}\n"
                f"Total Revenue: {tot.get('revenue')} | Gross Profit: {tot.get('gross_profit')} | "
                f"Margin: {round((tot['margin'] or 0) * 100, 2) if tot.get('margin') is not None else 'N/A'}% | "
                f"Orders: {tot.get('orders')} | Units: {tot.get('units')} | AOV: {round(tot['aov'], 2) if tot.get('aov') else 'N/A'}"
            ),
            section="Dataset Executive KPI Overview",
        )
    ]

    if top_prods:
        rows = [[r["name"], r["revenue"], r.get("gross_profit"), r.get("units"), r.get("orders")] for r in top_prods]
        for s in table_chunk_rows(["Product", f"Revenue ({cur})", "Gross Profit", "Units", "Orders"], rows, section="Top Products Summary"):
            segments.append(TextSegment(text=s, section="Top Products Summary", is_table=True))

    if top_regions:
        rows = [[r["name"], r["revenue"], r.get("gross_profit"), r.get("orders")] for r in top_regions]
        for s in table_chunk_rows(["Region", f"Revenue ({cur})", "Gross Profit", "Orders"], rows, section="Regional Breakdown"):
            segments.append(TextSegment(text=s, section="Regional Breakdown", is_table=True))

    if top_channels:
        rows = [[r["name"], r["revenue"], r.get("orders")] for r in top_channels]
        for s in table_chunk_rows(["Sales Channel", f"Revenue ({cur})", "Orders"], rows, section="Sales Channel Breakdown"):
            segments.append(TextSegment(text=s, section="Sales Channel Breakdown", is_table=True))

    if mkt_channels:
        rows = [
            [
                r.get("name") or r.get("channel") or "Unknown",
                r.get("spend"),
                r.get("attributed_revenue"),
                round(r["roas"], 2) if r.get("roas") is not None else None,
                r.get("orders"),
            ]
            for r in mkt_channels
        ]
        for s in table_chunk_rows(["Marketing Channel", f"Spend ({cur})", "Attributed Revenue", "ROAS", "Orders"], rows, section="Marketing Channel ROAS Summary"):
            segments.append(TextSegment(text=s, section="Marketing Channel ROAS Summary", is_table=True))

    settings = get_rag_settings()
    embedder = get_embedding_provider()
    candidates = chunk_segments(
        segments,
        source_file=f"{info.get('title', did)} (Dataset Summary)",
        document_type="dataset_profile",
        domain="executive",
        strategy="auto",
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        embedder=embedder,
    )
    doc_id = f"ragds-{did[:48]}"
    checksum = hashlib.sha256(f"{did}:{info['start']}:{info['end']}:{tot.get('revenue')}".encode("utf-8")).hexdigest()
    with engine.begin() as conn:
        return _persist_document_and_chunks(
            conn,
            document_id=doc_id,
            company_id=company_id,
            dataset_id=did,
            source_file_id=did,
            source_type="enterprise_dataset",
            file_name=f"{info.get('title', did)} (Dataset Summary)",
            mime_type="application/json",
            document_type="dataset_profile",
            domain="executive",
            checksum_sha256=checksum,
            candidates=candidates,
            allowed_roles=["viewer", "analyst", "admin"],
            metadata={"storage_mode": info.get("storage_mode"), "currency": cur, "start": info["start"], "end": info["end"]},
            actor=actor,
            embedder=embedder,
            dialect_name=conn.dialect.name,
        )


def list_documents(
    conn: sa.Connection,
    *,
    company_id: str,
    dataset_id: str | None = None,
    document_type: str | None = None,
    domain: str | None = None,
) -> list[dict[str, Any]]:
    q = sa.select(rag_documents).where(rag_documents.c.company_id == company_id).order_by(rag_documents.c.updated_at.desc())
    if dataset_id:
        q = q.where(sa.or_(rag_documents.c.dataset_id == dataset_id, rag_documents.c.dataset_id.is_(None)))
    if document_type:
        q = q.where(rag_documents.c.document_type == document_type)
    if domain:
        q = q.where(rag_documents.c.domain == domain)
    rows = conn.execute(q).mappings().all()
    return [
        {
            "id": r["id"],
            "company_id": r["company_id"],
            "dataset_id": r["dataset_id"],
            "source_file_id": r["source_file_id"],
            "source_type": r["source_type"],
            "file_name": r["file_name"],
            "mime_type": r["mime_type"],
            "document_type": r["document_type"],
            "domain": r["domain"],
            "status": r["status"],
            "chunk_count": int(r["chunk_count"]),
            "char_count": int(r["char_count"]),
            "metadata": r.get("metadata_json") or {},
            "created_by": r["created_by"],
            "created_at": r["created_at"].isoformat() if hasattr(r.get("created_at"), "isoformat") else r.get("created_at"),
            "updated_at": r["updated_at"].isoformat() if hasattr(r.get("updated_at"), "isoformat") else r.get("updated_at"),
        }
        for r in rows
    ]


def get_document_detail(conn: sa.Connection, *, company_id: str, document_id: str) -> dict[str, Any]:
    doc = conn.execute(
        sa.select(rag_documents).where(rag_documents.c.id == document_id)
    ).mappings().first()
    if doc is None:
        raise HTTPException(404, "RAG document not found.")
    if doc["company_id"] != company_id:
        raise HTTPException(403, "Cross-tenant RAG document access denied.")
    chunks = conn.execute(
        sa.select(rag_chunks)
        .where(rag_chunks.c.document_id == document_id, rag_chunks.c.company_id == company_id)
        .order_by(rag_chunks.c.chunk_index.asc())
    ).mappings().all()
    return {
        "document": {
            "id": doc["id"],
            "company_id": doc["company_id"],
            "dataset_id": doc["dataset_id"],
            "source_file_id": doc["source_file_id"],
            "source_type": doc["source_type"],
            "file_name": doc["file_name"],
            "document_type": doc["document_type"],
            "domain": doc["domain"],
            "status": doc["status"],
            "chunk_count": int(doc["chunk_count"]),
            "char_count": int(doc["char_count"]),
            "metadata": doc.get("metadata_json") or {},
            "created_by": doc["created_by"],
            "created_at": doc["created_at"].isoformat() if hasattr(doc.get("created_at"), "isoformat") else doc.get("created_at"),
        },
        "chunks": [
            {
                "id": c["id"],
                "chunk_index": c["chunk_index"],
                "page_number": c.get("page_number"),
                "section": c.get("section"),
                "chunking_strategy": c.get("chunking_strategy"),
                "token_count": c.get("token_count"),
                "content": c["content"],
                "embedding_provider": c["embedding_provider"],
                "embedding_dim": c["embedding_dim"],
            }
            for c in chunks
        ],
    }


def delete_document(engine: sa.Engine, *, company_id: str, document_id: str, actor: str = "workspace-user") -> dict[str, Any]:
    with engine.begin() as conn:
        doc = conn.execute(sa.select(rag_documents).where(rag_documents.c.id == document_id)).mappings().first()
        if doc is None:
            raise HTTPException(404, "RAG document not found.")
        if doc["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant RAG document deletion denied.")
        conn.execute(rag_chunks.delete().where(rag_chunks.c.document_id == document_id, rag_chunks.c.company_id == company_id))
        conn.execute(rag_documents.delete().where(rag_documents.c.id == document_id, rag_documents.c.company_id == company_id))
        conn.execute(
            audit.insert().values(
                company_id=company_id,
                kind="rag_deleted",
                subject=document_id,
                payload={"file_name": doc["file_name"], "actor": actor},
            )
        )
        dialect = conn.dialect.name
    get_vector_store(dialect).delete_external_document(company_id, document_id)
    return {"deleted": True, "document_id": document_id, "file_name": doc["file_name"]}


def delete_by_source(engine: sa.Engine, *, company_id: str, source_file_id: str) -> int:
    with engine.begin() as conn:
        doc_ids = list(
            conn.scalars(
                sa.select(rag_documents.c.id).where(
                    rag_documents.c.company_id == company_id,
                    rag_documents.c.source_file_id == source_file_id,
                )
            )
        )
        for did in doc_ids:
            conn.execute(rag_chunks.delete().where(rag_chunks.c.document_id == did, rag_chunks.c.company_id == company_id))
            conn.execute(rag_documents.delete().where(rag_documents.c.id == did, rag_documents.c.company_id == company_id))
        dialect = conn.dialect.name
    store = get_vector_store(dialect)
    for did in doc_ids:
        store.delete_external_document(company_id, did)
    return len(doc_ids)
