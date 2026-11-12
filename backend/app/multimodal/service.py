"""Orchestration service for multimodal upload, async processing dispatch, HITL review, promotion & shred."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import json
import logging
import re
from typing import Any
from uuid import uuid4

import sqlalchemy as sa
from fastapi import HTTPException

from backend.app.analytics import dataset_info
from backend.app.cache import invalidate_recs_cache
from backend.app.db import (
    audit,
    companies,
    data_sources,
    enterprise_datasets,
    extracted_records,
    ingestion_jobs,
    mapping_templates,
    multimodal_files,
    tenant_customers,
    tenant_inventory_daily,
    tenant_marketing_daily,
    tenant_multimodal_insights,
    tenant_orders,
    tenant_products,
    tenant_transactions,
)
from backend.app.ingestion.mapper import CANONICAL_FIELDS, compute_capabilities
from backend.app.ingestion.parsers import FileTooLargeError, IngestionValidationError, parse_uploaded_dataset
from backend.app.ingestion.quality import evaluate_and_clean, parse_flexible_date, parse_numeric_money
from backend.app.ingestion.service import (
    _ensure_company_and_source,
    _json_safe_iso,
    _log_stage,
    _product_id_map,
    sync_default_legacy_dataset,
    train_partitioned_artifacts,
)
from backend.app.ingestion.storage import ObjectStorage
from backend.app.multimodal.audio import process_audio_bytes
from backend.app.multimodal.document import process_document_bytes
from backend.app.multimodal.image import process_image_bytes
from backend.app.multimodal.jobs import MultimodalJobQueue, serialize_job
from backend.app.multimodal.security import inspect_and_validate_file, sign_file_token
from backend.app.multimodal.tabular import process_tabular_bytes
from backend.app.multimodal.video import process_video_bytes

log = logging.getLogger(__name__)
FINANCIAL_ENTITY_TYPES = {"transaction", "order", "invoice", "financial_metric", "tabular_row", "table_row"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _slug_id(prefix: str, label: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", (label or "").strip()).strip("_")[:48]
    return f"{prefix}_{cleaned}" if cleaned else f"{prefix}_default"


def serialize_multimodal_file(row: dict[str, Any], *, include_signed_url: bool = True) -> dict[str, Any]:
    meta = dict(row.get("source_metadata_json") or {})
    frames = []
    for f in meta.get("sampled_frames") or []:
        f_copy = dict(f)
        if f.get("frame_subkey"):
            tok, exp = sign_file_token(
                company_id=row["company_id"], file_id=row["id"], subkey=f["frame_subkey"], ttl_seconds=900
            )
            f_copy["signed_url"] = (
                f"/api/v1/files/{row['id']}/content?subkey={f['frame_subkey']}&token={tok}"
            )
            f_copy["expires_at_epoch"] = exp
        frames.append(f_copy)
    if frames:
        meta["sampled_frames"] = frames

    signed_preview = None
    if include_signed_url:
        tok, _ = sign_file_token(company_id=row["company_id"], file_id=row["id"], subkey="raw", ttl_seconds=900)
        signed_preview = f"/api/v1/files/{row['id']}/content?subkey=raw&token={tok}"

    return {
        "id": row["id"],
        "file_id": row["id"],
        "company_id": row["company_id"],
        "dataset_id": row["dataset_id"],
        "data_source_id": row["data_source_id"],
        "file_name": row["file_name"],
        "mime_type": row["mime_type"],
        "modality": row["modality"],
        "file_format": row["file_format"],
        "file_size_bytes": int(row["file_size_bytes"] or 0),
        "checksum_sha256": row["checksum_sha256"],
        "upload_timestamp": _json_safe_iso(row.get("upload_timestamp")),
        "processing_status": row["processing_status"],
        "extraction_status": row["extraction_status"],
        "validation_status": row["validation_status"],
        "confidence_threshold": float(row.get("confidence_threshold") or 0.8),
        "consent_external_ai": bool(row.get("consent_external_ai")),
        "privacy_notice_accepted": bool(row.get("privacy_notice_accepted")),
        "retention_days": int(row.get("retention_days") or 90),
        "expires_at": _json_safe_iso(row.get("expires_at")),
        "source_metadata": meta,
        "extraction_summary": row.get("extraction_summary_json") or {},
        "signed_content_url": signed_preview,
        "created_by": row["created_by"],
        "updated_at": _json_safe_iso(row.get("updated_at")),
        "imported_at": _json_safe_iso(row.get("imported_at")),
    }


def serialize_extracted_record(row: dict[str, Any], *, threshold: float = 0.8) -> dict[str, Any]:
    conf = float(row["confidence_score"]) if row.get("confidence_score") is not None else None
    extracted = dict(row.get("extracted_json") or {})
    corrected = dict(row.get("corrected_json") or {}) if row.get("corrected_json") is not None else None
    effective = {**extracted, **corrected} if corrected else extracted
    below_threshold = conf is not None and conf < threshold
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "dataset_id": row["dataset_id"],
        "file_id": row["file_id"],
        "source_id": row["source_id"],
        "modality": row["modality"],
        "entity_type": row["entity_type"],
        "extraction_timestamp": _json_safe_iso(row.get("extraction_timestamp")),
        "source_location": row.get("source_location_json") or {},
        "raw_payload": row.get("raw_payload_json") or {},
        "extracted_data": extracted,
        "corrected_data": corrected,
        "effective_data": effective,
        "confidence_score": conf,
        "confidence_threshold": threshold,
        "below_threshold": below_threshold,
        "extraction_method": row["extraction_method"],
        "validation_status": row["validation_status"],
        "needs_human_review": bool(row.get("needs_human_review")) or below_threshold,
        "reviewed_by": row.get("reviewed_by"),
        "reviewed_at": _json_safe_iso(row.get("reviewed_at")),
        "transformation_history": row.get("transformation_history_json") or [],
        "promoted": bool(row.get("promoted")),
    }


def _run_processor_for_file(
    *,
    blob: bytes,
    file_row: dict[str, Any],
    params: dict[str, Any],
    storage: ObjectStorage,
    templates: list[dict[str, Any]],
) -> dict[str, Any]:
    modality = file_row["modality"]
    ext = file_row["file_format"]
    fname = file_row["file_name"]
    sid = file_row["data_source_id"]
    consent = bool(file_row.get("consent_external_ai"))

    if modality == "structured":
        return process_tabular_bytes(blob, fname, source_id=sid, templates=templates, sheet_name=params.get("sheet_name"))
    if modality == "document":
        return process_document_bytes(blob, fname, ext, source_id=sid, consent_external_ai=consent)
    if modality == "image":
        return process_image_bytes(blob, fname, ext, source_id=sid, consent_external_ai=consent)
    if modality == "video":
        return process_video_bytes(
            blob,
            fname,
            ext,
            company_id=file_row["company_id"],
            dataset_id=file_row["dataset_id"],
            file_id=file_row["id"],
            source_id=sid,
            storage=storage,
            sampling_interval_sec=float(params.get("sampling_interval_sec") or 5.0),
            max_frames=int(params.get("max_frames") or 10),
            consent_external_ai=consent,
        )
    if modality == "audio":
        return process_audio_bytes(blob, fname, ext, source_id=sid, consent_external_ai=consent)
    raise ValueError(f"Unsupported modality '{modality}'.")


def execute_ingestion_job(engine: sa.Engine, storage: ObjectStorage, job_id: str) -> dict[str, Any]:
    with engine.connect() as conn:
        job = conn.execute(sa.select(ingestion_jobs).where(ingestion_jobs.c.id == job_id)).mappings().first()
        if job is None:
            raise LookupError(f"Job '{job_id}' missing.")
        file_row = conn.execute(sa.select(multimodal_files).where(multimodal_files.c.id == job["file_id"])).mappings().first()
        if file_row is None:
            raise LookupError(f"File '{job['file_id']}' missing.")
        tpl_rows = [
            dict(r)
            for r in conn.execute(
                sa.select(mapping_templates)
                .where(mapping_templates.c.company_id == file_row["company_id"])
                .order_by(mapping_templates.c.updated_at.desc())
            ).mappings()
        ]
        file_dict = dict(file_row)
        job_params = dict(job.get("params_json") or {})

    with engine.begin() as conn:
        conn.execute(
            multimodal_files.update()
            .where(multimodal_files.c.id == file_dict["id"])
            .values(processing_status="processing", extraction_status="running", updated_at=_utc_now())
        )

    try:
        blob = storage.get_bytes(file_dict["storage_key"])
        with engine.begin() as conn:
            conn.execute(ingestion_jobs.update().where(ingestion_jobs.c.id == job_id).values(progress_pct=45))

        proc_result = _run_processor_for_file(
            blob=blob,
            file_row=file_dict,
            params=job_params,
            storage=storage,
            templates=tpl_rows,
        )

        with engine.begin() as conn:
            conn.execute(
                ingestion_jobs.update().where(ingestion_jobs.c.id == job_id).values(stage="extracted", progress_pct=75)
            )
            conn.execute(
                multimodal_files.update()
                .where(multimodal_files.c.id == file_dict["id"])
                .values(processing_status="extracted", extraction_status=proc_result["extraction_status"], updated_at=_utc_now())
            )

        recs = proc_result.get("extracted_records") or []
        threshold = float(file_dict.get("confidence_threshold") or 0.8)
        meta = dict(file_dict.get("source_metadata_json") or {})
        meta.update(proc_result.get("metadata") or {})

        # Persist cleaned JSON if structured tabular
        if file_dict["modality"] == "structured" and proc_result.get("quality"):
            qual = proc_result["quality"]
            cleaned_key = f"companies/{file_dict['company_id']}/datasets/{file_dict['dataset_id']}/files/{file_dict['id']}/cleaned.json"
            serializable = [{**r, "date": r["date"].isoformat() if r.get("date") else None} for r in qual.cleaned_rows]
            storage.put_bytes(cleaned_key, json.dumps(serializable).encode("utf-8"), content_type="application/json")
            meta["cleaned_storage_key"] = cleaned_key

        with engine.begin() as conn:
            conn.execute(
                ingestion_jobs.update().where(ingestion_jobs.c.id == job_id).values(stage="validating", progress_pct=88)
            )
            # Clear prior non-promoted extractions on retry so retries remain idempotent
            conn.execute(
                extracted_records.delete().where(
                    extracted_records.c.file_id == file_dict["id"],
                    extracted_records.c.promoted.is_(False),
                )
            )
            insert_rows = []
            below_cnt = 0
            review_cnt = 0
            for item in recs:
                conf = item.get("confidence_score")
                below = conf is not None and float(conf) < threshold
                needs_rev = bool(item.get("needs_human_review", file_dict["modality"] != "structured")) or below
                if below:
                    below_cnt += 1
                if needs_rev:
                    review_cnt += 1
                v_stat = "needs_review" if (below or needs_rev) else "unverified"
                insert_rows.append({
                    "id": f"ext-{uuid4().hex[:14]}",
                    "company_id": file_dict["company_id"],
                    "dataset_id": file_dict["dataset_id"],
                    "file_id": file_dict["id"],
                    "source_id": file_dict["data_source_id"],
                    "modality": file_dict["modality"],
                    "entity_type": item.get("entity_type") or "insight",
                    "source_location_json": item.get("source_location") or {},
                    "raw_payload_json": item.get("raw_payload") or {},
                    "extracted_json": item.get("extracted_data") or {},
                    "corrected_json": None,
                    "confidence_score": conf,
                    "extraction_method": item.get("extraction_method") or file_dict["modality"],
                    "validation_status": v_stat,
                    "needs_human_review": needs_rev,
                    "transformation_history_json": item.get("transformation_history") or [],
                    "promoted": False,
                })
            for start_i in range(0, len(insert_rows), 250):
                conn.execute(extracted_records.insert(), insert_rows[start_i : start_i + 250])

            avg_conf = (
                round(sum(float(r["confidence_score"]) for r in insert_rows if r["confidence_score"] is not None) / max(1, sum(1 for r in insert_rows if r["confidence_score"] is not None)), 3)
                if any(r["confidence_score"] is not None for r in insert_rows)
                else None
            )
            summary = {
                "stage": "awaiting_approval",
                "total_extracted": len(insert_rows),
                "below_threshold": below_cnt,
                "needs_review": review_cnt,
                "average_confidence": avg_conf,
                "extraction_status": proc_result.get("extraction_status", "completed"),
                "warnings": (meta.get("warnings") or meta.get("parse_warnings") or [])[:10],
            }
            conn.execute(
                multimodal_files.update()
                .where(multimodal_files.c.id == file_dict["id"])
                .values(
                    processing_status="awaiting_approval",
                    extraction_status=proc_result.get("extraction_status", "completed"),
                    validation_status="needs_review" if review_cnt > 0 else "pending_approval",
                    source_metadata_json=meta,
                    extraction_summary_json=summary,
                    updated_at=_utc_now(),
                )
            )
            _log_stage(
                conn,
                dataset_id=file_dict["dataset_id"],
                company_id=file_dict["company_id"],
                data_source_id=file_dict["data_source_id"],
                stage="extraction",
                status="completed",
                actor=file_dict["created_by"],
                details={"file_id": file_dict["id"], "file_name": file_dict["file_name"], **summary},
            )
            return summary
    except Exception as exc:
        with engine.begin() as err_conn:
            err_conn.execute(
                multimodal_files.update()
                .where(multimodal_files.c.id == file_dict["id"])
                .values(
                    processing_status="failed",
                    extraction_status="failed",
                    validation_status="failed",
                    extraction_summary_json={"error": str(exc)},
                    updated_at=_utc_now(),
                )
            )
            _log_stage(
                err_conn,
                dataset_id=file_dict["dataset_id"],
                company_id=file_dict["company_id"],
                data_source_id=file_dict["data_source_id"],
                stage="extraction",
                status="failed",
                actor=file_dict["created_by"],
                details={"file_id": file_dict["id"], "file_name": file_dict["file_name"]},
                error_message=str(exc),
            )
        raise


def create_job_queue(engine: sa.Engine, storage: ObjectStorage) -> MultimodalJobQueue:
    return MultimodalJobQueue(
        engine=engine,
        worker_fn=lambda job_id: execute_ingestion_job(engine, storage, job_id),
    )


def upload_multimodal_files(
    engine: sa.Engine,
    storage: ObjectStorage,
    queue: MultimodalJobQueue,
    *,
    company_id: str,
    files_payload: list[tuple[str, bytes, str | None]],
    dataset_id: str | None = None,
    dataset_name: str | None = None,
    data_source_id: str | None = None,
    confidence_threshold: float = 0.8,
    sampling_interval_sec: float = 5.0,
    max_frames: int = 10,
    retention_days: int = 90,
    consent_external_ai: bool = False,
    privacy_notice_accepted: bool = False,
    idempotency_key: str | None = None,
    actor: str = "workspace-user",
) -> dict[str, Any]:
    if not files_payload:
        raise HTTPException(422, "Attach at least one file to upload.")

    threshold = max(0.0, min(1.0, float(confidence_threshold)))
    ret_days = max(1, min(3650, int(retention_days)))

    validated: list[tuple[bytes, Any]] = []
    for raw_name, blob, declared_mime in files_payload:
        try:
            sec = inspect_and_validate_file(blob, raw_name, declared_mime=declared_mime)
            validated.append((blob, sec))
        except FileTooLargeError as exc:
            raise HTTPException(413, str(exc)) from exc
        except IngestionValidationError as exc:
            raise HTTPException(422, str(exc)) from exc

    with engine.begin() as conn:
        company, default_src_id = _ensure_company_and_source(conn, company_id)
        if company_id == "comp-default":
            sync_default_legacy_dataset(conn, company_id)

        resolved_src = default_src_id
        if data_source_id:
            src = conn.execute(sa.select(data_sources).where(data_sources.c.id == data_source_id)).mappings().first()
            if src is None:
                raise HTTPException(404, "Specified data source was not found.")
            if src["company_id"] != company_id:
                raise HTTPException(403, "Data source belongs to another company.")
            resolved_src = src["id"]

        if dataset_id:
            existing_ds = conn.execute(sa.select(enterprise_datasets).where(enterprise_datasets.c.id == dataset_id)).mappings().first()
            if existing_ds is None:
                raise HTTPException(404, "Target dataset not found.")
            if existing_ds["company_id"] != company_id:
                raise HTTPException(403, "Cross-tenant dataset upload denied.")
            if existing_ds["storage_mode"] == "legacy_snapshot":
                raise HTTPException(422, "Built-in demo snapshot cannot accept uploaded files; create or select an enterprise dataset.")
            target_ds_id = existing_ds["id"]
        else:
            target_ds_id = uuid4().hex[:24]
            title = (dataset_name or "").strip() or (
                validated[0][1].clean_name.rsplit(".", 1)[0]
                if len(validated) == 1
                else f"Multimodal Batch ({len(validated)} files)"
            )
            conn.execute(
                enterprise_datasets.insert().values(
                    id=target_ds_id,
                    company_id=company_id,
                    data_source_id=resolved_src,
                    name=title[:160],
                    kind="multimodal",
                    status="uploaded",
                    storage_mode="partitioned",
                    file_name=validated[0][1].clean_name if len(validated) == 1 else f"{len(validated)} multimodal files",
                    file_format=validated[0][1].ext if len(validated) == 1 else "multimodal",
                    file_size_bytes=sum(sec.size_bytes for _, sec in validated),
                    checksum_sha256=validated[0][1].sha256 if len(validated) == 1 else None,
                    row_count=0,
                    mapping_confirmed=False,
                    quality_confirmed=False,
                    is_active=False,
                    mapping_json={},
                    cleaning_policy_json={"invalid_row_policy": "skip_invalid", "duplicate_policy": "keep_all"},
                    capabilities_json={},
                    metadata_json={
                        "currency": "USD",
                        "timezone": "Asia/Ho_Chi_Minh",
                        "multimodal_batch": True,
                        "modalities": sorted({sec.modality for _, sec in validated}),
                    },
                    created_by=actor,
                )
            )

        file_rows_created: list[dict[str, Any]] = []
        expires_at = _utc_now() + timedelta(days=ret_days)

        for idx, (blob, sec) in enumerate(validated):
            file_id = f"mm-{uuid4().hex[:14]}"
            storage_key = f"companies/{company_id}/datasets/{target_ds_id}/files/{file_id}/{sec.clean_name}"
            storage.put_bytes(storage_key, blob, content_type=sec.mime_type)
            conn.execute(
                multimodal_files.insert().values(
                    id=file_id,
                    company_id=company_id,
                    dataset_id=target_ds_id,
                    data_source_id=resolved_src,
                    file_name=sec.clean_name,
                    mime_type=sec.mime_type,
                    modality=sec.modality,
                    file_format=sec.ext,
                    file_size_bytes=sec.size_bytes,
                    checksum_sha256=sec.sha256,
                    storage_key=storage_key,
                    processing_status="uploaded",
                    extraction_status="pending",
                    validation_status="pending",
                    confidence_threshold=threshold,
                    consent_external_ai=bool(consent_external_ai),
                    privacy_notice_accepted=bool(privacy_notice_accepted),
                    retention_days=ret_days,
                    expires_at=expires_at,
                    source_metadata_json={
                        "original_filename": sec.clean_name,
                        "sampling_interval_sec": sampling_interval_sec,
                        "max_frames": max_frames,
                    },
                    created_by=actor,
                )
            )
            frow = conn.execute(sa.select(multimodal_files).where(multimodal_files.c.id == file_id)).mappings().one()
            file_rows_created.append(dict(frow))

        _log_stage(
            conn,
            dataset_id=target_ds_id,
            company_id=company_id,
            data_source_id=resolved_src,
            stage="multimodal_upload",
            status="completed",
            actor=actor,
            details={
                "files_count": len(file_rows_created),
                "modalities": sorted({f["modality"] for f in file_rows_created}),
                "consent_external_ai": bool(consent_external_ai),
            },
        )
        conn.execute(
            audit.insert().values(
                company_id=company_id,
                kind="multimodal_uploaded",
                subject=target_ds_id,
                payload={
                    "dataset_id": target_ds_id,
                    "file_ids": [f["id"] for f in file_rows_created],
                    "actor": actor,
                },
            )
        )

    jobs: list[dict[str, Any]] = []
    for idx, fdict in enumerate(file_rows_created):
        idem = f"{idempotency_key}:{idx}" if idempotency_key else None
        jobs.append(
            queue.submit_file_job(
                company_id=company_id,
                dataset_id=target_ds_id,
                file_id=fdict["id"],
                data_source_id=resolved_src,
                actor=actor,
                params={
                    "sampling_interval_sec": sampling_interval_sec,
                    "max_frames": max_frames,
                },
                idempotency_key=idem,
            )
        )

    return {
        "company_id": company_id,
        "dataset_id": target_ds_id,
        "files": [serialize_multimodal_file(f) for f in file_rows_created],
        "jobs": jobs,
    }


def list_multimodal_files(
    conn: sa.Connection,
    *,
    company_id: str,
    modality: str | None = None,
    file_format: str | None = None,
    dataset_id: str | None = None,
    processing_status: str | None = None,
    data_source_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict[str, Any]]:
    q = sa.select(multimodal_files).where(multimodal_files.c.company_id == company_id)
    if modality:
        q = q.where(multimodal_files.c.modality == modality)
    if file_format:
        q = q.where(multimodal_files.c.file_format == file_format.lower())
    if dataset_id:
        q = q.where(multimodal_files.c.dataset_id == dataset_id)
    if processing_status:
        q = q.where(multimodal_files.c.processing_status == processing_status)
    if data_source_id:
        q = q.where(multimodal_files.c.data_source_id == data_source_id)
    if date_from:
        q = q.where(multimodal_files.c.upload_timestamp >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        q = q.where(multimodal_files.c.upload_timestamp <= datetime.combine(date_to, datetime.max.time(), tzinfo=timezone.utc))
    q = q.order_by(multimodal_files.c.upload_timestamp.desc())
    return [serialize_multimodal_file(dict(r)) for r in conn.execute(q).mappings()]


def get_owned_file(conn: sa.Connection, company_id: str, file_id: str) -> dict[str, Any]:
    row = conn.execute(sa.select(multimodal_files).where(multimodal_files.c.id == file_id)).mappings().first()
    if row is None:
        raise HTTPException(404, "Multimodal file not found.")
    if row["company_id"] != company_id:
        raise HTTPException(403, "Cross-tenant file access denied.")
    return dict(row)


def get_file_extractions(conn: sa.Connection, *, company_id: str, file_id: str) -> dict[str, Any]:
    f = get_owned_file(conn, company_id, file_id)
    threshold = float(f.get("confidence_threshold") or 0.8)
    rows = conn.execute(
        sa.select(extracted_records)
        .where(extracted_records.c.file_id == file_id, extracted_records.c.company_id == company_id)
        .order_by(extracted_records.c.extraction_timestamp.asc(), extracted_records.c.id.asc())
    ).mappings().all()
    items = [serialize_extracted_record(dict(r), threshold=threshold) for r in rows]
    return {
        "file": serialize_multimodal_file(f),
        "confidence_threshold": threshold,
        "count": len(items),
        "below_threshold_count": sum(1 for item in items if item["below_threshold"]),
        "items": items,
    }


def patch_extracted_record(
    engine: sa.Engine,
    *,
    company_id: str,
    record_id: str,
    corrected_data: dict[str, Any] | None = None,
    validation_status: str | None = None,
    actor: str = "workspace-user",
) -> dict[str, Any]:
    with engine.begin() as conn:
        rec = conn.execute(sa.select(extracted_records).where(extracted_records.c.id == record_id)).mappings().first()
        if rec is None:
            raise HTTPException(404, "Extracted record not found.")
        if rec["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant record modification denied.")
        file_row = conn.execute(sa.select(multimodal_files).where(multimodal_files.c.id == rec["file_id"])).mappings().one()
        threshold = float(file_row.get("confidence_threshold") or 0.8)

        history = list(rec.get("transformation_history_json") or [])
        prev_effective = {**(rec.get("extracted_json") or {}), **(rec.get("corrected_json") or {})}
        new_corrected = dict(rec.get("corrected_json") or {})
        if corrected_data is not None:
            new_corrected.update(corrected_data)
            if ("revenue" in corrected_data or "cost" in corrected_data) and "profit" not in corrected_data:
                merged_eff = {**(rec.get("extracted_json") or {}), **new_corrected}
                rev_val, _ = parse_numeric_money(merged_eff.get("revenue"))
                cost_val, _ = parse_numeric_money(merged_eff.get("cost"))
                if rev_val is not None and cost_val is not None:
                    new_corrected["profit"] = round(float(rev_val) - float(cost_val), 2)
            history.append({
                "timestamp": _utc_now().isoformat(),
                "actor": actor,
                "action": "human_correction",
                "updated_fields": sorted(corrected_data.keys()),
                "previous": {k: prev_effective.get(k) for k in corrected_data.keys()},
            })

        next_status = validation_status or ("edited" if corrected_data is not None else rec["validation_status"])
        if validation_status and validation_status != rec["validation_status"]:
            history.append({
                "timestamp": _utc_now().isoformat(),
                "actor": actor,
                "action": "validation_status_changed",
                "from": rec["validation_status"],
                "to": validation_status,
            })

        needs_rev = next_status in {"needs_review", "unverified"}
        conn.execute(
            extracted_records.update()
            .where(extracted_records.c.id == record_id, extracted_records.c.company_id == company_id)
            .values(
                corrected_json=new_corrected if new_corrected else None,
                validation_status=next_status,
                needs_human_review=needs_rev,
                reviewed_by=actor,
                reviewed_at=_utc_now(),
                transformation_history_json=history,
            )
        )
        updated = conn.execute(sa.select(extracted_records).where(extracted_records.c.id == record_id)).mappings().one()
        return serialize_extracted_record(dict(updated), threshold=threshold)


def _normalize_financial_row(
    eff: dict[str, Any],
    *,
    default_currency: str,
    file_name: str,
) -> dict[str, Any] | None:
    d_val, _ = parse_flexible_date(eff.get("date"))
    rev_val, cur = parse_numeric_money(eff.get("revenue"))
    if d_val is None or rev_val is None or rev_val < 0:
        return None
    qty_raw = eff.get("quantity")
    try:
        qty = max(1, int(float(qty_raw))) if qty_raw not in (None, "") else 1
    except (TypeError, ValueError):
        qty = 1

    cost_val, _ = parse_numeric_money(eff.get("cost")) if eff.get("cost") not in (None, "") else (None, None)
    profit_val, _ = parse_numeric_money(eff.get("profit")) if eff.get("profit") not in (None, "") else (None, None)
    if cost_val is not None and profit_val is None:
        profit_val = round(float(rev_val) - float(cost_val), 2)
    elif profit_val is not None and cost_val is None:
        cost_val = max(0.0, round(float(rev_val) - float(profit_val), 2))
    total_cost = max(0.0, float(cost_val or 0.0))
    unit_cost = round(total_cost / qty, 4) if total_cost else 0.0
    unit_price = round(max(0.01, float(rev_val) / qty), 4)

    spend_val, _ = parse_numeric_money(eff.get("marketing_spend")) if eff.get("marketing_spend") not in (None, "") else (None, None)
    inv_raw = eff.get("inventory")
    try:
        inv_val = max(0, int(float(inv_raw))) if inv_raw not in (None, "") else None
    except (TypeError, ValueError):
        inv_val = None

    return {
        "date": d_val,
        "product": str(eff.get("product") or f"Item ({file_name})")[:160],
        "category": str(eff.get("category") or "Multimodal Extracted")[:120],
        "quantity": qty,
        "unit_price": unit_price,
        "revenue": round(float(rev_val), 2),
        "unit_cost": unit_cost,
        "total_cost": round(total_cost, 2),
        "gross_profit": round(float(profit_val), 2) if profit_val is not None else None,
        "customer": str(eff.get("customer") or "Extracted Counterparty")[:120],
        "region": str(eff.get("region") or "General")[:120],
        "channel": str(eff.get("channel") or "Direct")[:120],
        "order_id": str(eff.get("order_id") or "")[:100] or None,
        "marketing_spend": round(float(spend_val), 2) if spend_val is not None else None,
        "inventory_level": inv_val,
        "currency": str(eff.get("currency") or cur or default_currency),
        "custom_fields_json": eff.get("custom_fields"),
    }


def _recompute_dataset_summary(
    conn: sa.Connection,
    *,
    company_id: str,
    dataset_id: str,
    currency: str | None = None,
) -> dict[str, Any]:
    tx_rows = conn.execute(
        sa.select(
            sa.func.count().label("cnt"),
            sa.func.min(tenant_transactions.c.date).label("min_d"),
            sa.func.max(tenant_transactions.c.date).label("max_d"),
            sa.func.sum(sa.case((tenant_transactions.c.gross_profit.is_not(None), 1), else_=0)).label("has_gp"),
        ).where(tenant_transactions.c.company_id == company_id, tenant_transactions.c.dataset_id == dataset_id)
    ).mappings().one()
    tx_cnt = int(tx_rows["cnt"] or 0)
    prod_cnt = conn.scalar(
        sa.select(sa.func.count()).select_from(tenant_products).where(tenant_products.c.company_id == company_id, tenant_products.c.dataset_id == dataset_id)
    ) or 0
    cust_cnt = conn.scalar(
        sa.select(sa.func.count()).select_from(tenant_customers).where(tenant_customers.c.company_id == company_id, tenant_customers.c.dataset_id == dataset_id)
    ) or 0
    ord_cnt = conn.scalar(
        sa.select(sa.func.count()).select_from(tenant_orders).where(tenant_orders.c.company_id == company_id, tenant_orders.c.dataset_id == dataset_id)
    ) or 0
    mkt_cnt = conn.scalar(
        sa.select(sa.func.count()).select_from(tenant_marketing_daily).where(tenant_marketing_daily.c.company_id == company_id, tenant_marketing_daily.c.dataset_id == dataset_id)
    ) or 0
    inv_cnt = conn.scalar(
        sa.select(sa.func.count()).select_from(tenant_inventory_daily).where(tenant_inventory_daily.c.company_id == company_id, tenant_inventory_daily.c.dataset_id == dataset_id)
    ) or 0
    ins_cnt = conn.scalar(
        sa.select(sa.func.count()).select_from(tenant_multimodal_insights).where(tenant_multimodal_insights.c.company_id == company_id, tenant_multimodal_insights.c.dataset_id == dataset_id)
    ) or 0

    min_d = tx_rows["min_d"]
    max_d = tx_rows["max_d"]
    day_span = ((max_d - min_d).days + 1) if (min_d and max_d) else 0
    mapped_fields = set()
    if tx_cnt > 0:
        mapped_fields.update({"date", "revenue", "product", "quantity", "region", "channel", "customer", "category"})
        if int(tx_rows["has_gp"] or 0) > 0:
            mapped_fields.add("profit")
    if mkt_cnt > 0:
        mapped_fields.add("marketing_spend")
    if inv_cnt > 0:
        mapped_fields.add("inventory")

    caps = compute_capabilities(mapped_fields)
    caps["has_multimodal_insights"] = ins_cnt > 0
    caps["day_span"] = day_span

    counts = {
        "sales_transactions": tx_cnt,
        "products": int(prod_cnt),
        "customers": int(cust_cnt),
        "orders": int(ord_cnt),
        "marketing_campaigns": int(mkt_cnt),
        "inventory_daily": int(inv_cnt),
        "multimodal_insights": int(ins_cnt),
        "calendar_events": day_span,
    }

    ds = conn.execute(sa.select(enterprise_datasets).where(enterprise_datasets.c.id == dataset_id)).mappings().one()
    meta = dict(ds.get("metadata_json") or {})
    meta["counts"] = counts
    if currency:
        meta["currency"] = currency
    if min_d:
        meta["start"] = min_d.isoformat()
    if max_d:
        meta["end"] = max_d.isoformat()

    return {
        "counts": counts,
        "date_start": min_d,
        "date_end": max_d,
        "capabilities": caps,
        "metadata": meta,
    }


def approve_and_import_file(
    engine: sa.Engine,
    storage: ObjectStorage,
    *,
    company_id: str,
    file_id: str,
    confirmed: bool,
    record_ids: list[str] | None = None,
    approve_below_threshold: bool = False,
    activate: bool = True,
    currency: str | None = None,
    actor: str = "workspace-user",
) -> dict[str, Any]:
    if not confirmed:
        raise HTTPException(422, "Explicit human confirmation is required before importing extracted records into Business Intelligence.")

    with engine.connect() as conn:
        company, _ = _ensure_company_and_source(conn, company_id)
        frow = get_owned_file(conn, company_id, file_id)
        if frow["processing_status"] in {"uploaded", "processing"}:
            raise HTTPException(409, f"File is still in '{frow['processing_status']}' stage; wait for extraction to finish.")
        if frow["processing_status"] == "failed":
            raise HTTPException(422, "Failed file extraction cannot be imported; retry extraction job first.")

        recs = [
            dict(r)
            for r in conn.execute(
                sa.select(extracted_records)
                .where(extracted_records.c.file_id == file_id, extracted_records.c.company_id == company_id)
                .order_by(extracted_records.c.id.asc())
            ).mappings()
        ]
        ds = conn.execute(sa.select(enterprise_datasets).where(enterprise_datasets.c.id == frow["dataset_id"])).mappings().one()

    threshold = float(frow.get("confidence_threshold") or 0.8)
    selected = recs if record_ids is None else [r for r in recs if r["id"] in set(record_ids)]
    if not selected:
        raise HTTPException(422, "No extracted records found to approve.")

    eligible = [r for r in selected if r["validation_status"] != "rejected"]
    if not eligible:
        raise HTTPException(422, "All selected extracted records are marked rejected.")

    # Guardrail: prevent unreviewed low-confidence or partial records from entering official BI silently
    unreviewed_low = [
        r["id"]
        for r in eligible
        if (r.get("confidence_score") is not None and float(r["confidence_score"]) < threshold)
        and r["validation_status"] not in {"edited", "approved"}
    ]
    if unreviewed_low and not approve_below_threshold:
        raise HTTPException(
            422,
            f"{len(unreviewed_low)} extracted record(s) fall below the {int(threshold * 100)}% confidence threshold and have not been edited or explicitly approved (e.g. {unreviewed_low[0]}).",
        )

    ds_meta = dict(ds.get("metadata_json") or {})
    default_currency = currency or ds_meta.get("currency") or "USD"

    # Full structured dataset promotion when > 200 rows or full cleaned artifact exists
    file_meta = dict(frow.get("source_metadata_json") or {})
    bulk_structured_rows: list[dict[str, Any]] | None = None
    if frow["modality"] == "structured" and file_meta.get("cleaned_storage_key"):
        try:
            blob = storage.get_bytes(frow["storage_key"])
            parsed = parse_uploaded_dataset(blob, frow["file_name"], limit=None)
            sugg_map = file_meta.get("suggested_mapping") or {}
            if {"date", "revenue"}.issubset({t for t in sugg_map.values() if t in CANONICAL_FIELDS}):
                qual = evaluate_and_clean(
                    parsed.columns,
                    parsed.rows,
                    sugg_map,
                    row_numbers=parsed.row_numbers,
                    invalid_row_policy="skip_invalid",
                    duplicate_policy="keep_all",
                    preferred_currency=currency,
                )
                # Apply any human edits from extracted_records by matching row number
                edits_by_row = {
                    (r.get("source_location_json") or {}).get("row"): r.get("corrected_json")
                    for r in eligible
                    if r.get("corrected_json") and (r.get("source_location_json") or {}).get("row") is not None
                }
                rejected_rows = {
                    (r.get("source_location_json") or {}).get("row")
                    for r in selected
                    if r["validation_status"] == "rejected"
                }
                bulk_structured_rows = []
                for cr in qual.cleaned_rows:
                    rn = cr["row_num"]
                    if rn in rejected_rows:
                        continue
                    if rn in edits_by_row:
                        norm = _normalize_financial_row({**cr, **edits_by_row[rn]}, default_currency=qual.detected_currency, file_name=frow["file_name"])
                        if norm:
                            bulk_structured_rows.append({**norm, "source_location": {"file": frow["file_name"], "row": rn}})
                            continue
                    bulk_structured_rows.append({
                        "date": cr["date"],
                        "product": cr["product"],
                        "category": cr["category"],
                        "quantity": cr["quantity"],
                        "unit_price": cr["unit_price"],
                        "revenue": cr["revenue"],
                        "unit_cost": cr["unit_cost"],
                        "total_cost": cr["total_cost"],
                        "gross_profit": cr["gross_profit"],
                        "customer": cr["customer"],
                        "region": cr["region"],
                        "channel": cr["channel"],
                        "order_id": f"ORD-{file_id[:8]}-{rn}",
                        "marketing_spend": cr.get("marketing_spend"),
                        "inventory_level": cr.get("inventory_level"),
                        "currency": qual.detected_currency,
                        "custom_fields_json": cr.get("custom_fields_json"),
                        "source_location": {"file": frow["file_name"], "row": rn},
                    })
                if qual.detected_currency and not currency:
                    default_currency = qual.detected_currency
        except Exception as exc:
            log.debug("Structured bulk promotion fell back to extracted_records (%s)", exc)
            bulk_structured_rows = None

    financial_rows: list[dict[str, Any]] = []
    insight_rows: list[dict[str, Any]] = []
    detected_currencies: list[str] = []

    if bulk_structured_rows:
        financial_rows = bulk_structured_rows
    else:
        for rec in eligible:
            corr = dict(rec.get("corrected_json") or {})
            eff = {**(rec.get("extracted_json") or {}), **corr}
            if ("revenue" in corr or "cost" in corr) and "profit" not in corr:
                eff.pop("profit", None)
            has_human_financial_edit = bool(corr) and (
                "revenue" in corr or ("date" in corr and eff.get("revenue") is not None)
            )
            norm = (
                _normalize_financial_row(eff, default_currency=default_currency, file_name=frow["file_name"])
                if (rec["entity_type"] in FINANCIAL_ENTITY_TYPES or has_human_financial_edit)
                else None
            )
            if norm:
                detected_currencies.append(norm["currency"])
                financial_rows.append({**norm, "extraction_id": rec["id"], "source_location": rec.get("source_location_json") or {}})
            # Also promote multimodal narrative/media/document context as structured insights for non-tabular files
            if norm is None or frow["modality"] != "structured":
                ins_date, _ = parse_flexible_date(eff.get("date"))
                metrics_payload = {
                    k: eff[k]
                    for k in ("revenue", "cost", "profit", "quantity", "product", "customer", "region", "channel", "currency", "duration_sec", "ocr_signage_detected", "stt_status", "sentiment")
                    if eff.get(k) is not None
                }
                raw_title = str(eff.get("title") or "")
                if norm and "title" not in corr and raw_title.startswith("Visual image capture ("):
                    title_txt = f"{norm['product']} · {frow['file_name']}"[:195]
                else:
                    title_txt = (raw_title or f"{frow['file_name']} ({rec['entity_type']})")[:195]
                summary_txt = str(eff.get("summary") or eff.get("transcript") or eff.get("ocr_text") or json.dumps(eff, ensure_ascii=False))
                if norm and "summary" not in corr and "no readable text detected via OCR" in summary_txt:
                    summary_txt = f"Verified {norm['product']} ({norm['date'].isoformat()}): revenue {norm['revenue']:.2f} {norm['currency']}, cost {norm['total_cost']:.2f} {norm['currency']}."
                summary_txt = summary_txt[:2000]
                insight_rows.append({
                    "id": f"ins-{uuid4().hex[:14]}",
                    "company_id": company_id,
                    "dataset_id": frow["dataset_id"],
                    "source_file_id": file_id,
                    "extraction_id": rec["id"],
                    "modality": frow["modality"],
                    "entity_type": rec["entity_type"],
                    "insight_date": ins_date,
                    "title": title_txt,
                    "summary_text": summary_txt,
                    "metrics_json": metrics_payload,
                    "source_location_json": rec.get("source_location_json") or {},
                    "confidence_score": rec.get("confidence_score"),
                    "extraction_method": rec["extraction_method"],
                    "validation_status": "approved",
                    "approved_by": actor,
                })

    if detected_currencies and not currency:
        default_currency = detected_currencies[0]

    ds_id = frow["dataset_id"]
    now = _utc_now()

    with engine.begin() as conn:
        # Remove prior rows promoted from THIS specific file_id so re-approval is idempotent cleanly
        conn.execute(tenant_transactions.delete().where(tenant_transactions.c.company_id == company_id, tenant_transactions.c.dataset_id == ds_id, tenant_transactions.c.source_file_id == file_id))
        conn.execute(tenant_orders.delete().where(tenant_orders.c.company_id == company_id, tenant_orders.c.dataset_id == ds_id, tenant_orders.c.source_file_id == file_id))
        conn.execute(tenant_multimodal_insights.delete().where(tenant_multimodal_insights.c.company_id == company_id, tenant_multimodal_insights.c.dataset_id == ds_id, tenant_multimodal_insights.c.source_file_id == file_id))

        max_row_num = conn.scalar(
            sa.select(sa.func.coalesce(sa.func.max(tenant_transactions.c.row_num), 0)).where(
                tenant_transactions.c.company_id == company_id,
                tenant_transactions.c.dataset_id == ds_id,
            )
        ) or 0

        if financial_rows:
            existing_prods = {
                r["product_name"]: r["product_id"]
                for r in conn.execute(
                    sa.select(tenant_products.c.product_name, tenant_products.c.product_id).where(
                        tenant_products.c.company_id == company_id, tenant_products.c.dataset_id == ds_id
                    )
                ).mappings()
            }
            new_names = [r["product"] for r in financial_rows if r["product"] not in existing_prods]
            prod_ids = {**existing_prods, **_product_id_map(new_names)}

            tx_inserts = []
            ord_agg: dict[str, dict[str, Any]] = {}
            cust_agg: dict[str, dict[str, Any]] = {}
            new_prods_map: dict[str, dict[str, Any]] = {}
            mkt_agg: dict[tuple[date, str], dict[str, Any]] = {}
            inv_agg: dict[tuple[date, str], dict[str, Any]] = {}

            for offset, fr in enumerate(financial_rows, start=1):
                rnum = int(max_row_num) + offset
                pid = prod_ids[fr["product"]]
                if fr["product"] not in existing_prods and pid not in new_prods_map:
                    new_prods_map[pid] = {
                        "company_id": company_id,
                        "dataset_id": ds_id,
                        "product_id": pid,
                        "product_name": fr["product"][:160],
                        "category": fr["category"][:120],
                        "brand": fr["category"][:120],
                        "list_price": fr["unit_price"],
                        "unit_cost": fr["unit_cost"],
                        "supplier": "Primary Supplier",
                        "is_physical": fr["inventory_level"] is not None,
                        "lead_time_days": 7 if fr["inventory_level"] is not None else None,
                        "reorder_point": 5 if fr["inventory_level"] is not None else None,
                        "current_stock": fr["inventory_level"],
                        "elasticity": -1.1,
                    }

                cid_slug = _slug_id("CUST", fr["customer"])[:120]
                oid = fr["order_id"] or f"ORD-{file_id[:8]}-{rnum}"
                tx_inserts.append({
                    "company_id": company_id,
                    "dataset_id": ds_id,
                    "row_num": rnum,
                    "transaction_id": f"TX-{rnum}",
                    "date": fr["date"],
                    "product_id": pid,
                    "product_name": fr["product"][:160],
                    "category": fr["category"][:120],
                    "customer_id": fr["customer"][:120],
                    "customer_segment": fr["category"][:120],
                    "region": fr["region"][:120],
                    "sales_channel": fr["channel"][:120],
                    "quantity": fr["quantity"],
                    "unit_price": fr["unit_price"],
                    "discount_pct": 0.0,
                    "revenue": fr["revenue"],
                    "unit_cost": fr["unit_cost"],
                    "total_cost": fr["total_cost"],
                    "gross_profit": fr["gross_profit"],
                    "marketing_channel": fr["channel"] if fr["marketing_spend"] is not None else None,
                    "marketing_spend": fr["marketing_spend"],
                    "inventory_level": fr["inventory_level"],
                    "custom_fields_json": fr.get("custom_fields_json"),
                    "source_file_id": file_id,
                    "source_location_json": fr.get("source_location") or {},
                })

                oe = ord_agg.setdefault(oid, {
                    "company_id": company_id,
                    "dataset_id": ds_id,
                    "order_id": oid,
                    "order_date": fr["date"],
                    "customer_id": fr["customer"][:120],
                    "region": fr["region"][:120],
                    "sales_channel": fr["channel"][:120],
                    "total_revenue": 0.0,
                    "total_cost": 0.0,
                    "gross_profit": 0.0,
                    "item_count": 0,
                    "source_file_id": file_id,
                    "extraction_id": fr.get("extraction_id"),
                    "source_location_json": fr.get("source_location") or {},
                    "validation_status": "approved",
                })
                oe["total_revenue"] = round(oe["total_revenue"] + fr["revenue"], 2)
                oe["total_cost"] = round(oe["total_cost"] + fr["total_cost"], 2)
                oe["gross_profit"] = round((oe["gross_profit"] or 0.0) + (fr["gross_profit"] or 0.0), 2)
                oe["item_count"] += fr["quantity"]

                ce = cust_agg.setdefault(cid_slug, {
                    "company_id": company_id,
                    "dataset_id": ds_id,
                    "customer_id": cid_slug,
                    "customer_name": fr["customer"][:160],
                    "segment": fr["category"][:120],
                    "region": fr["region"][:120],
                    "first_seen_date": fr["date"],
                    "last_seen_date": fr["date"],
                    "total_orders": 0,
                    "lifetime_value": 0.0,
                    "source_file_id": file_id,
                    "source_location_json": fr.get("source_location") or {},
                })
                ce["first_seen_date"] = min(ce["first_seen_date"], fr["date"])
                ce["last_seen_date"] = max(ce["last_seen_date"], fr["date"])
                ce["total_orders"] += 1
                ce["lifetime_value"] = round(ce["lifetime_value"] + fr["revenue"], 2)

                if fr["marketing_spend"] is not None and fr["marketing_spend"] >= 0:
                    mk = (fr["date"], fr["channel"][:120])
                    me = mkt_agg.setdefault(mk, {
                        "company_id": company_id, "dataset_id": ds_id, "date": fr["date"], "channel": fr["channel"][:120],
                        "spend": 0.0, "attributed_revenue": 0.0, "orders": 0, "leads": 0, "clicks": 0, "impressions": 0,
                    })
                    me["spend"] += fr["marketing_spend"]
                    me["attributed_revenue"] += fr["revenue"]
                    me["orders"] += 1
                    me["leads"] += 1

                if fr["inventory_level"] is not None:
                    ik = (fr["date"], pid)
                    ie = inv_agg.setdefault(ik, {
                        "company_id": company_id, "dataset_id": ds_id, "date": fr["date"], "product_id": pid,
                        "opening_stock": fr["inventory_level"] + fr["quantity"], "received_qty": 0,
                        "sold_qty": fr["quantity"], "closing_stock": fr["inventory_level"], "stockout_flag": fr["inventory_level"] == 0,
                    })

            if new_prods_map:
                conn.execute(tenant_products.insert(), list(new_prods_map.values()))
            for cs in range(0, len(tx_inserts), 1000):
                conn.execute(tenant_transactions.insert(), tx_inserts[cs : cs + 1000])
            for oid, o_row in ord_agg.items():
                conn.execute(tenant_orders.delete().where(tenant_orders.c.company_id == company_id, tenant_orders.c.dataset_id == ds_id, tenant_orders.c.order_id == oid))
                conn.execute(tenant_orders.insert().values(**o_row))
            for cid_k, c_row in cust_agg.items():
                existing_c = conn.execute(sa.select(tenant_customers).where(tenant_customers.c.company_id == company_id, tenant_customers.c.dataset_id == ds_id, tenant_customers.c.customer_id == cid_k)).mappings().first()
                if existing_c:
                    conn.execute(
                        tenant_customers.update()
                        .where(tenant_customers.c.company_id == company_id, tenant_customers.c.dataset_id == ds_id, tenant_customers.c.customer_id == cid_k)
                        .values(
                            last_seen_date=max(existing_c["last_seen_date"] or c_row["last_seen_date"], c_row["last_seen_date"]),
                            total_orders=int(existing_c["total_orders"] or 0) + c_row["total_orders"],
                            lifetime_value=round(float(existing_c["lifetime_value"] or 0) + c_row["lifetime_value"], 2),
                        )
                    )
                else:
                    conn.execute(tenant_customers.insert().values(**c_row))
            for mk, m_row in mkt_agg.items():
                conn.execute(tenant_marketing_daily.delete().where(tenant_marketing_daily.c.company_id == company_id, tenant_marketing_daily.c.dataset_id == ds_id, tenant_marketing_daily.c.date == mk[0], tenant_marketing_daily.c.channel == mk[1]))
                conn.execute(tenant_marketing_daily.insert().values(**m_row))
            for ik, i_row in inv_agg.items():
                conn.execute(tenant_inventory_daily.delete().where(tenant_inventory_daily.c.company_id == company_id, tenant_inventory_daily.c.dataset_id == ds_id, tenant_inventory_daily.c.date == ik[0], tenant_inventory_daily.c.product_id == ik[1]))
                conn.execute(tenant_inventory_daily.insert().values(**i_row))

        if insight_rows:
            conn.execute(tenant_multimodal_insights.insert(), insight_rows)

        eligible_ids = [r["id"] for r in eligible]
        conn.execute(
            extracted_records.update()
            .where(extracted_records.c.id.in_(eligible_ids), extracted_records.c.company_id == company_id)
            .values(
                validation_status="approved",
                needs_human_review=False,
                promoted=True,
                reviewed_by=actor,
                reviewed_at=now,
            )
        )
        conn.execute(
            multimodal_files.update()
            .where(multimodal_files.c.id == file_id, multimodal_files.c.company_id == company_id)
            .values(
                processing_status="imported",
                validation_status="approved",
                imported_at=now,
                updated_at=now,
            )
        )

        recomputed = _recompute_dataset_summary(conn, company_id=company_id, dataset_id=ds_id, currency=default_currency)
        tx_total = recomputed["counts"]["sales_transactions"]
        should_activate = bool(activate and tx_total > 0) or (not company.get("active_dataset_id") and tx_total > 0)

        if should_activate:
            conn.execute(enterprise_datasets.update().where(enterprise_datasets.c.company_id == company_id).values(is_active=False))
            conn.execute(companies.update().where(companies.c.id == company_id).values(active_dataset_id=ds_id, updated_at=now))

        conn.execute(
            enterprise_datasets.update()
            .where(enterprise_datasets.c.id == ds_id, enterprise_datasets.c.company_id == company_id)
            .values(
                status="imported",
                mapping_confirmed=True,
                quality_confirmed=True,
                is_active=should_activate if tx_total > 0 else ds["is_active"],
                row_count=max(tx_total, int(ds.get("row_count") or 0), len(eligible)),
                valid_rows=max(tx_total, len(eligible)),
                date_start=recomputed["date_start"],
                date_end=recomputed["date_end"],
                capabilities_json=recomputed["capabilities"],
                metadata_json=recomputed["metadata"],
                imported_at=now,
                updated_at=now,
            )
        )
        _log_stage(
            conn,
            dataset_id=ds_id,
            company_id=company_id,
            data_source_id=frow["data_source_id"],
            stage="multimodal_approved",
            status="completed",
            actor=actor,
            details={
                "file_id": file_id,
                "promoted_financial_rows": len(financial_rows),
                "promoted_insights": len(insight_rows),
                "activated": should_activate,
            },
        )
        conn.execute(
            audit.insert().values(
                company_id=company_id,
                kind="multimodal_approved",
                subject=file_id,
                payload={
                    "dataset_id": ds_id,
                    "file_id": file_id,
                    "financial_rows": len(financial_rows),
                    "insights": len(insight_rows),
                    "actor": actor,
                },
            )
        )
        active_info = dataset_info(conn, company_id=company_id, dataset_id=ds_id) if tx_total > 0 else None

    model_built = train_partitioned_artifacts(engine, active_info) if active_info else False
    invalidate_recs_cache(company_id)
    try:
        from backend.app.rag.ingestion import index_multimodal_file

        index_multimodal_file(engine, company_id=company_id, file_id=file_id, actor=actor)
    except Exception as exc:
        log.warning("Non-fatal RAG multimodal indexing skipped for %s: %s", file_id, exc)

    from backend.app.lineage.service import record_runtime_event

    record_runtime_event(
        engine,
        company_id=company_id,
        pipeline_key=f"multimodal:{file_id}",
        pipeline_name=f"Multimodal Pipeline — {frow['file_name']}",
        pipeline_type="multimodal_extraction",
        run_key=f"mm_run:{file_id}",
        dataset_id=ds_id,
        actor=actor,
        event_type="HITL Approved & Promoted",
        step_order=3,
        status="completed",
        event_key=f"mm:{file_id}:03_hitl",
        node_key=f"proc:mm_hitl:{file_id}",
        input_summary=f"{len(eligible)} extracted records verified",
        output_summary=f"Promoted {len(financial_rows)} rows, {len(insight_rows)} insight(s)",
    )
    return {
        "approved": True,
        "file_id": file_id,
        "dataset_id": ds_id,
        "promoted_financial_rows": len(financial_rows),
        "promoted_insights": len(insight_rows),
        "counts": recomputed["counts"],
        "activated": should_activate,
        "model_ready": model_built,
        "currency": default_currency,
    }


def delete_multimodal_file(
    engine: sa.Engine,
    storage: ObjectStorage,
    *,
    company_id: str,
    file_id: str,
    actor: str = "workspace-user",
) -> dict[str, Any]:
    with engine.begin() as conn:
        frow = get_owned_file(conn, company_id, file_id)
        ds_id = frow["dataset_id"]
        conn.execute(tenant_multimodal_insights.delete().where(tenant_multimodal_insights.c.company_id == company_id, tenant_multimodal_insights.c.source_file_id == file_id))
        conn.execute(tenant_orders.delete().where(tenant_orders.c.company_id == company_id, tenant_orders.c.source_file_id == file_id))
        conn.execute(tenant_transactions.delete().where(tenant_transactions.c.company_id == company_id, tenant_transactions.c.source_file_id == file_id))
        conn.execute(extracted_records.delete().where(extracted_records.c.file_id == file_id, extracted_records.c.company_id == company_id))
        conn.execute(ingestion_jobs.delete().where(ingestion_jobs.c.file_id == file_id, ingestion_jobs.c.company_id == company_id))
        conn.execute(multimodal_files.delete().where(multimodal_files.c.id == file_id, multimodal_files.c.company_id == company_id))
        conn.execute(
            audit.insert().values(
                company_id=company_id,
                kind="multimodal_deleted",
                subject=file_id,
                payload={"dataset_id": ds_id, "file_name": frow["file_name"], "actor": actor},
            )
        )

    removed_frames = storage.delete_prefix(f"companies/{company_id}/datasets/{ds_id}/files/{file_id}")
    removed_raw = 1 if storage.delete(frow["storage_key"]) else 0
    invalidate_recs_cache(company_id)
    try:
        from backend.app.rag.ingestion import delete_by_source

        delete_by_source(engine, company_id=company_id, source_file_id=file_id)
    except Exception as exc:
        log.warning("Non-fatal RAG cleanup skipped for file %s: %s", file_id, exc)
    return {
        "deleted": True,
        "file_id": file_id,
        "dataset_id": ds_id,
        "removed_storage_objects": removed_frames + removed_raw,
    }


def list_company_insights(
    conn: sa.Connection,
    *,
    company_id: str,
    dataset_id: str | None = None,
    modality: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    q = sa.select(tenant_multimodal_insights).where(tenant_multimodal_insights.c.company_id == company_id)
    if dataset_id:
        q = q.where(tenant_multimodal_insights.c.dataset_id == dataset_id)
    if modality:
        q = q.where(tenant_multimodal_insights.c.modality == modality)
    q = q.order_by(tenant_multimodal_insights.c.approved_at.desc()).limit(limit)
    rows = conn.execute(q).mappings().all()
    return [
        {
            "id": r["id"],
            "company_id": r["company_id"],
            "dataset_id": r["dataset_id"],
            "source_file_id": r["source_file_id"],
            "extraction_id": r.get("extraction_id"),
            "modality": r["modality"],
            "entity_type": r["entity_type"],
            "insight_date": r["insight_date"].isoformat() if r.get("insight_date") else None,
            "title": r["title"],
            "summary_text": r["summary_text"],
            "metrics": r.get("metrics_json") or {},
            "source_location": r.get("source_location_json") or {},
            "confidence_score": r.get("confidence_score"),
            "extraction_method": r["extraction_method"],
            "validation_status": r["validation_status"],
            "approved_by": r["approved_by"],
            "approved_at": _json_safe_iso(r.get("approved_at")),
        }
        for r in rows
    ]
