"""REST API endpoints for multi-tenant Enterprise Data Ingestion, Quality Validation & Workspaces."""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, Response, UploadFile
import sqlalchemy as sa
from starlette.concurrency import run_in_threadpool

from backend.app.db import read_connection
from backend.app.ingestion import service
from backend.app.ingestion.connectors import get_connector, list_connectors
from backend.app.ingestion.parsers import MAX_FILE_BYTES
from backend.app.ingestion.storage import ObjectStorage, get_object_storage
from backend.app.multimodal import connectors_live
from backend.app.multimodal.security import extract_secret_fields
from backend.app.schemas import (
    ColumnMappingSaveRequest,
    CompanyCreateRequest,
    DataSourceCreateRequest,
    DataSourceTestRequest,
    ImportConfirmRequest,
    PreviewRequest,
    ValidateRequest,
)
from backend.app.security import authorize_company

ROLE_LEVEL = {"viewer": 0, "analyst": 1, "admin": 2}


def require_role(request: Request, minimum: str) -> dict:
    identity = getattr(request.state, "identity", None)
    if not identity:
        raise HTTPException(401, "Sign in with a workspace access token.")
    if ROLE_LEVEL[identity["role"]] < ROLE_LEVEL[minimum]:
        raise HTTPException(403, f"Role '{minimum}' or higher is required for this operation.")
    return identity


def resolve_tenant(request: Request, x_company_id: str | None = None) -> str:
    identity = getattr(request.state, "identity", None)
    if not identity:
        raise HTTPException(401, "Sign in with a workspace access token.")
    raw_company = x_company_id or request.query_params.get("company_id") or request.headers.get("x-company-id")
    try:
        return authorize_company(identity, raw_company)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


async def _read_upload_bounded(upload: UploadFile) -> bytes:
    buf = bytearray()
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        if len(buf) + len(chunk) > MAX_FILE_BYTES:
            limit_mb = MAX_FILE_BYTES // (1024 * 1024)
            raise HTTPException(413, f"Upload exceeds maximum allowed file size ({limit_mb} MiB).")
        buf.extend(chunk)
    return bytes(buf)


