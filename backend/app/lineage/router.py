"""REST & Server-Sent Events API endpoints for Enterprise Data Traceability & Lineage."""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
import json
from typing import Annotated, Any

from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import StreamingResponse
import sqlalchemy as sa
from starlette.concurrency import run_in_threadpool

from backend.app.db import ingestion_jobs, pipeline_events
from backend.app.ingestion.router import require_role, resolve_tenant
from backend.app.lineage import service as lineage_service


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


def _stream_fingerprint(engine: sa.Engine, company_id: str) -> dict[str, Any]:
    """Compute a real snapshot signature & active-processing payload for SSE diffs."""
    graph = lineage_service.get_lineage_graph(engine, company_id=company_id)
    with engine.connect() as conn:
        active_jobs = [
            {
                "id": r["id"],
                "file_id": r.get("file_id"),
                "status": r["status"],
                "stage": r["stage"],
                "progress_pct": int(r.get("progress_pct") or 0),
            }
            for r in conn.execute(
                sa.select(ingestion_jobs)
                .where(
                    ingestion_jobs.c.company_id == company_id,
                    ingestion_jobs.c.status.in_(["queued", "running"]),
                )
                .order_by(ingestion_jobs.c.created_at.desc())
            ).mappings()
        ]
        latest_evt = conn.execute(
            sa.select(pipeline_events.c.id, pipeline_events.c.timestamp)
            .where(pipeline_events.c.company_id == company_id)
            .order_by(pipeline_events.c.timestamp.desc(), pipeline_events.c.step_order.desc())
            .limit(1)
        ).mappings().first()

    processing_node_ids = [n["id"] for n in graph["nodes"] if n["status"] == "processing"]
    processing_edge_ids = [e["id"] for e in graph["edges"] if e["status"] == "processing"]
    sig_tuple = (
        graph["summary"].get("last_synchronized"),
        len(graph["nodes"]),
        len(graph["edges"]),
        [(j["id"], j["status"], j["progress_pct"]) for j in active_jobs],
        sorted(processing_node_ids),
        sorted((n["id"], n["status"]) for n in graph["nodes"]),
        latest_evt["id"] if latest_evt else None,
    )
    return {
        "signature": json.dumps(sig_tuple, sort_keys=True, default=str),
        "payload": {
            "company_id": company_id,
            "synced_at": graph["synced_at"],
            "summary": graph["summary"],
            "has_active_processing": graph["has_active_processing"] or bool(active_jobs),
            "active_jobs": active_jobs,
            "processing_node_ids": processing_node_ids,
            "processing_edge_ids": processing_edge_ids,
            "recent_events": graph["recent_events"][:10],
        },
    }


def build_lineage_router(engine: sa.Engine) -> APIRouter:
    router = APIRouter(prefix="/lineage", tags=["Enterprise Data Traceability"])

    @router.get("/graph")
    def get_graph(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        node_type: str | None = None,
        status: str | None = None,
        pipeline_id: str | None = None,
        source_id: str | None = None,
        model: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        owner: str | None = None,
        search: str | None = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return lineage_service.get_lineage_graph(
            engine,
            company_id=cid,
            node_type=node_type,
            status=status,
            pipeline_id=pipeline_id,
            source_id=source_id,
            model=model,
            date_from=date_from,
            date_to=date_to,
            owner=owner,
            search=search,
        )

    @router.get("/nodes/{node_id}")
    def get_node(
        node_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return lineage_service.get_node_detail(engine, company_id=cid, node_id=node_id)

    @router.get("/nodes/{node_id}/upstream")
    def get_upstream(
        node_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return lineage_service.traverse_lineage(engine, company_id=cid, node_id=node_id, direction="upstream")

    @router.get("/nodes/{node_id}/downstream")
    def get_downstream(
        node_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return lineage_service.traverse_lineage(engine, company_id=cid, node_id=node_id, direction="downstream")

    @router.get("/nodes/{node_id}/impact")
    def get_impact(
        node_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return lineage_service.analyze_impact(engine, company_id=cid, node_id=node_id)

    @router.get("/pipelines")
    def list_pipelines(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return lineage_service.list_pipelines_summary(engine, company_id=cid)

    @router.get("/pipelines/{pipeline_id}/runs")
    def get_pipeline_runs(
        pipeline_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return lineage_service.list_pipeline_runs(engine, company_id=cid, pipeline_id=pipeline_id)

    @router.get("/runs/{run_id}/events")
    def get_run_events(
        run_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return lineage_service.get_run_events(engine, company_id=cid, run_id=run_id)

    @router.get("/stream")
    async def stream_lineage(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        once: bool = Query(default=False),
        poll_seconds: float = Query(default=2.0, ge=0.5, le=10.0),
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)

        async def event_stream():
            snap = await run_in_threadpool(lambda: _stream_fingerprint(engine, cid))
            last_sig = snap["signature"]
            yield _sse("lineage_snapshot", snap["payload"])
            if once:
                return

            heartbeat_ticks = max(1, int(15.0 / poll_seconds))
            for tick in range(1, 22):
                await asyncio.sleep(poll_seconds)
                if await request.is_disconnected():
                    break
                cur = await run_in_threadpool(lambda: _stream_fingerprint(engine, cid))
                if cur["signature"] != last_sig:
                    last_sig = cur["signature"]
                    yield _sse("lineage_update", cur["payload"])
                elif tick % heartbeat_ticks == 0:
                    yield _sse(
                        "heartbeat",
                        {
                            "company_id": cid,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "has_active_processing": cur["payload"]["has_active_processing"],
                        },
                    )

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return router
