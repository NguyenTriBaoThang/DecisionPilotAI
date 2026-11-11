"""REST API endpoints for Enterprise XAI Recommendations Workflow & Cryptographic Audit Governance."""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Header, Query, Request, Response
import sqlalchemy as sa

from backend.app.governance import service
from backend.app.governance.hash_chain import verify_audit_hash_chain
from backend.app.governance.schemas import (
    RecommendationActionRequest,
    RecommendationOutcomeRequest,
    RiskResolveRequest,
)
from backend.app.ingestion.router import require_role, resolve_tenant


def _resolve_ds(request: Request, x_dataset_id: str | None = None) -> str | None:
    raw = x_dataset_id or request.query_params.get("dataset_id") or request.headers.get("x-dataset-id")
    return raw.strip() if raw and raw.strip() else None


def build_governance_router(engine: sa.Engine) -> APIRouter:
    router = APIRouter(tags=["XAI Recommendations & Audit Governance"])

    @router.get("/recommendations")
    def recommendations_overview(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
        category: str | None = None,
        status: str | None = None,
        priority: str | None = None,
        confidence: str | None = None,
        search: str | None = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        ds_id = _resolve_ds(request, x_dataset_id)
        return service.get_recommendations_overview(
            engine,
            company_id=cid,
            dataset_id=ds_id,
            category=category,
            status=status,
            priority=priority,
            confidence=confidence,
            search=search,
        )

    @router.get("/recommendations/{rec_id}")
    def recommendation_detail(
        rec_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        ds_id = _resolve_ds(request, x_dataset_id)
        return service.get_recommendation_detail(engine, company_id=cid, rec_identifier=rec_id, dataset_id=ds_id)

    @router.post("/recommendations/{rec_id}/action")
    def recommendation_action(
        rec_id: str,
        body: RecommendationActionRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        ds_id = _resolve_ds(request, x_dataset_id)
        return service.apply_recommendation_action(
            engine,
            company_id=cid,
            rec_identifier=rec_id,
            body=body,
            identity=identity,
            dataset_id=ds_id,
        )

    @router.post("/recommendations/{rec_id}/outcome")
    def recommendation_outcome(
        rec_id: str,
        body: RecommendationOutcomeRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        ds_id = _resolve_ds(request, x_dataset_id)
        return service.record_recommendation_outcome(
            engine,
            company_id=cid,
            rec_identifier=rec_id,
            body=body,
            identity=identity,
            dataset_id=ds_id,
        )

    @router.get("/recommendations/{rec_id}/trace")
    def recommendation_trace(
        rec_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        ds_id = _resolve_ds(request, x_dataset_id)
        return service.get_decision_trace(engine, company_id=cid, rec_identifier=rec_id, dataset_id=ds_id)

    @router.get("/audit/overview")
    def audit_overview(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        ds_id = _resolve_ds(request, x_dataset_id)
        return service.get_audit_overview(engine, company_id=cid, dataset_id=ds_id)

    @router.get("/audit/events")
    def audit_events(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        kind: str | None = None,
        limit: Annotated[int, Query(ge=1, le=200)] = 50,
        before: Annotated[int | None, Query(ge=1)] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return service.list_audit_events(engine, company_id=cid, kind=kind, limit=limit, before=before)

    @router.get("/audit/models")
    def audit_models(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        ds_id = _resolve_ds(request, x_dataset_id)
        return service.get_model_governance(engine, company_id=cid, dataset_id=ds_id)

    @router.get("/audit/risks")
    def audit_risks(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        status: Literal["all", "open", "acknowledged", "resolved"] | None = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return service.list_audit_risks(engine, company_id=cid, status=status)

    @router.post("/audit/risks/{risk_id}/resolve")
    def resolve_risk(
        risk_id: str,
        body: RiskResolveRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return service.resolve_audit_risk(
            engine,
            company_id=cid,
            risk_id=risk_id,
            body=body,
            identity=identity,
        )

    @router.get("/audit/integrity")
    def audit_integrity(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with engine.connect() as conn:
            return verify_audit_hash_chain(conn, cid)

    @router.get("/audit/export")
    def audit_export(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        format: Literal["csv", "json"] = "csv",
        kind: str | None = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        content, media_type, filename = service.export_audit_bundle(engine, company_id=cid, fmt=format, kind=kind)
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )

    return router

