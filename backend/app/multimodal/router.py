"""REST API router for Multimodal Data Ingestion, Async Processing, HITL Approval, Media Previews & Live Connectors."""
from __future__ import annotations

from datetime import date, datetime
import re
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, Request, Response, UploadFile
import sqlalchemy as sa
from starlette.concurrency import run_in_threadpool

from backend.app.db import connector_sync_logs, data_sources, ingestion_jobs, read_connection
from backend.app.ingestion.parsers import IngestionValidationError
from backend.app.ingestion.router import require_role, resolve_tenant
from backend.app.ingestion.service import _json_safe_iso
from backend.app.ingestion.storage import ObjectStorage, StorageSecurityError, get_object_storage
from backend.app.multimodal import connectors_live
from backend.app.multimodal import service as mm_service
from backend.app.multimodal.jobs import MultimodalJobQueue, serialize_job
from backend.app.multimodal.security import (
    MODALITY_BY_EXT,
    MIME_BY_EXT,
    decrypt_secrets,
    max_bytes_for_modality,
    sign_file_token,
    verify_file_token,
)
from backend.app.schemas import DataSourceSyncRequest, ExtractionPatchRequest, MultimodalApproveRequest
from backend.app.security import authorize_company

SUBKEY_PATTERN = re.compile(r"^frame_\d{3}\.jpg$")
INLINE_SAFE_EXTS = {"jpg", "jpeg", "png", "webp", "mp4", "mov", "avi", "mp3", "wav", "m4a", "pdf"}