def build_ingestion_router(engine: sa.Engine, storage: ObjectStorage | None = None) -> APIRouter:
    store = storage or get_object_storage()
    router = APIRouter(tags=["Enterprise Data Ingestion"])

    @router.get("/companies")
    def get_companies(request: Request):
        identity = require_role(request, "viewer")
        with engine.begin() as conn:
            service.sync_default_legacy_dataset(conn, "comp-default")
        with read_connection(engine) as conn:
            return {"items": service.list_companies(conn, identity.get("company_ids", ["comp-default"]))}

    @router.post("/companies", status_code=201)
    def post_company(body: CompanyCreateRequest, request: Request):
        identity = require_role(request, "admin")
        if "*" not in identity.get("company_ids", []):
            raise HTTPException(403, "Only global platform admins can provision new company tenants.")
        return service.create_company(
            engine, name=body.name, slug=body.slug, actor=identity["actor"], activate=body.activate
        )

    @router.get("/connectors")
    def get_connectors(request: Request):
        require_role(request, "viewer")
        return {"items": list_connectors()}

    @router.get("/data-sources")
    def get_data_sources(request: Request, x_company_id: Annotated[str | None, Header()] = None):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with engine.begin() as conn:
            service._ensure_company_and_source(conn, cid)
        with read_connection(engine) as conn:
            return {"company_id": cid, "items": service.list_company_data_sources(conn, cid)}

    @router.post("/data-sources", status_code=201)
    def post_data_source(
        body: DataSourceCreateRequest, request: Request, x_company_id: Annotated[str | None, Header()] = None
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return service.create_company_data_source(
            engine, company_id=cid, name=body.name, source_type=body.source_type, config=body.config, actor=identity["actor"]
        )

    @router.post("/data-sources/test")
    def test_data_source(body: DataSourceTestRequest, request: Request):
        require_role(request, "analyst")
        try:
            connector = get_connector(body.source_type)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        if body.live_probe:
            return connectors_live.test_live_connection(
                body.source_type,
                body.config,
                secrets=extract_secret_fields(body.config),
            )
        return connector.test_connection(body.config)

    @router.get("/mapping-templates")
    def get_templates(request: Request, x_company_id: Annotated[str | None, Header()] = None):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            return {"company_id": cid, "items": service.list_company_templates(conn, cid)}

    @router.delete("/mapping-templates/{template_id}")
    def remove_template(template_id: str, request: Request, x_company_id: Annotated[str | None, Header()] = None):
        require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return service.delete_company_template(engine, company_id=cid, template_id=template_id)

    @router.post("/datasets/upload")
    async def upload_dataset(
        request: Request,
        file: UploadFile = File(...),
        dataset_name: Annotated[str | None, Form()] = None,
        sheet_name: Annotated[str | None, Form()] = None,
        data_source_id: Annotated[str | None, Form()] = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        blob = await _read_upload_bounded(file)
        filename = file.filename or "upload.csv"
        return await run_in_threadpool(
            service.upload_dataset,
            engine,
            store,
            company_id=cid,
            filename=filename,
            blob=blob,
            dataset_name=dataset_name,
            sheet_name=sheet_name,
            data_source_id=data_source_id,
            actor=identity["actor"],
        )

    @router.post("/datasets/{dataset_id}/preview")
    async def preview_dataset(
        dataset_id: str,
        request: Request,
        body: PreviewRequest | None = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        req = body or PreviewRequest()

        def _work():
            with read_connection(engine) as conn:
                return service.preview_dataset(
                    conn, store, company_id=cid, dataset_id=dataset_id, sheet_name=req.sheet_name, limit=req.limit
                )

        return await run_in_threadpool(_work)

    @router.post("/datasets/{dataset_id}/mapping")
    async def save_mapping(
        dataset_id: str,
        body: ColumnMappingSaveRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return await run_in_threadpool(
            service.save_mapping,
            engine,
            store,
            company_id=cid,
            dataset_id=dataset_id,
            mappings=body.mappings,
            custom_fields=body.custom_fields,
            sheet_name=body.sheet_name,
            currency=body.currency,
            confirmed=body.confirmed,
            save_template=body.save_template,
            template_name=body.template_name,
            template_id=body.template_id,
            actor=identity["actor"],
        )

    @router.post("/datasets/{dataset_id}/validate")
    async def validate_dataset(
        dataset_id: str,
        request: Request,
        body: ValidateRequest | None = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        req = body or ValidateRequest()
        return await run_in_threadpool(
            service.validate_dataset,
            engine,
            store,
            company_id=cid,
            dataset_id=dataset_id,
            sheet_name=req.sheet_name,
            mappings=req.mappings,
            custom_fields=req.custom_fields,
            invalid_row_policy=req.invalid_row_policy,
            duplicate_policy=req.duplicate_policy,
            currency=req.currency,
            actor=identity["actor"],
        )

    @router.post("/datasets/{dataset_id}/import")
    async def import_dataset(
        dataset_id: str,
        request: Request,
        body: ImportConfirmRequest | None = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        req = body or ImportConfirmRequest()
        return await run_in_threadpool(
            service.import_dataset,
            engine,
            store,
            company_id=cid,
            dataset_id=dataset_id,
            confirmed=req.confirmed,
            sheet_name=req.sheet_name,
            invalid_row_policy=req.invalid_row_policy,
            duplicate_policy=req.duplicate_policy,
            currency=req.currency,
            activate=req.activate,
            actor=identity["actor"],
        )

    @router.post("/datasets/{dataset_id}/activate")
    def activate_dataset(
        dataset_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return service.activate_dataset(engine, company_id=cid, dataset_id=dataset_id, actor=identity["actor"])

    @router.get("/datasets")
    def list_datasets(request: Request, x_company_id: Annotated[str | None, Header()] = None):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        if cid == "comp-default":
            with engine.begin() as conn:
                service.sync_default_legacy_dataset(conn, cid)
        with read_connection(engine) as conn:
            return service.list_company_datasets(conn, cid)

    @router.get("/datasets/{dataset_id}")
    def get_dataset(
        dataset_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            return service.get_dataset_detail(conn, company_id=cid, dataset_id=dataset_id)

    @router.get("/datasets/{dataset_id}/quality")
    def get_quality(
        dataset_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            return service.get_dataset_quality(conn, company_id=cid, dataset_id=dataset_id)

    @router.get("/datasets/{dataset_id}/error-report")
    def download_error_report(
        dataset_id: str,
        request: Request,
        format: Literal["csv", "json"] = "csv",
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            blob, media_type, download_name = service.get_error_report_content(
                conn, store, company_id=cid, dataset_id=dataset_id, fmt=format
            )
        return Response(
            content=blob,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
        )

    @router.get("/datasets/{dataset_id}/history")
    def get_history(
        dataset_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            return service.get_import_history(conn, company_id=cid, dataset_id=dataset_id)

    @router.delete("/datasets/{dataset_id}")
    def delete_dataset(
        dataset_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "admin")
        cid = resolve_tenant(request, x_company_id)
        return service.delete_dataset(engine, store, company_id=cid, dataset_id=dataset_id, actor=identity["actor"])

    return router