async def _read_multimodal_upload(upload: UploadFile) -> tuple[str, bytes, str | None]:
    fname = upload.filename or "upload.bin"
    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
    modality = MODALITY_BY_EXT.get(ext, "structured")
    limit_bytes = max_bytes_for_modality(modality)
    buf = bytearray()
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        if len(buf) + len(chunk) > limit_bytes:
            limit_mb = max(1, limit_bytes // (1024 * 1024))
            raise HTTPException(
                413, f"File '{fname}' exceeds maximum allowed size ({limit_mb} MiB for {modality})."
            )
        buf.extend(chunk)
    return fname, bytes(buf), upload.content_type


def build_multimodal_router(
    engine: sa.Engine,
    *,
    storage: ObjectStorage | None = None,
    job_queue: MultimodalJobQueue | None = None,
) -> APIRouter:
    store = storage or get_object_storage()
    queue = job_queue or mm_service.create_job_queue(engine, store)
    router = APIRouter(tags=["Multimodal Ingestion & Intelligence"])

    @router.post("/multimodal/upload", status_code=202)
    async def upload_multimodal(
        request: Request,
        files: list[UploadFile] = File(...),
        dataset_id: Annotated[str | None, Form()] = None,
        dataset_name: Annotated[str | None, Form()] = None,
        data_source_id: Annotated[str | None, Form()] = None,
        confidence_threshold: Annotated[float, Form()] = 0.8,
        sampling_interval_sec: Annotated[float, Form()] = 5.0,
        max_frames: Annotated[int, Form()] = 10,
        retention_days: Annotated[int, Form()] = 90,
        consent_external_ai: Annotated[bool, Form()] = False,
        privacy_notice_accepted: Annotated[bool, Form()] = False,
        idempotency_key: Annotated[str | None, Form()] = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        payloads: list[tuple[str, bytes, str | None]] = []
        for f in files:
            payloads.append(await _read_multimodal_upload(f))
        return await run_in_threadpool(
            mm_service.upload_multimodal_files,
            engine,
            store,
            queue,
            company_id=cid,
            files_payload=payloads,
            dataset_id=dataset_id,
            dataset_name=dataset_name,
            data_source_id=data_source_id,
            confidence_threshold=confidence_threshold,
            sampling_interval_sec=sampling_interval_sec,
            max_frames=max_frames,
            retention_days=retention_days,
            consent_external_ai=consent_external_ai,
            privacy_notice_accepted=privacy_notice_accepted,
            idempotency_key=idempotency_key,
            actor=identity["actor"],
        )

    @router.get("/files")
    def list_files(
        request: Request,
        modality: str | None = None,
        file_format: str | None = None,
        dataset_id: str | None = None,
        processing_status: str | None = None,
        data_source_id: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            items = mm_service.list_multimodal_files(
                conn,
                company_id=cid,
                modality=modality,
                file_format=file_format,
                dataset_id=dataset_id,
                processing_status=processing_status,
                data_source_id=data_source_id,
                date_from=date_from,
                date_to=date_to,
            )
            return {"company_id": cid, "items": items}

    @router.get("/files/{file_id}")
    def get_file(
        file_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            f = mm_service.get_owned_file(conn, cid, file_id)
            jobs = [
                serialize_job(dict(r))
                for r in conn.execute(
                    sa.select(ingestion_jobs)
                    .where(ingestion_jobs.c.file_id == file_id, ingestion_jobs.c.company_id == cid)
                    .order_by(ingestion_jobs.c.created_at.desc())
                ).mappings()
            ]
            return {"file": mm_service.serialize_multimodal_file(f), "jobs": jobs}

    @router.get("/files/{file_id}/signed-url")
    def get_signed_url(
        file_id: str,
        request: Request,
        subkey: str = "raw",
        ttl_seconds: Annotated[int, Query(ge=30, le=86400)] = 900,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        if subkey != "raw" and not SUBKEY_PATTERN.match(subkey):
            raise HTTPException(422, "Invalid media subkey.")
        with read_connection(engine) as conn:
            mm_service.get_owned_file(conn, cid, file_id)
        tok, exp = sign_file_token(company_id=cid, file_id=file_id, subkey=subkey, ttl_seconds=ttl_seconds)
        return {
            "file_id": file_id,
            "subkey": subkey,
            "url": f"/api/v1/files/{file_id}/content?subkey={subkey}&token={tok}",
            "expires_at_epoch": exp,
        }

    @router.get("/files/{file_id}/content")
    def get_file_content(
        file_id: str,
        request: Request,
        subkey: str = "raw",
        token: str | None = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        if subkey != "raw" and not SUBKEY_PATTERN.match(subkey):
            raise HTTPException(422, "Invalid media subkey.")

        with read_connection(engine) as conn:
            frow = conn.execute(sa.select(mm_service.multimodal_files).where(mm_service.multimodal_files.c.id == file_id)).mappings().first()
            if frow is None:
                raise HTTPException(404, "Multimodal file not found.")
            f = dict(frow)

        identity = getattr(request.state, "identity", None)
        if identity is not None:
            try:
                cid = authorize_company(identity, x_company_id or request.query_params.get("company_id") or f["company_id"])
            except PermissionError as exc:
                raise HTTPException(403, str(exc)) from exc
            if f["company_id"] != cid:
                raise HTTPException(403, "Cross-tenant file access denied.")
        else:
            if not token or not verify_file_token(token, company_id=f["company_id"], file_id=file_id, subkey=subkey):
                raise HTTPException(401, "Valid signed URL token or workspace authentication required.")

        if subkey == "raw":
            target_key = f["storage_key"]
            ext = f["file_format"]
            media_type = f["mime_type"] if ext in INLINE_SAFE_EXTS else "application/octet-stream"
            disp = "inline" if ext in INLINE_SAFE_EXTS else "attachment"
            dl_name = f["file_name"]
        else:
            target_key = f"companies/{f['company_id']}/datasets/{f['dataset_id']}/files/{file_id}/frames/{subkey}"
            media_type = "image/jpeg"
            disp = "inline"
            dl_name = subkey

        try:
            blob = store.get_bytes(target_key)
        except (FileNotFoundError, StorageSecurityError) as exc:
            raise HTTPException(404, "Stored media object not found.") from exc

        return Response(
            content=blob,
            media_type=media_type,
            headers={
                "X-Content-Type-Options": "nosniff",
                "Content-Disposition": f'{disp}; filename="{dl_name}"',
            },
        )

    @router.delete("/files/{file_id}")
    def remove_file(
        file_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "admin")
        cid = resolve_tenant(request, x_company_id)
        return mm_service.delete_multimodal_file(
            engine, store, company_id=cid, file_id=file_id, actor=identity["actor"]
        )

    @router.get("/jobs")
    def list_jobs(
        request: Request,
        dataset_id: str | None = None,
        file_id: str | None = None,
        status: str | None = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            q = sa.select(ingestion_jobs).where(ingestion_jobs.c.company_id == cid)
            if dataset_id:
                q = q.where(ingestion_jobs.c.dataset_id == dataset_id)
            if file_id:
                q = q.where(ingestion_jobs.c.file_id == file_id)
            if status:
                q = q.where(ingestion_jobs.c.status == status)
            q = q.order_by(ingestion_jobs.c.created_at.desc()).limit(100)
            return {"company_id": cid, "items": [serialize_job(dict(r)) for r in conn.execute(q).mappings()]}

    @router.get("/jobs/{job_id}")
    def get_job(
        job_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            row = conn.execute(sa.select(ingestion_jobs).where(ingestion_jobs.c.id == job_id)).mappings().first()
            if row is None:
                raise HTTPException(404, "Ingestion job not found.")
            if row["company_id"] != cid:
                raise HTTPException(403, "Cross-tenant job access denied.")
            return serialize_job(dict(row))

    @router.post("/jobs/{job_id}/retry")
    def retry_job(
        job_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        try:
            return queue.retry_job(job_id, company_id=cid)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(403, str(exc)) from exc

    @router.get("/files/{file_id}/extractions")
    def list_file_extractions(
        file_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            return mm_service.get_file_extractions(conn, company_id=cid, file_id=file_id)

    @router.patch("/extractions/{record_id}")
    def patch_extraction(
        record_id: str,
        body: ExtractionPatchRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return mm_service.patch_extracted_record(
            engine,
            company_id=cid,
            record_id=record_id,
            corrected_data=body.corrected_data,
            validation_status=body.validation_status,
            actor=identity["actor"],
        )

    @router.post("/files/{file_id}/approve-import")
    async def approve_import_file(
        file_id: str,
        request: Request,
        body: MultimodalApproveRequest | None = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        req = body or MultimodalApproveRequest()
        return await run_in_threadpool(
            mm_service.approve_and_import_file,
            engine,
            store,
            company_id=cid,
            file_id=file_id,
            confirmed=req.confirmed,
            record_ids=req.record_ids,
            approve_below_threshold=req.approve_below_threshold,
            activate=req.activate,
            currency=req.currency,
            actor=identity["actor"],
        )

    def _get_owned_source(conn: sa.Connection, company_id: str, source_id: str) -> dict[str, Any]:
        row = conn.execute(sa.select(data_sources).where(data_sources.c.id == source_id)).mappings().first()
        if row is None:
            raise HTTPException(404, "Data source not found.")
        if row["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant data source access denied.")
        return dict(row)

    @router.post("/data-sources/{source_id}/test")
    def probe_saved_source(
        source_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            src = _get_owned_source(conn, cid, source_id)
        secrets = decrypt_secrets(src.get("encrypted_secrets_json"))
        return connectors_live.test_live_connection(src["source_type"], src.get("config_json") or {}, secrets=secrets)

    @router.post("/data-sources/{source_id}/discover")
    def discover_saved_source(
        source_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            src = _get_owned_source(conn, cid, source_id)
        try:
            return connectors_live.discover_source_schema(src)
        except IngestionValidationError as exc:
            raise HTTPException(422, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(502, f"Live schema discovery failed: {exc}") from exc

    @router.post("/data-sources/{source_id}/sync")
    async def sync_saved_source(
        source_id: str,
        request: Request,
        body: DataSourceSyncRequest | None = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        req = body or DataSourceSyncRequest()

        def _do_sync():
            try:
                return connectors_live.sync_source_incremental(
                    engine,
                    store,
                    company_id=cid,
                    source_id=source_id,
                    dataset_name=req.dataset_name,
                    watermark_column=req.watermark_column,
                    actor=identity["actor"],
                )
            except LookupError as exc:
                raise HTTPException(404, str(exc)) from exc
            except PermissionError as exc:
                raise HTTPException(403, str(exc)) from exc
            except IngestionValidationError as exc:
                raise HTTPException(422, str(exc)) from exc
            except Exception as exc:
                raise HTTPException(502, f"Live incremental sync failed: {exc}") from exc

        return await run_in_threadpool(_do_sync)

    @router.get("/data-sources/{source_id}/sync-logs")
    def get_sync_logs(
        source_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            _get_owned_source(conn, cid, source_id)
            rows = conn.execute(
                sa.select(connector_sync_logs)
                .where(
                    connector_sync_logs.c.data_source_id == source_id,
                    connector_sync_logs.c.company_id == cid,
                )
                .order_by(connector_sync_logs.c.started_at.desc())
                .limit(50)
            ).mappings().all()
            return {
                "source_id": source_id,
                "items": [
                    {
                        "id": r["id"],
                        "dataset_id": r["dataset_id"],
                        "sync_mode": r["sync_mode"],
                        "status": r["status"],
                        "watermark_before": r["watermark_before"],
                        "watermark_after": r["watermark_after"],
                        "records_fetched": int(r["records_fetched"] or 0),
                        "actor": r["actor"],
                        "details": r["details_json"] or {},
                        "error_message": r["error_message"],
                        "started_at": _json_safe_iso(r["started_at"]),
                        "finished_at": _json_safe_iso(r["finished_at"]),
                    }
                    for r in rows
                ],
            }

    @router.get("/insights")
    def get_insights(
        request: Request,
        dataset_id: str | None = None,
        modality: str | None = None,
        limit: Annotated[int, Query(ge=1, le=200)] = 50,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            return {
                "company_id": cid,
                "items": mm_service.list_company_insights(
                    conn, company_id=cid, dataset_id=dataset_id, modality=modality, limit=limit
                ),
            }

    return router

