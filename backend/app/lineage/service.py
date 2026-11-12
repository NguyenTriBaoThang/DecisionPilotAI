"""Enterprise Data Traceability & Lineage Service: real-time event hooks, DB reconciler, BFS lineage & impact analysis."""
from __future__ import annotations

from collections import deque
from datetime import date, datetime, timezone
import hashlib
import json
import logging
import threading
from typing import Any

from fastapi import HTTPException
import sqlalchemy as sa

from backend.app import services
from backend.app.analytics import FULL_CAPABILITIES, dataset_info
from backend.app.db import (
    ARTIFACTS,
    audit,
    business_insights,
    chat_messages,
    companies,
    connector_sync_logs,
    data_sources,
    dataset_quality_reports,
    datasets as legacy_datasets,
    enterprise_datasets,
    extracted_records,
    import_logs,
    ingestion_jobs,
    lineage_edges,
    lineage_nodes,
    multimodal_files,
    pipeline_events,
    pipeline_runs,
    pipelines,
    rag_chunks,
    rag_documents,
    simulations,
    tenant_multimodal_insights,
)
from backend.app.rag.config import get_rag_settings
from backend.app.rag.embeddings import get_embedding_provider

log = logging.getLogger(__name__)

NODE_TYPES = (
    "data_source",
    "processing",
    "storage",
    "ai_model",
    "business_intelligence",
    "final_output",
)

LAYER_BY_TYPE = {
    "data_source": 0,
    "processing": 1,
    "storage": 2,
    "ai_model": 3,
    "business_intelligence": 4,
    "final_output": 5,
}

STATUS_PRIORITY = {
    "failed": 5,
    "processing": 4,
    "warning": 3,
    "pending": 2,
    "normal": 1,
    "completed": 1,
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: Any) -> datetime | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    if isinstance(dt, date):
        return datetime.combine(dt, datetime.min.time(), tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(dt).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _iso(dt: Any) -> str | None:
    d = _as_utc(dt)
    return d.isoformat() if d else None


def _det_id(prefix: str, company_id: str, key: str) -> str:
    digest = hashlib.sha1(f"{company_id}:{key}".encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"


def _pick_status(*statuses: str) -> str:
    best = "completed"
    best_rank = -1
    for st in statuses:
        norm = (st or "completed").lower()
        rank = STATUS_PRIORITY.get(norm, 0)
        if rank > best_rank:
            best_rank = rank
            best = norm
    return best


def _ms_between(start_dt: Any, end_dt: Any) -> float | None:
    s = _as_utc(start_dt)
    e = _as_utc(end_dt)
    if s and e and e >= s:
        return round((e - s).total_seconds() * 1000.0, 2)
    return None


def _dialect_label(engine: sa.Engine) -> str:
    return "PostgreSQL" if engine.dialect.name == "postgresql" else "SQLite"


def _serialize_node(row: dict[str, Any]) -> dict[str, Any]:
    meta = dict(row.get("metadata_json") or {})
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "external_id": row.get("external_id"),
        "pipeline_id": row.get("pipeline_id"),
        "dataset_id": row.get("dataset_id"),
        "name": row["name"],
        "node_type": row["node_type"],
        "sub_type": row["sub_type"],
        "status": row["status"],
        "owner": row.get("owner") or "system",
        "layer_order": int(row.get("layer_order") or LAYER_BY_TYPE.get(row["node_type"], 0)),
        "metadata": meta,
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
    }


def _serialize_edge(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "pipeline_id": row.get("pipeline_id"),
        "run_id": row.get("run_id"),
        "source_node_id": row["source_node_id"],
        "target_node_id": row["target_node_id"],
        "relationship_type": row["relationship_type"],
        "status": row["status"],
        "data_transferred": row.get("data_transferred"),
        "record_count": row.get("record_count"),
        "transformation": row.get("transformation"),
        "metadata": dict(row.get("metadata_json") or {}),
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
    }


def _serialize_pipeline(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "name": row["name"],
        "pipeline_type": row["pipeline_type"],
        "description": row.get("description") or "",
        "status": row["status"],
        "owner": row.get("owner") or "system",
        "metadata": dict(row.get("metadata_json") or {}),
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
    }


def _serialize_run(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "pipeline_id": row["pipeline_id"],
        "dataset_id": row.get("dataset_id"),
        "status": row["status"],
        "trigger_type": row.get("trigger_type") or "manual",
        "actor": row.get("actor") or "system",
        "input_references": list(row.get("input_refs_json") or []),
        "output_references": list(row.get("output_refs_json") or []),
        "model_version": row.get("model_version"),
        "started_at": _iso(row.get("started_at")),
        "completed_at": _iso(row.get("completed_at")),
        "duration_ms": row.get("duration_ms"),
        "error_message": row.get("error_message"),
        "metadata": dict(row.get("metadata_json") or {}),
    }


def _serialize_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "pipeline_id": row["pipeline_id"],
        "pipeline_run_id": row["pipeline_run_id"],
        "node_id": row.get("node_id"),
        "event_type": row["event_type"],
        "step_order": int(row.get("step_order") or 0),
        "timestamp": _iso(row.get("timestamp")),
        "duration_ms": row.get("duration_ms"),
        "status": row["status"],
        "input_summary": row.get("input_summary"),
        "output_summary": row.get("output_summary"),
        "error_message": row.get("error_message"),
        "metadata": dict(row.get("metadata_json") or {}),
    }


# ---------------------------------------------------------------------------
# Low-level Upsert Helpers (used by both live hooks & full DB reconciler)
# ---------------------------------------------------------------------------


def _upsert_pipeline(
    conn: sa.Connection,
    *,
    company_id: str,
    pipe_key: str,
    name: str,
    pipeline_type: str,
    description: str,
    status: str,
    owner: str,
    metadata: dict[str, Any],
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> str:
    pid = _det_id("pipe", company_id, pipe_key)
    c_at = _as_utc(created_at) or _utc_now()
    u_at = _as_utc(updated_at) or c_at
    existing = conn.execute(sa.select(pipelines.c.id).where(pipelines.c.id == pid)).first()
    if existing:
        conn.execute(
            pipelines.update()
            .where(pipelines.c.id == pid)
            .values(
                name=name[:160],
                pipeline_type=pipeline_type[:48],
                description=description,
                status=status[:32],
                owner=(owner or "system")[:100],
                metadata_json=metadata,
                updated_at=u_at,
            )
        )
    else:
        conn.execute(
            pipelines.insert().values(
                id=pid,
                company_id=company_id,
                name=name[:160],
                pipeline_type=pipeline_type[:48],
                description=description,
                status=status[:32],
                owner=(owner or "system")[:100],
                metadata_json=metadata,
                created_at=c_at,
                updated_at=u_at,
            )
        )
    return pid


def _upsert_run(
    conn: sa.Connection,
    *,
    company_id: str,
    run_key: str,
    pipeline_id: str,
    dataset_id: str | None,
    status: str,
    trigger_type: str,
    actor: str,
    input_refs: list[str],
    output_refs: list[str],
    model_version: str | None,
    started_at: datetime | None,
    completed_at: datetime | None,
    duration_ms: float | None = None,
    error_message: str | None = None,
    metadata: dict[str, Any] | None = None,
    preserve_timing: bool = True,
) -> str:
    rid = _det_id("run", company_id, run_key)
    s_at = _as_utc(started_at) or _utc_now()
    e_at = _as_utc(completed_at)
    existing = conn.execute(sa.select(pipeline_runs).where(pipeline_runs.c.id == rid)).mappings().first()
    if existing:
        kept_dur = existing["duration_ms"] if (preserve_timing and existing.get("duration_ms") is not None) else duration_ms
        if kept_dur is None and e_at is not None:
            kept_dur = _ms_between(existing.get("started_at") or s_at, e_at)
        merged_meta = {**(existing.get("metadata_json") or {}), **(metadata or {})}
        conn.execute(
            pipeline_runs.update()
            .where(pipeline_runs.c.id == rid)
            .values(
                status=status[:32],
                dataset_id=dataset_id,
                actor=(actor or existing.get("actor") or "system")[:100],
                input_refs_json=input_refs or existing.get("input_refs_json") or [],
                output_refs_json=output_refs or existing.get("output_refs_json") or [],
                model_version=model_version or existing.get("model_version"),
                completed_at=e_at or existing.get("completed_at"),
                duration_ms=kept_dur,
                error_message=error_message if error_message is not None else existing.get("error_message"),
                metadata_json=merged_meta,
            )
        )
    else:
        dur = duration_ms if duration_ms is not None else (_ms_between(s_at, e_at) if e_at else None)
        conn.execute(
            pipeline_runs.insert().values(
                id=rid,
                company_id=company_id,
                pipeline_id=pipeline_id,
                dataset_id=dataset_id,
                status=status[:32],
                trigger_type=trigger_type[:48],
                actor=(actor or "system")[:100],
                input_refs_json=input_refs,
                output_refs_json=output_refs,
                model_version=model_version,
                started_at=s_at,
                completed_at=e_at,
                duration_ms=dur,
                error_message=error_message,
                metadata_json=metadata or {},
            )
        )
    return rid


def _upsert_node(
    conn: sa.Connection,
    *,
    company_id: str,
    node_key: str,
    external_id: str | None,
    pipeline_id: str | None,
    dataset_id: str | None,
    name: str,
    node_type: str,
    sub_type: str,
    status: str,
    owner: str,
    metadata: dict[str, Any],
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> str:
    nid = _det_id("ln", company_id, node_key)
    c_at = _as_utc(created_at) or _utc_now()
    u_at = _as_utc(updated_at) or c_at
    layer = LAYER_BY_TYPE.get(node_type, 0)
    existing = conn.execute(sa.select(lineage_nodes.c.id).where(lineage_nodes.c.id == nid)).first()
    if existing:
        conn.execute(
            lineage_nodes.update()
            .where(lineage_nodes.c.id == nid)
            .values(
                external_id=external_id,
                pipeline_id=pipeline_id,
                dataset_id=dataset_id,
                name=name[:200],
                node_type=node_type[:40],
                sub_type=sub_type[:48],
                status=status[:32],
                owner=(owner or "system")[:100],
                layer_order=layer,
                metadata_json=metadata,
                updated_at=u_at,
            )
        )
    else:
        conn.execute(
            lineage_nodes.insert().values(
                id=nid,
                company_id=company_id,
                external_id=external_id,
                pipeline_id=pipeline_id,
                dataset_id=dataset_id,
                name=name[:200],
                node_type=node_type[:40],
                sub_type=sub_type[:48],
                status=status[:32],
                owner=(owner or "system")[:100],
                layer_order=layer,
                metadata_json=metadata,
                created_at=c_at,
                updated_at=u_at,
            )
        )
    return nid


def _upsert_edge(
    conn: sa.Connection,
    *,
    company_id: str,
    pipeline_id: str | None,
    run_id: str | None,
    source_node_id: str,
    target_node_id: str,
    relationship_type: str,
    status: str,
    data_transferred: str | None = None,
    record_count: int | None = None,
    transformation: str | None = None,
    metadata: dict[str, Any] | None = None,
    timestamp: datetime | None = None,
) -> str:
    edge_key = f"{pipeline_id or 'shared'}:{source_node_id}->{target_node_id}:{relationship_type}"
    eid = _det_id("le", company_id, edge_key)
    ts = _as_utc(timestamp) or _utc_now()
    existing = conn.execute(sa.select(lineage_edges.c.id).where(lineage_edges.c.id == eid)).first()
    if existing:
        conn.execute(
            lineage_edges.update()
            .where(lineage_edges.c.id == eid)
            .values(
                pipeline_id=pipeline_id,
                run_id=run_id,
                status=status[:32],
                data_transferred=data_transferred[:160] if data_transferred else None,
                record_count=record_count,
                transformation=transformation,
                metadata_json=metadata or {},
                updated_at=ts,
            )
        )
    else:
        conn.execute(
            lineage_edges.insert().values(
                id=eid,
                company_id=company_id,
                pipeline_id=pipeline_id,
                run_id=run_id,
                source_node_id=source_node_id,
                target_node_id=target_node_id,
                relationship_type=relationship_type[:64],
                status=status[:32],
                data_transferred=data_transferred[:160] if data_transferred else None,
                record_count=record_count,
                transformation=transformation,
                metadata_json=metadata or {},
                created_at=ts,
                updated_at=ts,
            )
        )
    return eid


def _upsert_event(
    conn: sa.Connection,
    *,
    company_id: str,
    event_key: str,
    pipeline_id: str,
    pipeline_run_id: str,
    node_id: str | None,
    event_type: str,
    step_order: int,
    timestamp: Any,
    duration_ms: float | None,
    status: str,
    input_summary: str | None,
    output_summary: str | None,
    error_message: str | None = None,
    metadata: dict[str, Any] | None = None,
    preserve_timing: bool = True,
) -> str:
    ev_id = _det_id("evt", company_id, event_key)
    ts = _as_utc(timestamp) or _utc_now()
    existing = conn.execute(sa.select(pipeline_events).where(pipeline_events.c.id == ev_id)).mappings().first()
    if existing:
        kept_dur = existing["duration_ms"] if (preserve_timing and existing.get("duration_ms") is not None) else duration_ms
        conn.execute(
            pipeline_events.update()
            .where(pipeline_events.c.id == ev_id)
            .values(
                node_id=node_id,
                event_type=event_type[:80],
                step_order=step_order,
                duration_ms=kept_dur,
                status=status[:32],
                input_summary=input_summary[:255] if input_summary else existing.get("input_summary"),
                output_summary=output_summary[:255] if output_summary else existing.get("output_summary"),
                error_message=error_message if error_message is not None else existing.get("error_message"),
                metadata_json={**(existing.get("metadata_json") or {}), **(metadata or {})},
            )
        )
    else:
        conn.execute(
            pipeline_events.insert().values(
                id=ev_id,
                company_id=company_id,
                pipeline_id=pipeline_id,
                pipeline_run_id=pipeline_run_id,
                node_id=node_id,
                event_type=event_type[:80],
                step_order=step_order,
                timestamp=ts,
                duration_ms=duration_ms,
                status=status[:32],
                input_summary=input_summary[:255] if input_summary else None,
                output_summary=output_summary[:255] if output_summary else None,
                error_message=error_message,
                metadata_json=metadata or {},
            )
        )
    return ev_id


def _upsert_insight(
    conn: sa.Connection,
    *,
    company_id: str,
    insight_key: str,
    dataset_id: str | None,
    pipeline_run_id: str | None,
    source_node_id: str | None,
    insight_type: str,
    name: str,
    description: str | None,
    output_reference: str,
    owner: str,
    metadata: dict[str, Any],
    created_at: Any = None,
) -> str:
    iid = _det_id("bi", company_id, insight_key)
    c_at = _as_utc(created_at) or _utc_now()
    existing = conn.execute(sa.select(business_insights.c.id).where(business_insights.c.id == iid)).first()
    if existing:
        conn.execute(
            business_insights.update()
            .where(business_insights.c.id == iid)
            .values(
                dataset_id=dataset_id,
                pipeline_run_id=pipeline_run_id,
                source_node_id=source_node_id,
                insight_type=insight_type[:48],
                name=name[:200],
                description=description,
                output_reference=output_reference[:200],
                owner=(owner or "system")[:100],
                metadata_json=metadata,
            )
        )
    else:
        conn.execute(
            business_insights.insert().values(
                id=iid,
                company_id=company_id,
                dataset_id=dataset_id,
                pipeline_run_id=pipeline_run_id,
                source_node_id=source_node_id,
                insight_type=insight_type[:48],
                name=name[:200],
                description=description,
                output_reference=output_reference[:200],
                owner=(owner or "system")[:100],
                metadata_json=metadata,
                created_at=c_at,
            )
        )
    return iid


# ---------------------------------------------------------------------------
# Live Runtime Recording Hooks (Non-Blocking, Real Execution Telemetry)
# ---------------------------------------------------------------------------


def record_runtime_event(
    engine: sa.Engine,
    *,
    company_id: str,
    pipeline_key: str,
    pipeline_name: str,
    pipeline_type: str,
    run_key: str,
    dataset_id: str | None,
    actor: str,
    event_type: str,
    step_order: int,
    status: str,
    event_key: str | None = None,
    node_key: str | None = None,
    duration_ms: float | None = None,
    input_summary: str | None = None,
    output_summary: str | None = None,
    model_version: str | None = None,
    error_message: str | None = None,
    insight: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Persist real pipeline run & chronological event telemetry during live API/worker execution."""
    try:
        with engine.begin() as conn:
            company_exists = conn.scalar(sa.select(companies.c.id).where(companies.c.id == company_id))
            if not company_exists:
                return
            now = _utc_now()
            pipe_id = _upsert_pipeline(
                conn,
                company_id=company_id,
                pipe_key=pipeline_key,
                name=pipeline_name,
                pipeline_type=pipeline_type,
                description=f"Live execution telemetry for {pipeline_name}",
                status="processing" if status == "processing" else ("failed" if status == "failed" else "completed"),
                owner=actor or "system",
                metadata={"live_hook": True, **(metadata or {})},
                updated_at=now,
            )
            run_id = _upsert_run(
                conn,
                company_id=company_id,
                run_key=run_key,
                pipeline_id=pipe_id,
                dataset_id=dataset_id,
                status="running" if status == "processing" else ("failed" if status == "failed" else "completed"),
                trigger_type=pipeline_type,
                actor=actor or "system",
                input_refs=[input_summary] if input_summary else [],
                output_refs=[output_summary] if output_summary else [],
                model_version=model_version,
                started_at=now,
                completed_at=None if status == "processing" else now,
                duration_ms=duration_ms,
                error_message=error_message,
                metadata=metadata,
                preserve_timing=False,
            )
            resolved_node_id = None
            if node_key:
                candidate = _det_id("ln", company_id, node_key)
                if conn.scalar(sa.select(lineage_nodes.c.id).where(lineage_nodes.c.id == candidate)):
                    resolved_node_id = candidate

            _upsert_event(
                conn,
                company_id=company_id,
                event_key=event_key or f"{run_key}:{event_type}:{step_order}",
                pipeline_id=pipe_id,
                pipeline_run_id=run_id,
                node_id=resolved_node_id,
                event_type=event_type,
                step_order=step_order,
                timestamp=now,
                duration_ms=duration_ms,
                status=status,
                input_summary=input_summary,
                output_summary=output_summary,
                error_message=error_message,
                metadata=metadata,
                preserve_timing=False,
            )
            if insight:
                _upsert_insight(
                    conn,
                    company_id=company_id,
                    insight_key=insight["key"],
                    dataset_id=dataset_id,
                    pipeline_run_id=run_id,
                    source_node_id=resolved_node_id,
                    insight_type=insight.get("insight_type", "analytics"),
                    name=insight["name"],
                    description=insight.get("description"),
                    output_reference=insight.get("output_reference", "/"),
                    owner=actor or "system",
                    metadata=insight.get("metadata") or {},
                    created_at=now,
                )
        with _CACHE_GUARD:
            _RUNTIME_EPOCH[company_id] = _RUNTIME_EPOCH.get(company_id, 0) + 1
    except Exception as exc:
        log.warning("Non-fatal lineage telemetry write skipped (%s): %s", event_type, exc)


_CACHE_GUARD = threading.Lock()
_SYNC_LOCKS: dict[tuple[str, str], threading.Lock] = {}
_LINEAGE_SYNC_CACHE: dict[tuple[str, str], tuple[str, dict[str, Any]]] = {}
_RUNTIME_EPOCH: dict[str, int] = {}


def _lineage_scope_key(engine: sa.Engine, company_id: str) -> tuple[str, str] | None:
    if engine.dialect.name == "sqlite" and str(engine.url.database or "") in {"", ":memory:"}:
        return None
    return (str(engine.url), company_id)


def _get_sync_lock(scope_key: tuple[str, str]) -> threading.Lock:
    with _CACHE_GUARD:
        lock = _SYNC_LOCKS.get(scope_key)
        if lock is None:
            lock = threading.Lock()
            _SYNC_LOCKS[scope_key] = lock
        return lock


def _get_runtime_epoch(company_id: str) -> int:
    with _CACHE_GUARD:
        return _RUNTIME_EPOCH.get(company_id, 0)


def _compute_lineage_state_fingerprint(engine: sa.Engine, company_id: str) -> str | None:
    """Fast read-only fingerprint of every DB table & artifact influencing company lineage."""
    epoch = _get_runtime_epoch(company_id)
    with engine.connect() as conn:
        comp = conn.execute(
            sa.select(
                companies.c.id,
                companies.c.name,
                companies.c.active_dataset_id,
                companies.c.updated_at,
            ).where(companies.c.id == company_id)
        ).mappings().first()
        if comp is None:
            return None

        legacy_ds = (
            tuple(
                conn.execute(
                    sa.select(sa.func.count(), sa.func.max(legacy_datasets.c.id)).select_from(legacy_datasets)
                ).first()
                or (0, None)
            )
            if company_id == "comp-default"
            else None
        )
        ds_state = [
            (r["id"], r["status"], bool(r["is_active"]), r["storage_mode"], r["updated_at"], r["imported_at"])
            for r in conn.execute(
                sa.select(
                    enterprise_datasets.c.id,
                    enterprise_datasets.c.status,
                    enterprise_datasets.c.is_active,
                    enterprise_datasets.c.storage_mode,
                    enterprise_datasets.c.updated_at,
                    enterprise_datasets.c.imported_at,
                )
                .where(enterprise_datasets.c.company_id == company_id)
                .order_by(enterprise_datasets.c.id.asc())
            ).mappings()
        ]
        src_state = [
            (r["id"], r["status"], r["last_synced_at"], r["updated_at"])
            for r in conn.execute(
                sa.select(
                    data_sources.c.id,
                    data_sources.c.status,
                    data_sources.c.last_synced_at,
                    data_sources.c.updated_at,
                )
                .where(data_sources.c.company_id == company_id)
                .order_by(data_sources.c.id.asc())
            ).mappings()
        ]
        qr_state = tuple(
            conn.execute(
                sa.select(
                    sa.func.count(),
                    sa.func.max(dataset_quality_reports.c.id),
                    sa.func.sum(dataset_quality_reports.c.overall_score),
                ).where(dataset_quality_reports.c.company_id == company_id)
            ).first()
            or (0, None, None)
        )
        implog_state = tuple(
            conn.execute(
                sa.select(sa.func.count(), sa.func.max(import_logs.c.id)).where(
                    import_logs.c.company_id == company_id
                )
            ).first()
            or (0, None)
        )
        clog_state = [
            (r["id"], r["status"])
            for r in conn.execute(
                sa.select(connector_sync_logs.c.id, connector_sync_logs.c.status)
                .where(connector_sync_logs.c.company_id == company_id)
                .order_by(connector_sync_logs.c.id.asc())
            ).mappings()
        ]
        mm_state = [
            (
                r["id"],
                r["processing_status"],
                r["validation_status"],
                r["extraction_status"],
                r["updated_at"],
                r["imported_at"],
            )
            for r in conn.execute(
                sa.select(
                    multimodal_files.c.id,
                    multimodal_files.c.processing_status,
                    multimodal_files.c.validation_status,
                    multimodal_files.c.extraction_status,
                    multimodal_files.c.updated_at,
                    multimodal_files.c.imported_at,
                )
                .where(multimodal_files.c.company_id == company_id)
                .order_by(multimodal_files.c.id.asc())
            ).mappings()
        ]
        job_state = [
            (r["id"], r["status"], r["stage"], int(r["progress_pct"] or 0), r["finished_at"])
            for r in conn.execute(
                sa.select(
                    ingestion_jobs.c.id,
                    ingestion_jobs.c.status,
                    ingestion_jobs.c.stage,
                    ingestion_jobs.c.progress_pct,
                    ingestion_jobs.c.finished_at,
                )
                .where(ingestion_jobs.c.company_id == company_id)
                .order_by(ingestion_jobs.c.id.asc())
            ).mappings()
        ]
        ext_state = tuple(
            conn.execute(
                sa.select(sa.func.count(), sa.func.max(extracted_records.c.id)).where(
                    extracted_records.c.company_id == company_id
                )
            ).first()
            or (0, None)
        )
        ins_state = tuple(
            conn.execute(
                sa.select(sa.func.count(), sa.func.max(tenant_multimodal_insights.c.approved_at)).where(
                    tenant_multimodal_insights.c.company_id == company_id
                )
            ).first()
            or (0, None)
        )
        rag_state = [
            (r["id"], r["status"], r["updated_at"])
            for r in conn.execute(
                sa.select(rag_documents.c.id, rag_documents.c.status, rag_documents.c.updated_at)
                .where(rag_documents.c.company_id == company_id)
                .order_by(rag_documents.c.id.asc())
            ).mappings()
        ]
        rag_chunk_count = int(
            conn.scalar(
                sa.select(sa.func.count()).select_from(rag_chunks).where(rag_chunks.c.company_id == company_id)
            )
            or 0
        )
        sim_state = tuple(
            conn.execute(
                sa.select(sa.func.count(), sa.func.max(simulations.c.id)).where(simulations.c.company_id == company_id)
            ).first()
            or (0, None)
        )
        audit_state = tuple(
            conn.execute(
                sa.select(sa.func.count(), sa.func.max(audit.c.id)).where(audit.c.company_id == company_id)
            ).first()
            or (0, None)
        )
        chat_state = tuple(
            conn.execute(
                sa.select(sa.func.count(), sa.func.max(chat_messages.c.id)).where(
                    chat_messages.c.company_id == company_id
                )
            ).first()
            or (0, None)
        )
        evt_state = tuple(
            conn.execute(
                sa.select(
                    sa.func.count(),
                    sa.func.max(pipeline_events.c.id),
                    sa.func.max(pipeline_events.c.timestamp),
                ).where(pipeline_events.c.company_id == company_id)
            ).first()
            or (0, None, None)
        )
        pipe_state = tuple(
            conn.execute(
                sa.select(sa.func.count(), sa.func.max(pipelines.c.id)).where(pipelines.c.company_id == company_id)
            ).first()
            or (0, None)
        )
        node_count = int(
            conn.scalar(
                sa.select(sa.func.count()).select_from(lineage_nodes).where(lineage_nodes.c.company_id == company_id)
            )
            or 0
        )

    active_ds_id = comp["active_dataset_id"]
    art_sig: tuple[str, int | None, int | None] | None = None
    if active_ds_id:
        active_ds_row = next((d for d in ds_state if d[0] == active_ds_id), None)
        is_part = (active_ds_row[3] == "partitioned") if active_ds_row else (company_id != "comp-default")
        art_file = (
            services.ARTIFACTS / f"tenant_{company_id}__{active_ds_id}.joblib"
            if is_part
            else services.ARTIFACTS / f"{active_ds_id}.joblib"
        )
        if art_file.is_file():
            st = art_file.stat()
            art_sig = (str(art_file), st.st_mtime_ns, st.st_size)
        else:
            art_sig = (str(art_file), None, None)

    rag_cfg = get_rag_settings()
    payload = {
        "epoch": epoch,
        "comp": (comp["name"], comp["active_dataset_id"], comp["updated_at"]),
        "legacy_ds": legacy_ds,
        "ds_state": ds_state,
        "src_state": src_state,
        "qr_state": qr_state,
        "implog_state": implog_state,
        "clog_state": clog_state,
        "mm_state": mm_state,
        "job_state": job_state,
        "ext_state": ext_state,
        "ins_state": ins_state,
        "rag_state": rag_state,
        "rag_chunk_count": rag_chunk_count,
        "sim_state": sim_state,
        "audit_state": audit_state,
        "chat_state": chat_state,
        "evt_state": evt_state,
        "pipe_state": pipe_state,
        "node_count": node_count,
        "art_sig": art_sig,
        "rag_cfg": (rag_cfg.vector_backend, rag_cfg.embedding_provider),
    }
    return json.dumps(payload, sort_keys=True, default=str)


def ensure_company_lineage_synced(engine: sa.Engine, company_id: str) -> dict[str, Any]:
    """Skip expensive SQLite write reconciliation when real DB + artifact state is unchanged."""
    scope_key = _lineage_scope_key(engine, company_id)
    if scope_key is None:
        return _sync_company_lineage_unlocked(engine, company_id)

    with _CACHE_GUARD:
        cached = _LINEAGE_SYNC_CACHE.get(scope_key)
    if cached is not None:
        cur_fp = _compute_lineage_state_fingerprint(engine, company_id)
        if cur_fp is not None and cur_fp == cached[0]:
            return cached[1]

    with _get_sync_lock(scope_key):
        with _CACHE_GUARD:
            cached = _LINEAGE_SYNC_CACHE.get(scope_key)
        if cached is not None:
            cur_fp = _compute_lineage_state_fingerprint(engine, company_id)
            if cur_fp is not None and cur_fp == cached[0]:
                return cached[1]

        epoch_before = _get_runtime_epoch(company_id)
        result = _sync_company_lineage_unlocked(engine, company_id)
        post_fp = _compute_lineage_state_fingerprint(engine, company_id)
        if post_fp is not None and _get_runtime_epoch(company_id) == epoch_before:
            with _CACHE_GUARD:
                _LINEAGE_SYNC_CACHE[scope_key] = (post_fp, result)
        return result


# ---------------------------------------------------------------------------
# Full Database & Artifact Reconciler (Truthful Sync for a Tenant)
# ---------------------------------------------------------------------------


def sync_company_lineage(engine: sa.Engine, company_id: str) -> dict[str, Any]:
    """Reconcile lineage_nodes, lineage_edges, pipelines, pipeline_runs, pipeline_events & business_insights from real DB state."""
    scope_key = _lineage_scope_key(engine, company_id)
    if scope_key is None:
        return _sync_company_lineage_unlocked(engine, company_id)
    with _get_sync_lock(scope_key):
        epoch_before = _get_runtime_epoch(company_id)
        result = _sync_company_lineage_unlocked(engine, company_id)
        post_fp = _compute_lineage_state_fingerprint(engine, company_id)
        if post_fp is not None and _get_runtime_epoch(company_id) == epoch_before:
            with _CACHE_GUARD:
                _LINEAGE_SYNC_CACHE[scope_key] = (post_fp, result)
        return result


def _sync_company_lineage_unlocked(engine: sa.Engine, company_id: str) -> dict[str, Any]:
    dialect = _dialect_label(engine)
    now = _utc_now()

    with engine.begin() as conn:
        company_row = conn.execute(sa.select(companies).where(companies.c.id == company_id)).mappings().first()
        if company_row is None:
            if company_id == "comp-default":
                from backend.app.ingestion.service import sync_default_legacy_dataset

                sync_default_legacy_dataset(conn, "comp-default")
                company_row = conn.execute(sa.select(companies).where(companies.c.id == company_id)).mappings().one()
            else:
                raise HTTPException(404, f"Company workspace '{company_id}' does not exist.")
        elif company_id == "comp-default":
            from backend.app.ingestion.service import sync_default_legacy_dataset

            sync_default_legacy_dataset(conn, "comp-default")
            company_row = conn.execute(sa.select(companies).where(companies.c.id == company_id)).mappings().one()

        ds_rows = [
            dict(r)
            for r in conn.execute(
                sa.select(enterprise_datasets)
                .where(enterprise_datasets.c.company_id == company_id)
                .order_by(enterprise_datasets.c.created_at.asc())
            ).mappings()
        ]
        src_rows = [
            dict(r)
            for r in conn.execute(
                sa.select(data_sources)
                .where(data_sources.c.company_id == company_id)
                .order_by(data_sources.c.created_at.asc())
            ).mappings()
        ]
        qr_by_ds: dict[str, dict[str, Any]] = {}
        for r in conn.execute(
            sa.select(dataset_quality_reports)
            .where(dataset_quality_reports.c.company_id == company_id)
            .order_by(dataset_quality_reports.c.created_at.asc())
        ).mappings():
            qr_by_ds[r["dataset_id"]] = dict(r)

        logs_by_ds: dict[str, list[dict[str, Any]]] = {}
        for r in conn.execute(
            sa.select(import_logs)
            .where(import_logs.c.company_id == company_id)
            .order_by(import_logs.c.id.asc())
        ).mappings():
            logs_by_ds.setdefault(r["dataset_id"], []).append(dict(r))

        conn_logs_by_src: dict[str, list[dict[str, Any]]] = {}
        for r in conn.execute(
            sa.select(connector_sync_logs)
            .where(connector_sync_logs.c.company_id == company_id)
            .order_by(connector_sync_logs.c.id.asc())
        ).mappings():
            conn_logs_by_src.setdefault(r["data_source_id"], []).append(dict(r))

        mm_files = [
            dict(r)
            for r in conn.execute(
                sa.select(multimodal_files)
                .where(multimodal_files.c.company_id == company_id)
                .order_by(multimodal_files.c.upload_timestamp.asc())
            ).mappings()
        ]
        jobs_by_file: dict[str, dict[str, Any]] = {}
        for r in conn.execute(
            sa.select(ingestion_jobs)
            .where(ingestion_jobs.c.company_id == company_id)
            .order_by(ingestion_jobs.c.created_at.asc())
        ).mappings():
            if r.get("file_id"):
                jobs_by_file[r["file_id"]] = dict(r)

        ext_counts: dict[str, int] = {
            r["file_id"]: int(r["cnt"] or 0)
            for r in conn.execute(
                sa.select(extracted_records.c.file_id, sa.func.count().label("cnt"))
                .where(extracted_records.c.company_id == company_id)
                .group_by(extracted_records.c.file_id)
            ).mappings()
        }
        mm_insights = [
            dict(r)
            for r in conn.execute(
                sa.select(tenant_multimodal_insights)
                .where(tenant_multimodal_insights.c.company_id == company_id)
                .order_by(tenant_multimodal_insights.c.approved_at.desc())
            ).mappings()
        ]
        rag_docs = [
            dict(r)
            for r in conn.execute(
                sa.select(rag_documents)
                .where(rag_documents.c.company_id == company_id)
                .order_by(rag_documents.c.created_at.asc())
            ).mappings()
        ]
        rag_chunk_total = int(
            conn.scalar(
                sa.select(sa.func.count()).select_from(rag_chunks).where(rag_chunks.c.company_id == company_id)
            )
            or 0
        )
        sim_rows = [
            dict(r)
            for r in conn.execute(
                sa.select(simulations)
                .where(simulations.c.company_id == company_id)
                .order_by(simulations.c.created_at.desc())
            ).mappings()
        ]
        audit_rows = [
            dict(r)
            for r in conn.execute(
                sa.select(audit)
                .where(audit.c.company_id == company_id)
                .order_by(audit.c.id.asc())
            ).mappings()
        ]
        asst_msgs = [
            dict(r)
            for r in conn.execute(
                sa.select(chat_messages)
                .where(chat_messages.c.company_id == company_id, chat_messages.c.role == "assistant")
                .order_by(chat_messages.c.created_at.desc())
                .limit(20)
            ).mappings()
        ]

        active_info: dict[str, Any] | None = None
        try:
            active_info = dataset_info(conn, company_id=company_id, dataset_id=company_row.get("active_dataset_id"))
        except HTTPException:
            active_info = None

        active_artifact = None
        if active_info:
            try:
                active_artifact = services.artifact(active_info)
            except Exception:
                active_artifact = None

        active_node_ids: set[str] = set()
        active_edge_ids: set[str] = set()
        active_pipe_ids: set[str] = set()
        node_pipelines: dict[str, set[str]] = {}

        def track_node(nid: str, pid: str | None) -> str:
            active_node_ids.add(nid)
            if pid:
                node_pipelines.setdefault(nid, set()).add(pid)
            return nid

        def link(
            *,
            pid: str | None,
            run_id: str | None,
            src: str,
            tgt: str,
            rel: str,
            status: str,
            data_transferred: str | None = None,
            record_count: int | None = None,
            transformation: str | None = None,
            ts: Any = None,
            metadata: dict[str, Any] | None = None,
        ) -> str:
            if pid:
                node_pipelines.setdefault(src, set()).add(pid)
                node_pipelines.setdefault(tgt, set()).add(pid)
            eid = _upsert_edge(
                conn,
                company_id=company_id,
                pipeline_id=pid,
                run_id=run_id,
                source_node_id=src,
                target_node_id=tgt,
                relationship_type=rel,
                status=status,
                data_transferred=data_transferred,
                record_count=record_count,
                transformation=transformation,
                timestamp=ts,
                metadata=metadata,
            )
            active_edge_ids.add(eid)
            return eid

        # Track shared Storage / AI / BI hubs cleanly
        raw_files_info: list[str] = []
        total_raw_bytes = 0
        imported_datasets = [d for d in ds_rows if d["status"] == "imported"]
        uploaded_enterprise = [d for d in ds_rows if d.get("storage_mode") != "legacy_snapshot"]
        failed_datasets = [d for d in ds_rows if d["status"] == "failed"]

        for d in ds_rows:
            if d.get("raw_storage_key"):
                raw_files_info.append(d.get("file_name") or d["name"])
                total_raw_bytes += int(d.get("file_size_bytes") or 0)
        for mf in mm_files:
            raw_files_info.append(mf["file_name"])
            total_raw_bytes += int(mf.get("file_size_bytes") or 0)

        ext_connectors = [s for s in src_rows if s["source_type"] != "file_upload"]
        decision_audits = [
            a for a in audit_rows
            if a["kind"] in {"recommendation_feedback", "scenario_feedback", "multimodal_approved"}
        ]
        sql_traces = [m for m in asst_msgs if m.get("sql_trace_json") and not (m["sql_trace_json"] or {}).get("blocked")]
        rag_settings = get_rag_settings()
        rag_embedder = get_embedding_provider()
        is_empty_company = (
            not ds_rows and not mm_files and not rag_docs and not ext_connectors and not sim_rows and not asst_msgs
        )

        if is_empty_company:
            conn.execute(lineage_edges.delete().where(lineage_edges.c.company_id == company_id))
            conn.execute(business_insights.delete().where(business_insights.c.company_id == company_id))
            conn.execute(lineage_nodes.delete().where(lineage_nodes.c.company_id == company_id))
            conn.execute(pipeline_events.delete().where(pipeline_events.c.company_id == company_id))
            conn.execute(pipeline_runs.delete().where(pipeline_runs.c.company_id == company_id))
            conn.execute(pipelines.delete().where(pipelines.c.company_id == company_id))
            return {
                "company_id": company_id,
                "synced_at": now.isoformat(),
                "summary": {
                    "total_data_sources": 0,
                    "processing_pipelines": 0,
                    "ai_models": 0,
                    "business_insights": 0,
                    "data_quality_score": None,
                    "last_synchronized": None,
                },
            }

        # Shared Decision Intelligence Pipeline (created when analytics/AI/BI exist)
        dec_pipe_id: str | None = None
        dec_run_id: str | None = None
        if active_info or imported_datasets or mm_insights or rag_docs or asst_msgs or sim_rows:
            dec_pipe_status = "completed"
            if any(
                (jobs_by_file.get(mf["id"]) or {}).get("status") in {"queued", "running"}
                for mf in mm_files
            ):
                dec_pipe_status = "processing"
            elif failed_datasets and not imported_datasets:
                dec_pipe_status = "failed"
            dec_pipe_id = _upsert_pipeline(
                conn,
                company_id=company_id,
                pipe_key="decision_intelligence:main",
                name=f"Decision Intelligence Pipeline ({active_info['title'] if active_info else company_row['name']})",
                pipeline_type="decision_intelligence",
                description="End-to-end analytical storage, AI model scoring, BI aggregation, and decision support output flow.",
                status=dec_pipe_status,
                owner=(active_info or {}).get("created_by") or "system",
                metadata={"dataset_id": (active_info or {}).get("dataset_id"), "dialect": dialect},
                created_at=company_row.get("created_at"),
                updated_at=now,
            )
            active_pipe_ids.add(dec_pipe_id)
            dec_run_id = _upsert_run(
                conn,
                company_id=company_id,
                run_key=f"dec:{(active_info or {}).get('dataset_id') or company_id}",
                pipeline_id=dec_pipe_id,
                dataset_id=(active_info or {}).get("dataset_id"),
                status="completed" if active_artifact else ("running" if dec_pipe_status == "processing" else "completed"),
                trigger_type="analytics_pipeline",
                actor=(active_info or {}).get("created_by") or "system",
                input_refs=[d["name"] for d in imported_datasets[:5]],
                output_refs=["Executive Dashboard", "Forecasts", "Recommendations"],
                model_version=(active_artifact or {}).get("version"),
                started_at=(imported_datasets[-1].get("imported_at") if imported_datasets else company_row.get("created_at")),
                completed_at=now,
                metadata={"dialect": dialect},
            )

        # ---- Build Storage Nodes (Column 2) ----
        raw_storage_nid: str | None = None
        if raw_files_info:
            raw_storage_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="storage:raw_object_store",
                    external_id="object_storage_raw",
                    pipeline_id=dec_pipe_id,
                    dataset_id=(active_info or {}).get("dataset_id"),
                    name="Raw Object Storage",
                    node_type="storage",
                    sub_type="object_storage",
                    status="completed",
                    owner="system",
                    metadata={
                        "description": "Tenant-isolated raw artifact & media storage (LocalObjectStorage / S3-compatible).",
                        "data_size_bytes": total_raw_bytes,
                        "record_count": len(raw_files_info),
                        "data_format": "Original uploaded binary / CSV / JSON / Media",
                        "files": raw_files_info[:15],
                        "input_schema": ["Uploaded Multipart Bytes", "SHA-256 Checksum"],
                        "output_schema": ["companies/{company_id}/datasets/.../raw/*"],
                    },
                    created_at=company_row.get("created_at"),
                    updated_at=now,
                ),
                dec_pipe_id,
            )

        rel_db_nid: str | None = None
        total_db_records = 0
        has_db_data = bool(imported_datasets)
        if has_db_data:
            ds_counts = (active_info or {}).get("counts") or {}
            total_db_records = sum(int(v or 0) for v in ds_counts.values())
            tables_list = (
                [
                    "tenant_transactions", "tenant_products", "tenant_marketing_daily",
                    "tenant_inventory_daily", "tenant_orders", "tenant_customers",
                ]
                if (active_info and active_info.get("storage_mode") == "partitioned")
                else [
                    "sales_transactions", "products", "customers",
                    "marketing_campaigns", "inventory_daily", "calendar_events",
                ]
            )
            rel_db_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="storage:relational_db",
                    external_id=f"{dialect.lower()}_analytics",
                    pipeline_id=dec_pipe_id,
                    dataset_id=(active_info or {}).get("dataset_id"),
                    name=f"Processed Relational DB ({dialect})",
                    node_type="storage",
                    sub_type="relational_db",
                    status="completed",
                    owner="system",
                    metadata={
                        "description": f"{dialect} multi-tenant partitioned analytical warehouse holding verified transactions, products, marketing, and inventory tables.",
                        "data_format": dialect,
                        "record_count": total_db_records,
                        "tables": tables_list,
                        "table_counts": ds_counts,
                        "input_schema": ["Validated Canonical Records", "Quality Report"],
                        "output_schema": tables_list,
                        "dataset_id": (active_info or {}).get("dataset_id"),
                    },
                    created_at=imported_datasets[0].get("imported_at") or imported_datasets[0].get("created_at"),
                    updated_at=(active_info or {}).get("imported_at") or now,
                ),
                dec_pipe_id,
            )

        mm_store_nid: str | None = None
        if mm_insights:
            mm_store_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="storage:multimodal_insights",
                    external_id="tenant_multimodal_insights",
                    pipeline_id=dec_pipe_id,
                    dataset_id=(active_info or {}).get("dataset_id"),
                    name="Approved Multimodal Insights Store",
                    node_type="storage",
                    sub_type="multimodal_store",
                    status="completed",
                    owner="system",
                    metadata={
                        "description": "Human-verified multimodal insights & structured extractions promoted to analytics.",
                        "data_format": f"{dialect} JSON + Normalized Rows",
                        "record_count": len(mm_insights),
                        "input_schema": ["extracted_records (approved)"],
                        "output_schema": ["tenant_multimodal_insights", "tenant_orders"],
                    },
                    updated_at=mm_insights[0].get("approved_at") or now,
                ),
                dec_pipe_id,
            )

        rag_kb_nid: str | None = None
        if rag_docs:
            rag_kb_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="storage:rag_knowledge_base",
                    external_id="rag_documents_chunks",
                    pipeline_id=dec_pipe_id,
                    dataset_id=(active_info or {}).get("dataset_id"),
                    name=f"Knowledge Base & Vector Store ({rag_settings.vector_backend.upper()})",
                    node_type="storage",
                    sub_type="vector_db",
                    status="completed",
                    owner="system",
                    metadata={
                        "description": "Indexed company knowledge documents and hybrid dense+BM25 chunk vectors.",
                        "data_format": f"Vector ({rag_settings.embedding_provider}) + Sparse BM25",
                        "record_count": rag_chunk_total,
                        "document_count": len(rag_docs),
                        "input_schema": ["TextSegment Chunks", "Dense Vectors", "Sparse TF"],
                        "output_schema": ["rag_documents", "rag_chunks"],
                    },
                    created_at=rag_docs[0].get("created_at"),
                    updated_at=rag_docs[-1].get("updated_at") or now,
                ),
                dec_pipe_id,
            )

        # ---- Build Data Sources + Processing Pipelines (Columns 0 & 1) ----
        # Track processed nodes that feed into AI Column Mapper / Quality Engine / RAG
        mapper_upstream_nodes: list[tuple[str, str]] = []  # (node_id, pipe_id)
        quality_upstream_nodes: list[tuple[str, str]] = []
        rag_embed_node_id: str | None = None

        # External connectors
        conn_node_by_src: dict[str, str] = {}
        for src in ext_connectors:
            src_logs = conn_logs_by_src.get(src["id"], [])
            latest_clog = src_logs[-1] if src_logs else None
            c_status = (
                "failed" if (latest_clog and latest_clog["status"] == "failed")
                else ("completed" if latest_clog else "pending")
            )
            c_pipe_id = _upsert_pipeline(
                conn,
                company_id=company_id,
                pipe_key=f"connector:{src['id']}",
                name=f"Connector Sync — {src['name']}",
                pipeline_type="connector_sync",
                description=f"Incremental watermark sync from {src['source_type']} data source.",
                status=c_status,
                owner="system",
                metadata={"data_source_id": src["id"], "source_type": src["source_type"]},
                created_at=src.get("created_at"),
                updated_at=src.get("last_synced_at") or src.get("updated_at"),
            )
            active_pipe_ids.add(c_pipe_id)
            src_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key=f"source:conn:{src['id']}",
                    external_id=src["id"],
                    pipeline_id=c_pipe_id,
                    dataset_id=None,
                    name=src["name"],
                    node_type="data_source",
                    sub_type=src["source_type"],
                    status=c_status,
                    owner="system",
                    metadata={
                        "description": f"Configured {src['source_type']} external connector.",
                        "file_type": src["source_type"],
                        "record_count": (latest_clog or {}).get("records_fetched") or 0,
                        "sync_watermark": src.get("sync_watermark"),
                        "last_updated": _iso(src.get("last_synced_at") or src.get("updated_at")),
                        "upload_time": _iso(src.get("created_at")),
                        "quality_status": c_status,
                        "processing_status": src["status"],
                        "config": src.get("config_json") or {},
                    },
                    created_at=src.get("created_at"),
                    updated_at=src.get("last_synced_at") or src.get("updated_at"),
                ),
                c_pipe_id,
            )
            conn_node_by_src[src["id"]] = src_nid

            if src_logs:
                c_run_id = _upsert_run(
                    conn,
                    company_id=company_id,
                    run_key=f"conn_sync:{src['id']}:{latest_clog['id']}",
                    pipeline_id=c_pipe_id,
                    dataset_id=latest_clog.get("dataset_id"),
                    status="failed" if c_status == "failed" else "completed",
                    trigger_type=latest_clog.get("sync_mode") or "incremental",
                    actor=latest_clog.get("actor") or "system",
                    input_refs=[src["name"]],
                    output_refs=[latest_clog.get("dataset_id") or "sync_buffer"],
                    model_version=None,
                    started_at=latest_clog.get("started_at"),
                    completed_at=latest_clog.get("finished_at") or latest_clog.get("started_at"),
                    duration_ms=_ms_between(latest_clog.get("started_at"), latest_clog.get("finished_at")) or 12.0,
                    error_message=latest_clog.get("error_message"),
                    metadata={"records_fetched": latest_clog.get("records_fetched")},
                )
                sync_proc_nid = track_node(
                    _upsert_node(
                        conn,
                        company_id=company_id,
                        node_key=f"proc:conn:{src['id']}",
                        external_id=str(latest_clog["id"]),
                        pipeline_id=c_pipe_id,
                        dataset_id=latest_clog.get("dataset_id"),
                        name=f"Connector Sync ({src['source_type']})",
                        node_type="processing",
                        sub_type="connector_sync",
                        status=c_status,
                        owner=latest_clog.get("actor") or "system",
                        metadata={
                            "description": f"{latest_clog['sync_mode']} watermark synchronization.",
                            "record_count": latest_clog.get("records_fetched"),
                            "run_id": c_run_id,
                            "error_details": latest_clog.get("error_message"),
                        },
                        created_at=latest_clog.get("started_at"),
                        updated_at=latest_clog.get("finished_at") or latest_clog.get("started_at"),
                    ),
                    c_pipe_id,
                )
                link(
                    pid=c_pipe_id,
                    run_id=c_run_id,
                    src=src_nid,
                    tgt=sync_proc_nid,
                    rel="EXTRACTED_FROM",
                    status=c_status,
                    data_transferred=f"{latest_clog.get('records_fetched') or 0} rows",
                    record_count=latest_clog.get("records_fetched"),
                    transformation=f"Incremental fetch ({latest_clog['sync_mode']})",
                    ts=latest_clog.get("started_at"),
                )
                if raw_storage_nid:
                    link(
                        pid=c_pipe_id,
                        run_id=c_run_id,
                        src=sync_proc_nid,
                        tgt=raw_storage_nid,
                        rel="STAGED_IN",
                        status=c_status,
                        record_count=latest_clog.get("records_fetched"),
                        transformation="Persist connector JSON batch",
                        ts=latest_clog.get("finished_at"),
                    )
                _upsert_event(
                    conn,
                    company_id=company_id,
                    event_key=f"conn:{src['id']}:src",
                    pipeline_id=c_pipe_id,
                    pipeline_run_id=c_run_id,
                    node_id=src_nid,
                    event_type="Connector Configured & Connected",
                    step_order=1,
                    timestamp=src.get("created_at"),
                    duration_ms=5.0,
                    status="completed",
                    input_summary=src["name"],
                    output_summary=f"Type: {src['source_type']}",
                )
                _upsert_event(
                    conn,
                    company_id=company_id,
                    event_key=f"conn:{src['id']}:sync:{latest_clog['id']}",
                    pipeline_id=c_pipe_id,
                    pipeline_run_id=c_run_id,
                    node_id=sync_proc_nid,
                    event_type="Connector Sync Failed" if c_status == "failed" else "Connector Sync Completed",
                    step_order=2,
                    timestamp=latest_clog.get("finished_at") or latest_clog.get("started_at"),
                    duration_ms=_ms_between(latest_clog.get("started_at"), latest_clog.get("finished_at")) or 15.0,
                    status=c_status,
                    input_summary=f"Watermark: {latest_clog.get('watermark_before') or 'initial'}",
                    output_summary=f"{latest_clog.get('records_fetched') or 0} records",
                    error_message=latest_clog.get("error_message"),
                )

        # Structured & Legacy Datasets
        dataset_storage_targets: list[tuple[str, str, int, Any, str]] = []  # (node_id, pipe_id, count, ts, ds_id)
        for ds in ds_rows:
            ds_id = ds["id"]
            is_legacy = ds.get("storage_mode") == "legacy_snapshot"
            q_rep = qr_by_ds.get(ds_id)
            logs = logs_by_ds.get(ds_id, [])
            meta = dict(ds.get("metadata_json") or {})
            ds_status = ds["status"]
            has_failed = ds_status == "failed" or any(l["status"] == "failed" for l in logs)
            has_warn = bool(not has_failed and (int(ds.get("invalid_rows") or 0) > 0 or int(ds.get("duplicate_rows") or 0) > 0 or (q_rep and q_rep["overall_score"] < 90)))

            pipe_status = "failed" if has_failed else ("completed" if ds_status == "imported" else ("warning" if has_warn else "pending"))
            pipe_id = _upsert_pipeline(
                conn,
                company_id=company_id,
                pipe_key=f"dataset:{ds_id}",
                name=(f"Snapshot Pipeline — {ds['name']}" if is_legacy else f"Tabular Ingestion — {ds['name']}"),
                pipeline_type="legacy_snapshot" if is_legacy else "tabular_ingestion",
                description=(
                    "Validated 6-table enterprise snapshot ingestion, feature engineering & ML training."
                    if is_legacy
                    else f"4-step enterprise {str(ds.get('file_format') or 'csv').upper()} upload, AI mapping, 5-axis quality cleaning & partitioned import."
                ),
                status=pipe_status,
                owner=ds.get("created_by") or "system",
                metadata={"dataset_id": ds_id, "file_format": ds.get("file_format"), "is_active": bool(ds.get("is_active"))},
                created_at=ds.get("created_at"),
                updated_at=ds.get("updated_at"),
            )
            active_pipe_ids.add(pipe_id)

            last_log_err = next((l.get("error_message") for l in reversed(logs) if l.get("error_message")), None)
            first_ts = (logs[0].get("created_at") if logs else ds.get("created_at"))
            last_ts = (logs[-1].get("created_at") if logs else ds.get("imported_at") or ds.get("updated_at"))
            ds_run_id = _upsert_run(
                conn,
                company_id=company_id,
                run_key=f"dataset_run:{ds_id}",
                pipeline_id=pipe_id,
                dataset_id=ds_id,
                status="failed" if has_failed else "completed",
                trigger_type="snapshot_load" if is_legacy else (ds.get("kind") or "uploaded"),
                actor=ds.get("created_by") or "system",
                input_refs=[ds.get("file_name") or ds["name"]],
                output_refs=[f"Dataset {ds_id}"],
                model_version=(active_artifact or {}).get("version") if active_info and active_info["dataset_id"] == ds_id else None,
                started_at=first_ts,
                completed_at=last_ts,
                duration_ms=_ms_between(first_ts, last_ts) or 25.0,
                error_message=last_log_err,
                metadata={"row_count": int(ds.get("row_count") or 0), "valid_rows": int(ds.get("valid_rows") or 0)},
            )

            src_label = (
                f"{ds['name']} ({ds_id[:8]})" if is_legacy
                else (ds.get("file_name") or ds["name"])
            )
            q_score = (q_rep or {}).get("overall_score") if q_rep else (100.0 if is_legacy else meta.get("quality_score"))
            src_node_status = "failed" if has_failed else ("warning" if has_warn else "completed")
            ds_src_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key=f"source:ds:{ds_id}",
                    external_id=ds_id,
                    pipeline_id=pipe_id,
                    dataset_id=ds_id,
                    name=src_label,
                    node_type="data_source",
                    sub_type=str(ds.get("file_format") or "csv").lower(),
                    status=src_node_status,
                    owner=ds.get("created_by") or "system",
                    metadata={
                        "description": f"{'Snapshot' if is_legacy else 'Uploaded tabular'} data source ({int(ds.get('row_count') or 0):,} rows).",
                        "file_type": str(ds.get("file_format") or "csv").upper(),
                        "file_name": ds.get("file_name") or ds["name"],
                        "file_size_bytes": int(ds.get("file_size_bytes") or 0),
                        "record_count": int(ds.get("row_count") or 0),
                        "valid_rows": int(ds.get("valid_rows") or 0),
                        "invalid_rows": int(ds.get("invalid_rows") or 0),
                        "duplicate_rows": int(ds.get("duplicate_rows") or 0),
                        "upload_time": _iso(ds.get("created_at")),
                        "last_updated": _iso(ds.get("updated_at")),
                        "quality_status": f"{q_score:.1f}%" if q_score is not None else ds["status"],
                        "quality_score": q_score,
                        "processing_status": ds["status"],
                        "currency": meta.get("currency"),
                        "input_schema": meta.get("columns") or [],
                        "output_schema": list((ds.get("mapping_json") or {}).values()),
                        "checksum_sha256": ds.get("checksum_sha256"),
                        "run_id": ds_run_id,
                        "execution_time": _iso(ds.get("created_at")),
                    },
                    created_at=ds.get("created_at"),
                    updated_at=ds.get("updated_at"),
                ),
                pipe_id,
            )
            if ds.get("data_source_id") in conn_node_by_src:
                link(
                    pid=pipe_id,
                    run_id=ds_run_id,
                    src=conn_node_by_src[ds["data_source_id"]],
                    tgt=ds_src_nid,
                    rel="SYNCED_TO",
                    status="completed",
                    record_count=int(ds.get("row_count") or 0),
                    transformation="Materialize synced connector dataset",
                    ts=ds.get("created_at"),
                )

            _upsert_event(
                conn,
                company_id=company_id,
                event_key=f"ds:{ds_id}:01_upload",
                pipeline_id=pipe_id,
                pipeline_run_id=ds_run_id,
                node_id=ds_src_nid,
                event_type="Snapshot Loaded" if is_legacy else "File Uploaded",
                step_order=1,
                timestamp=ds.get("created_at"),
                duration_ms=8.0,
                status="completed",
                input_summary=src_label,
                output_summary=f"{int(ds.get('row_count') or 0):,} raw rows ({len(meta.get('columns') or [])} cols)",
            )

            # Processing step 1: Ingestion & Validation
            val_log = next((l for l in reversed(logs) if l["stage"] == "validation"), None)
            imp_log = next((l for l in reversed(logs) if l["stage"] in {"import", "activate"}), None)
            map_log = next((l for l in reversed(logs) if l["stage"] == "mapping"), None)

            val_status = (
                "failed" if ((val_log and val_log["status"] == "failed") or (has_failed and not imp_log))
                else ("warning" if has_warn else ("completed" if (q_rep or val_log or is_legacy or ds_status == "validated") else "pending"))
            )
            val_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key=f"proc:val:{ds_id}",
                    external_id=(q_rep or {}).get("id") or ds_id,
                    pipeline_id=pipe_id,
                    dataset_id=ds_id,
                    name=("Snapshot Schema Verification" if is_legacy else f"Validation & Cleaning ({ds['name'][:26]})"),
                    node_type="processing",
                    sub_type="data_validation",
                    status=val_status,
                    owner=(val_log or {}).get("actor") or ds.get("created_by") or "system",
                    metadata={
                        "description": "5-axis data quality scoring (Completeness, Validity, Consistency, Uniqueness, Accuracy), date/currency normalization & deduplication.",
                        "record_count": int(ds.get("valid_rows") or ds.get("row_count") or 0),
                        "quality_metrics": {
                            "overall_score": q_score,
                            "completeness": (q_rep or {}).get("completeness_score"),
                            "validity": (q_rep or {}).get("validity_score"),
                            "consistency": (q_rep or {}).get("consistency_score"),
                            "uniqueness": (q_rep or {}).get("uniqueness_score"),
                            "accuracy": (q_rep or {}).get("accuracy_score"),
                            "invalid_rows": int(ds.get("invalid_rows") or 0),
                            "duplicate_rows": int(ds.get("duplicate_rows") or 0),
                        },
                        "input_schema": meta.get("columns") or [],
                        "output_schema": ["Normalized Date", "Numeric Money", "Clean Rows"],
                        "run_id": ds_run_id,
                        "execution_time": _iso((val_log or {}).get("created_at") or ds.get("updated_at")),
                        "error_details": (val_log or {}).get("error_message") or last_log_err,
                    },
                    created_at=(val_log or {}).get("created_at") or ds.get("created_at"),
                    updated_at=(val_log or {}).get("created_at") or ds.get("updated_at"),
                ),
                pipe_id,
            )
            link(
                pid=pipe_id,
                run_id=ds_run_id,
                src=ds_src_nid,
                tgt=val_nid,
                rel="VALIDATED_BY",
                status=val_status,
                data_transferred=f"{int(ds.get('row_count') or 0):,} raw rows",
                record_count=int(ds.get("row_count") or 0),
                transformation="Schema parsing, 5-axis quality scoring & currency/date normalization",
                ts=(val_log or {}).get("created_at") or ds.get("created_at"),
            )
            if raw_storage_nid:
                link(
                    pid=pipe_id,
                    run_id=ds_run_id,
                    src=ds_src_nid,
                    tgt=raw_storage_nid,
                    rel="ARCHIVED_IN",
                    status="completed",
                    data_transferred=ds.get("file_name") or ds["name"],
                    record_count=int(ds.get("row_count") or 0),
                    transformation="SHA-256 checksummed raw storage persistence",
                    ts=ds.get("created_at"),
                )

            if not is_legacy and (map_log or ds.get("mapping_confirmed")):
                mapper_upstream_nodes.append((val_nid, pipe_id))
            if q_rep:
                quality_upstream_nodes.append((val_nid, pipe_id))

            _upsert_event(
                conn,
                company_id=company_id,
                event_key=f"ds:{ds_id}:02_validate",
                pipeline_id=pipe_id,
                pipeline_run_id=ds_run_id,
                node_id=val_nid,
                event_type="Snapshot Integrity Verified" if is_legacy else "Data Validation & Cleaning Completed",
                step_order=2,
                timestamp=(val_log or {}).get("created_at") or ds.get("created_at"),
                duration_ms=14.0,
                status=val_status,
                input_summary=f"{int(ds.get('row_count') or 0):,} rows",
                output_summary=f"Quality {q_score:.1f}% · {int(ds.get('valid_rows') or 0):,} valid rows" if q_score is not None else "Schema verified",
                error_message=(val_log or {}).get("error_message"),
            )

            # Processing step 2: Feature Engineering & Normalization
            feat_status = (
                "failed" if (imp_log and imp_log["status"] == "failed") or has_failed
                else ("completed" if ds_status == "imported" else "pending")
            )
            feat_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key=f"proc:feat:{ds_id}",
                    external_id=ds_id,
                    pipeline_id=pipe_id,
                    dataset_id=ds_id,
                    name=("Series Feature Engineering" if is_legacy else f"Normalization & Feature Eng ({ds['name'][:22]})"),
                    node_type="processing",
                    sub_type="feature_engineering",
                    status=feat_status,
                    owner=(imp_log or {}).get("actor") or ds.get("created_by") or "system",
                    metadata={
                        "description": "Derives daily revenue/quantity lag features, rolling statistics, holiday flags, and anomaly frames into partitioned analytical tables.",
                        "record_count": int(ds.get("valid_rows") or ds.get("row_count") or 0),
                        "input_schema": ["Clean Canonical Transactions"],
                        "output_schema": ["observed_series matrix", "anomaly_frame", "tenant_transactions"],
                        "run_id": ds_run_id,
                        "execution_time": _iso((imp_log or {}).get("created_at") or ds.get("imported_at")),
                        "error_details": (imp_log or {}).get("error_message") if feat_status == "failed" else None,
                    },
                    created_at=(imp_log or {}).get("created_at") or ds.get("imported_at") or ds.get("updated_at"),
                    updated_at=(imp_log or {}).get("created_at") or ds.get("imported_at") or ds.get("updated_at"),
                ),
                pipe_id,
            )
            link(
                pid=pipe_id,
                run_id=ds_run_id,
                src=val_nid,
                tgt=feat_nid,
                rel="ENGINEERS_FEATURES",
                status=feat_status,
                data_transferred=f"{int(ds.get('valid_rows') or ds.get('row_count') or 0):,} clean rows",
                record_count=int(ds.get("valid_rows") or ds.get("row_count") or 0),
                transformation="Partitioned metric aggregation & lag feature computation",
                ts=(imp_log or {}).get("created_at") or ds.get("imported_at") or ds.get("updated_at"),
            )
            _upsert_event(
                conn,
                company_id=company_id,
                event_key=f"ds:{ds_id}:03_features",
                pipeline_id=pipe_id,
                pipeline_run_id=ds_run_id,
                node_id=feat_nid,
                event_type="Feature Engineering Failed" if feat_status == "failed" else "Feature Engineering & Load Completed",
                step_order=3,
                timestamp=(imp_log or {}).get("created_at") or ds.get("imported_at") or ds.get("updated_at"),
                duration_ms=22.0,
                status=feat_status,
                input_summary=f"{int(ds.get('valid_rows') or ds.get('row_count') or 0):,} validated rows",
                output_summary=f"Loaded into {dialect} partitions" if feat_status == "completed" else feat_status,
                error_message=(imp_log or {}).get("error_message") if feat_status == "failed" else None,
            )
            if rel_db_nid and feat_status == "completed":
                dataset_storage_targets.append((feat_nid, pipe_id, int(ds.get("valid_rows") or ds.get("row_count") or 0), ds.get("imported_at"), ds_id))
                link(
                    pid=pipe_id,
                    run_id=ds_run_id,
                    src=feat_nid,
                    tgt=rel_db_nid,
                    rel="STORED_IN",
                    status="completed",
                    data_transferred=f"{int(ds.get('valid_rows') or ds.get('row_count') or 0):,} analytical rows",
                    record_count=int(ds.get("valid_rows") or ds.get("row_count") or 0),
                    transformation=f"Atomic write to {dialect} tables",
                    ts=ds.get("imported_at") or ds.get("updated_at"),
                )

        # Multimodal Files & Async Jobs
        mm_storage_links: list[tuple[str, str, int, Any]] = []
        for mf in mm_files:
            fid = mf["id"]
            job = jobs_by_file.get(fid)
            p_stat = mf["processing_status"]
            j_stat = (job or {}).get("status")
            node_status = (
                "processing" if (j_stat in {"queued", "running"} or p_stat == "processing")
                else ("failed" if (j_stat == "failed" or p_stat == "failed")
                      else ("warning" if p_stat == "awaiting_approval"
                            else ("completed" if p_stat == "imported" else "pending")))
            )
            mm_pipe_id = _upsert_pipeline(
                conn,
                company_id=company_id,
                pipe_key=f"multimodal:{fid}",
                name=f"Multimodal Pipeline — {mf['file_name']}",
                pipeline_type="multimodal_extraction",
                description=f"{mf['modality'].title()} extraction, confidence gating & HITL approval workflow.",
                status="processing" if node_status == "processing" else ("failed" if node_status == "failed" else ("warning" if node_status == "warning" else "completed")),
                owner=mf.get("created_by") or "system",
                metadata={"file_id": fid, "modality": mf["modality"], "dataset_id": mf["dataset_id"]},
                created_at=mf.get("upload_timestamp"),
                updated_at=mf.get("updated_at"),
            )
            active_pipe_ids.add(mm_pipe_id)

            j_started = (job or {}).get("started_at") or mf.get("upload_timestamp")
            j_finished = (job or {}).get("finished_at") or mf.get("updated_at")
            mm_run_id = _upsert_run(
                conn,
                company_id=company_id,
                run_key=f"mm_run:{fid}",
                pipeline_id=mm_pipe_id,
                dataset_id=mf["dataset_id"],
                status="running" if node_status == "processing" else ("failed" if node_status == "failed" else "completed"),
                trigger_type="async_queue",
                actor=mf.get("created_by") or "system",
                input_refs=[mf["file_name"]],
                output_refs=[f"extracted_records ({ext_counts.get(fid, 0)})"],
                model_version=f"{mf['modality']}_extractor",
                started_at=j_started,
                completed_at=None if node_status == "processing" else j_finished,
                duration_ms=_ms_between(j_started, j_finished) if node_status != "processing" else None,
                error_message=(job or {}).get("error_message"),
                metadata={"job_id": (job or {}).get("id"), "modality": mf["modality"]},
            )

            mm_src_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key=f"source:mm:{fid}",
                    external_id=fid,
                    pipeline_id=mm_pipe_id,
                    dataset_id=mf["dataset_id"],
                    name=mf["file_name"],
                    node_type="data_source",
                    sub_type=mf["modality"],
                    status=node_status,
                    owner=mf.get("created_by") or "system",
                    metadata={
                        "description": f"Uploaded {mf['modality']} file ({mf['mime_type']}).",
                        "file_type": mf["file_format"].upper(),
                        "modality": mf["modality"],
                        "file_size_bytes": int(mf.get("file_size_bytes") or 0),
                        "record_count": ext_counts.get(fid, 0),
                        "upload_time": _iso(mf.get("upload_timestamp")),
                        "last_updated": _iso(mf.get("updated_at")),
                        "quality_status": mf.get("validation_status"),
                        "processing_status": mf["processing_status"],
                        "checksum_sha256": mf.get("checksum_sha256"),
                        "run_id": mm_run_id,
                    },
                    created_at=mf.get("upload_timestamp"),
                    updated_at=mf.get("updated_at"),
                ),
                mm_pipe_id,
            )
            if raw_storage_nid:
                link(
                    pid=mm_pipe_id,
                    run_id=mm_run_id,
                    src=mm_src_nid,
                    tgt=raw_storage_nid,
                    rel="ARCHIVED_IN",
                    status="completed",
                    data_transferred=mf["file_name"],
                    record_count=1,
                    transformation="Store validated multimodal media blob",
                    ts=mf.get("upload_timestamp"),
                )

            extract_stat = (
                "processing" if node_status == "processing"
                else ("failed" if node_status == "failed"
                      else ("pending" if p_stat == "uploaded" else "completed"))
            )
            ext_proc_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key=f"proc:mm_extract:{fid}",
                    external_id=(job or {}).get("id") or fid,
                    pipeline_id=mm_pipe_id,
                    dataset_id=mf["dataset_id"],
                    name=f"{mf['modality'].title()} Extraction ({mf['file_name'][:20]})",
                    node_type="processing",
                    sub_type="ocr_parsing",
                    status=extract_stat,
                    owner=mf.get("created_by") or "system",
                    metadata={
                        "description": f"Async queue worker parsing {mf['modality']} content, metadata & candidate entities.",
                        "record_count": ext_counts.get(fid, 0),
                        "run_id": mm_run_id,
                        "execution_time": _iso(j_started),
                        "duration_ms": _ms_between(j_started, j_finished),
                        "error_details": (job or {}).get("error_message"),
                        "extraction_summary": mf.get("extraction_summary_json") or {},
                    },
                    created_at=j_started,
                    updated_at=j_finished or mf.get("updated_at"),
                ),
                mm_pipe_id,
            )
            link(
                pid=mm_pipe_id,
                run_id=mm_run_id,
                src=mm_src_nid,
                tgt=ext_proc_nid,
                rel="PARSED_BY",
                status=extract_stat,
                data_transferred=f"{int(mf.get('file_size_bytes') or 0)} bytes",
                record_count=ext_counts.get(fid, 0),
                transformation=f"Multimodal {mf['modality']} extractor ({mf['extraction_status']})",
                ts=j_started,
            )

            hitl_stat = (
                "failed" if node_status == "failed"
                else ("warning" if p_stat == "awaiting_approval"
                      else ("completed" if p_stat == "imported" else "pending"))
            )
            hitl_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key=f"proc:mm_hitl:{fid}",
                    external_id=fid,
                    pipeline_id=mm_pipe_id,
                    dataset_id=mf["dataset_id"],
                    name=f"HITL Approval ({mf['file_name'][:22]})",
                    node_type="processing",
                    sub_type="data_normalization",
                    status=hitl_stat,
                    owner=mf.get("created_by") or "system",
                    metadata={
                        "description": "Human-in-the-loop confidence verification before promoting multimodal records into BI tables.",
                        "record_count": ext_counts.get(fid, 0),
                        "validation_status": mf["validation_status"],
                        "run_id": mm_run_id,
                        "execution_time": _iso(mf.get("imported_at") or mf.get("updated_at")),
                    },
                    created_at=j_finished or mf.get("updated_at"),
                    updated_at=mf.get("imported_at") or mf.get("updated_at"),
                ),
                mm_pipe_id,
            )
            link(
                pid=mm_pipe_id,
                run_id=mm_run_id,
                src=ext_proc_nid,
                tgt=hitl_nid,
                rel="VALIDATED_BY",
                status=hitl_stat if node_status != "processing" else "processing",
                data_transferred=f"{ext_counts.get(fid, 0)} extracted record(s)",
                record_count=ext_counts.get(fid, 0),
                transformation="Human verification & canonical normalization",
                ts=mf.get("updated_at"),
            )
            if p_stat == "imported":
                if mm_store_nid:
                    mm_storage_links.append((hitl_nid, mm_pipe_id, ext_counts.get(fid, 0), mf.get("imported_at")))
                    link(
                        pid=mm_pipe_id,
                        run_id=mm_run_id,
                        src=hitl_nid,
                        tgt=mm_store_nid,
                        rel="PROMOTED_TO",
                        status="completed",
                        record_count=ext_counts.get(fid, 0),
                        transformation="Persist approved multimodal insights",
                        ts=mf.get("imported_at"),
                    )
                if rel_db_nid:
                    link(
                        pid=mm_pipe_id,
                        run_id=mm_run_id,
                        src=hitl_nid,
                        tgt=rel_db_nid,
                        rel="STORED_IN",
                        status="completed",
                        record_count=ext_counts.get(fid, 0),
                        transformation="Promote financial rows to tenant_orders / tenant_transactions",
                        ts=mf.get("imported_at"),
                    )

            _upsert_event(
                conn,
                company_id=company_id,
                event_key=f"mm:{fid}:01_upload",
                pipeline_id=mm_pipe_id,
                pipeline_run_id=mm_run_id,
                node_id=mm_src_nid,
                event_type="Multimodal File Uploaded",
                step_order=1,
                timestamp=mf.get("upload_timestamp"),
                duration_ms=6.0,
                status="completed",
                input_summary=mf["file_name"],
                output_summary=f"{mf['modality']} ({int(mf.get('file_size_bytes') or 0)} bytes)",
            )
            _upsert_event(
                conn,
                company_id=company_id,
                event_key=f"mm:{fid}:02_extract",
                pipeline_id=mm_pipe_id,
                pipeline_run_id=mm_run_id,
                node_id=ext_proc_nid,
                event_type="Multimodal Extraction Failed" if extract_stat == "failed" else ("Multimodal Extracting" if extract_stat == "processing" else "Multimodal Extraction Completed"),
                step_order=2,
                timestamp=j_finished or j_started,
                duration_ms=_ms_between(j_started, j_finished) or 18.0,
                status=extract_stat,
                input_summary=mf["file_name"],
                output_summary=f"{ext_counts.get(fid, 0)} candidate extractions",
                error_message=(job or {}).get("error_message"),
            )
            if p_stat in {"awaiting_approval", "imported"}:
                _upsert_event(
                    conn,
                    company_id=company_id,
                    event_key=f"mm:{fid}:03_hitl",
                    pipeline_id=mm_pipe_id,
                    pipeline_run_id=mm_run_id,
                    node_id=hitl_nid,
                    event_type="HITL Approved & Promoted" if p_stat == "imported" else "Awaiting Human Verification",
                    step_order=3,
                    timestamp=mf.get("imported_at") or mf.get("updated_at"),
                    duration_ms=10.0,
                    status=hitl_stat,
                    input_summary=f"{ext_counts.get(fid, 0)} extractions",
                    output_summary="Promoted to BI" if p_stat == "imported" else "Pending human review",
                )

        # Standalone RAG Documents + Dataset Knowledge Sync
        if rag_docs:
            rag_pipe_id = _upsert_pipeline(
                conn,
                company_id=company_id,
                pipe_key="rag_knowledge:main",
                name="Enterprise RAG Knowledge Pipeline",
                pipeline_type="rag_knowledge",
                description="Document parsing, structure-aware chunking, dense+BM25 embedding generation & hybrid retrieval indexing.",
                status="completed",
                owner=rag_docs[0].get("created_by") or "system",
                metadata={"document_count": len(rag_docs), "chunk_count": rag_chunk_total},
                created_at=rag_docs[0].get("created_at"),
                updated_at=rag_docs[-1].get("updated_at"),
            )
            active_pipe_ids.add(rag_pipe_id)
            rag_run_id = _upsert_run(
                conn,
                company_id=company_id,
                run_key="rag_index_main",
                pipeline_id=rag_pipe_id,
                dataset_id=(active_info or {}).get("dataset_id"),
                status="completed",
                trigger_type="rag_ingest",
                actor=rag_docs[-1].get("created_by") or "system",
                input_refs=[d["file_name"] for d in rag_docs[:8]],
                output_refs=[f"{rag_chunk_total} chunks indexed"],
                model_version=rag_settings.embedding_provider,
                started_at=rag_docs[0].get("created_at"),
                completed_at=rag_docs[-1].get("updated_at"),
                duration_ms=_ms_between(rag_docs[0].get("created_at"), rag_docs[-1].get("updated_at")) or 35.0,
            )
            rag_embed_node_id = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="proc:rag_embedding",
                    external_id=rag_settings.embedding_provider,
                    pipeline_id=rag_pipe_id,
                    dataset_id=(active_info or {}).get("dataset_id"),
                    name="Embedding Generation",
                    node_type="processing",
                    sub_type="embedding_generation",
                    status="completed",
                    owner="system",
                    metadata={
                        "description": f"Generates {rag_embedder.dimension}-d dense embeddings and sparse BM25 term frequencies per chunk.",
                        "record_count": rag_chunk_total,
                        "model_version": rag_embedder.provider_name,
                        "run_id": rag_run_id,
                    },
                    created_at=rag_docs[0].get("created_at"),
                    updated_at=rag_docs[-1].get("updated_at"),
                ),
                rag_pipe_id,
            )
            if rag_kb_nid:
                link(
                    pid=rag_pipe_id,
                    run_id=rag_run_id,
                    src=rag_embed_node_id,
                    tgt=rag_kb_nid,
                    rel="INDEXED_INTO",
                    status="completed",
                    data_transferred=f"{rag_chunk_total} vectors",
                    record_count=rag_chunk_total,
                    transformation="Store dense vectors + sparse BM25 chunks",
                    ts=rag_docs[-1].get("updated_at"),
                )

            mm_by_id = {f["id"]: f for f in mm_files}
            ds_by_id = {d["id"]: d for d in ds_rows}

            for idx, doc in enumerate(rag_docs, start=1):
                src_file_id = doc.get("source_file_id")
                doc_status = "completed" if doc["status"] == "indexed" else doc["status"]
                if doc["source_type"] == "rag_upload" or (not src_file_id) or (src_file_id not in mm_by_id and src_file_id not in ds_by_id):
                    rag_src_nid = track_node(
                        _upsert_node(
                            conn,
                            company_id=company_id,
                            node_key=f"source:rag:{doc['id']}",
                            external_id=doc["id"],
                            pipeline_id=rag_pipe_id,
                            dataset_id=doc.get("dataset_id"),
                            name=doc["file_name"],
                            node_type="data_source",
                            sub_type=doc.get("document_type") or "txt",
                            status=doc_status,
                            owner=doc.get("created_by") or "system",
                            metadata={
                                "description": f"Knowledge document ingested into Hybrid RAG store ({doc['domain']}).",
                                "file_type": (doc.get("document_type") or "txt").upper(),
                                "domain": doc.get("domain"),
                                "record_count": int(doc.get("chunk_count") or 0),
                                "char_count": int(doc.get("char_count") or 0),
                                "upload_time": _iso(doc.get("created_at")),
                                "last_updated": _iso(doc.get("updated_at")),
                                "quality_status": doc["status"],
                                "processing_status": doc["status"],
                            },
                            created_at=doc.get("created_at"),
                            updated_at=doc.get("updated_at"),
                        ),
                        rag_pipe_id,
                    )
                    upstream_rag_src = rag_src_nid
                elif src_file_id in mm_by_id:
                    upstream_rag_src = _det_id("ln", company_id, f"proc:mm_extract:{src_file_id}")
                else:
                    upstream_rag_src = _det_id("ln", company_id, f"proc:feat:{src_file_id}")

                chunk_nid = track_node(
                    _upsert_node(
                        conn,
                        company_id=company_id,
                        node_key=f"proc:rag_chunk:{doc['id']}",
                        external_id=doc["id"],
                        pipeline_id=rag_pipe_id,
                        dataset_id=doc.get("dataset_id"),
                        name=f"Document Chunking ({doc['file_name'][:20]})",
                        node_type="processing",
                        sub_type="document_parsing",
                        status=doc_status,
                        owner=doc.get("created_by") or "system",
                        metadata={
                            "description": "Structure-aware recursive chunking & content deduplication.",
                            "record_count": int(doc.get("chunk_count") or 0),
                            "char_count": int(doc.get("char_count") or 0),
                            "domain": doc.get("domain"),
                            "run_id": rag_run_id,
                        },
                        created_at=doc.get("created_at"),
                        updated_at=doc.get("updated_at"),
                    ),
                    rag_pipe_id,
                )
                link(
                    pid=rag_pipe_id,
                    run_id=rag_run_id,
                    src=upstream_rag_src,
                    tgt=chunk_nid,
                    rel="CHUNKED_FROM",
                    status=doc_status,
                    data_transferred=f"{int(doc.get('char_count') or 0):,} chars",
                    record_count=int(doc.get("chunk_count") or 0),
                    transformation=f"Extract & chunk {doc.get('document_type', 'doc')}",
                    ts=doc.get("created_at"),
                )
                link(
                    pid=rag_pipe_id,
                    run_id=rag_run_id,
                    src=chunk_nid,
                    tgt=rag_embed_node_id,
                    rel="EMBEDDED_BY",
                    status=doc_status,
                    record_count=int(doc.get("chunk_count") or 0),
                    transformation=f"Encode {rag_settings.embedding_provider} embeddings",
                    ts=doc.get("updated_at"),
                )
                _upsert_event(
                    conn,
                    company_id=company_id,
                    event_key=f"rag:{doc['id']}:idx",
                    pipeline_id=rag_pipe_id,
                    pipeline_run_id=rag_run_id,
                    node_id=chunk_nid,
                    event_type=f"Document Chunked & Embedded ({doc['file_name'][:32]})",
                    step_order=idx,
                    timestamp=doc.get("updated_at") or doc.get("created_at"),
                    duration_ms=16.0,
                    status=doc_status,
                    input_summary=doc["file_name"],
                    output_summary=f"{int(doc.get('chunk_count') or 0)} chunks -> {rag_settings.vector_backend.upper()}",
                )

        # ---- Column 3: AI & Analytics Models (STRICTLY IMPLEMENTED ONLY) ----
        ai_nodes: dict[str, str] = {}
        if mapper_upstream_nodes:
            nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="ai:column_mapper",
                    external_id="ai_column_mapper",
                    pipeline_id=dec_pipe_id,
                    dataset_id=(active_info or {}).get("dataset_id"),
                    name="AI Column Mapper",
                    node_type="ai_model",
                    sub_type="schema_mapper",
                    status="completed",
                    owner="system",
                    metadata={
                        "description": "Multilingual EN/VI semantic header & value-profiling mapper + reusable company mapping templates.",
                        "model_version": "semantic-alias-v1",
                    },
                    updated_at=now,
                ),
                dec_pipe_id,
            )
            ai_nodes["mapper"] = nid
            for src_val_nid, src_pipe in mapper_upstream_nodes:
                link(
                    pid=src_pipe,
                    run_id=dec_run_id,
                    src=src_val_nid,
                    tgt=nid,
                    rel="MAPPED_WITH",
                    status="completed",
                    transformation="Canonical column inference & template binding",
                )

        if quality_upstream_nodes:
            latest_qr = list(qr_by_ds.values())[-1]
            nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="ai:quality_engine",
                    external_id=latest_qr["id"],
                    pipeline_id=dec_pipe_id,
                    dataset_id=latest_qr["dataset_id"],
                    name="5-Axis Quality Engine",
                    node_type="ai_model",
                    sub_type="quality_scorer",
                    status="completed" if latest_qr["overall_score"] >= 85 else "warning",
                    owner="system",
                    metadata={
                        "description": "Computes Completeness, Validity, Consistency, Uniqueness & Accuracy scores plus anomaly issue reports.",
                        "model_version": "quality-5axis-v1",
                        "quality_metrics": {"overall_score": latest_qr["overall_score"]},
                    },
                    updated_at=latest_qr.get("created_at") or now,
                ),
                dec_pipe_id,
            )
            ai_nodes["quality"] = nid
            for src_val_nid, src_pipe in quality_upstream_nodes:
                link(
                    pid=src_pipe,
                    run_id=dec_run_id,
                    src=src_val_nid,
                    tgt=nid,
                    rel="SCORED_BY",
                    status="completed",
                    transformation="5-axis row & column diagnostic scoring",
                )

        if rel_db_nid and active_info:
            caps = active_info.get("capabilities") or FULL_CAPABILITIES
            if caps.get("supports_forecast", True):
                lgb_status = "completed" if active_artifact else "pending"
                fc_report = ((active_artifact or {}).get("report") or {}).get("forecast") or {}
                nid = track_node(
                    _upsert_node(
                        conn,
                        company_id=company_id,
                        node_key="ai:lightgbm_forecaster",
                        external_id=(active_artifact or {}).get("version") or "untrained",
                        pipeline_id=dec_pipe_id,
                        dataset_id=active_info["dataset_id"],
                        name="LightGBM Forecaster",
                        node_type="ai_model",
                        sub_type="lightgbm",
                        status=lgb_status,
                        owner="system",
                        metadata={
                            "description": "Gradient-boosted & causal rolling-origin demand forecasting model pinned to active dataset artifact.",
                            "model_version": (active_artifact or {}).get("version") or "Artifact not trained (<7 days or pending)",
                            "quality_metrics": fc_report,
                        },
                        updated_at=now,
                    ),
                    dec_pipe_id,
                )
                ai_nodes["lightgbm"] = nid
                link(
                    pid=dec_pipe_id,
                    run_id=dec_run_id,
                    src=rel_db_nid,
                    tgt=nid,
                    rel="TRAINS_AND_SCORES",
                    status=lgb_status,
                    record_count=total_db_records,
                    transformation="Observed time-series matrix & holdout conformal bounds",
                )

            if caps.get("supports_anomalies", True):
                anom_status = "completed" if active_artifact else "normal"
                nid = track_node(
                    _upsert_node(
                        conn,
                        company_id=company_id,
                        node_key="ai:anomaly_detector",
                        external_id=(active_artifact or {}).get("version") or "hybrid-if-zscore",
                        pipeline_id=dec_pipe_id,
                        dataset_id=active_info["dataset_id"],
                        name="Hybrid Anomaly Detector",
                        node_type="ai_model",
                        sub_type="anomaly_detection",
                        status=anom_status,
                        owner="system",
                        metadata={
                            "description": "Hybrid Isolation Forest + Rolling Z-Score detector for revenue, margin, ROAS & stockout anomalies.",
                            "model_version": "hybrid-if-zscore-v1",
                        },
                        updated_at=now,
                    ),
                    dec_pipe_id,
                )
                ai_nodes["anomaly"] = nid
                link(
                    pid=dec_pipe_id,
                    run_id=dec_run_id,
                    src=rel_db_nid,
                    tgt=nid,
                    rel="ANALYZES",
                    status=anom_status,
                    record_count=total_db_records,
                    transformation="Anomaly feature frame scoring",
                )

            if caps.get("supports_price_sim") or caps.get("supports_marketing_sim") or caps.get("supports_inventory_sim") or sim_rows:
                nid = track_node(
                    _upsert_node(
                        conn,
                        company_id=company_id,
                        node_key="ai:scenario_simulator",
                        external_id=sim_rows[0]["id"] if sim_rows else active_info["dataset_id"],
                        pipeline_id=dec_pipe_id,
                        dataset_id=active_info["dataset_id"],
                        name="What-If Elasticity Simulator",
                        node_type="ai_model",
                        sub_type="simulation_engine",
                        status="completed",
                        owner="system",
                        metadata={
                            "description": "Microeconomic price elasticity, saturated ROAS & lead-time inventory policy simulator.",
                            "model_version": "microecon-sim-v1",
                            "record_count": len(sim_rows),
                        },
                        updated_at=(sim_rows[0].get("created_at") if sim_rows else now),
                    ),
                    dec_pipe_id,
                )
                ai_nodes["simulator"] = nid
                link(
                    pid=dec_pipe_id,
                    run_id=dec_run_id,
                    src=rel_db_nid,
                    tgt=nid,
                    rel="FEEDS_MODEL",
                    status="completed",
                    record_count=len(sim_rows),
                    transformation="Elasticity curves, margin constraints & lead-time bounds",
                )

            nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="ai:rec_engine",
                    external_id=active_info["dataset_id"],
                    pipeline_id=dec_pipe_id,
                    dataset_id=active_info["dataset_id"],
                    name="Recommendation Engine",
                    node_type="ai_model",
                    sub_type="recommendation_engine",
                    status="completed",
                    owner="system",
                    metadata={
                        "description": "Deterministic root-cause attribution & constrained recommendation generator.",
                        "model_version": "prescriptive-v1",
                    },
                    updated_at=now,
                ),
                dec_pipe_id,
            )
            ai_nodes["recommendation"] = nid
            link(
                pid=dec_pipe_id,
                run_id=dec_run_id,
                src=rel_db_nid,
                tgt=nid,
                rel="FEEDS_MODEL",
                status="completed",
                transformation="Root-cause & anomaly ranking",
            )

            nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="ai:text_to_sql",
                    external_id="safe_text_to_sql",
                    pipeline_id=dec_pipe_id,
                    dataset_id=active_info["dataset_id"],
                    name="Safe Text-to-SQL Engine",
                    node_type="ai_model",
                    sub_type="sql_analytics_engine",
                    status="completed",
                    owner="system",
                    metadata={
                        "description": "AST-validated read-only SELECT Text-to-SQL engine strictly scoped by company_id & dataset_id.",
                        "model_version": "ast-guarded-sql-v1",
                        "record_count": len(sql_traces),
                    },
                    updated_at=(sql_traces[0].get("created_at") if sql_traces else now),
                ),
                dec_pipe_id,
            )
            ai_nodes["text2sql"] = nid
            link(
                pid=dec_pipe_id,
                run_id=dec_run_id,
                src=rel_db_nid,
                tgt=nid,
                rel="QUERIED_BY",
                status="completed",
                record_count=len(sql_traces),
                transformation="Read-only AST-verified SQL execution",
            )

        if rag_kb_nid:
            nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="ai:hybrid_rag",
                    external_id=rag_settings.embedding_provider,
                    pipeline_id=dec_pipe_id,
                    dataset_id=(active_info or {}).get("dataset_id"),
                    name="Hybrid RAG Retrieval & Reranker",
                    node_type="ai_model",
                    sub_type="rag_retrieval_engine",
                    status="completed",
                    owner="system",
                    metadata={
                        "description": "Hybrid Dense + BM25 + Reciprocal Rank Fusion + cross-encoder style reranker with citation guard.",
                        "model_version": f"{rag_settings.embedding_provider} (0.6 dense / 0.4 bm25)",
                        "record_count": rag_chunk_total,
                    },
                    updated_at=now,
                ),
                dec_pipe_id,
            )
            ai_nodes["rag"] = nid
            link(
                pid=dec_pipe_id,
                run_id=dec_run_id,
                src=rag_kb_nid,
                tgt=nid,
                rel="RETRIEVES_FROM",
                status="completed",
                record_count=rag_chunk_total,
                transformation="Hybrid Dense + BM25 RRF retrieval & reranking",
            )

        if ai_nodes:
            nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="ai:llm_orchestrator",
                    external_id="copilot_orchestrator",
                    pipeline_id=dec_pipe_id,
                    dataset_id=(active_info or {}).get("dataset_id"),
                    name="LLM & Intent Orchestrator",
                    node_type="ai_model",
                    sub_type="llm_orchestrator",
                    status="completed",
                    owner="system",
                    metadata={
                        "description": "Bilingual EN/VI intent classifier, prompt-injection defense & grounded answer synthesis.",
                        "model_version": "grounded-copilot-v2",
                        "record_count": len(asst_msgs),
                    },
                    updated_at=(asst_msgs[0].get("created_at") if asst_msgs else now),
                ),
                dec_pipe_id,
            )
            ai_nodes["llm"] = nid
            for k in ("rag", "text2sql"):
                if k in ai_nodes:
                    link(
                        pid=dec_pipe_id,
                        run_id=dec_run_id,
                        src=ai_nodes[k],
                        tgt=nid,
                        rel="GROUNDS",
                        status="completed",
                        transformation="Verified facts & citations synthesis",
                    )

        # ---- Column 4: Business Intelligence Domains ----
        bi_nodes: dict[str, str] = {}
        if active_info:
            caps = active_info.get("capabilities") or FULL_CAPABILITIES
            bi_nodes["revenue"] = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="bi:revenue_analysis",
                    external_id=active_info["dataset_id"],
                    pipeline_id=dec_pipe_id,
                    dataset_id=active_info["dataset_id"],
                    name="Revenue & Profit Analysis",
                    node_type="business_intelligence",
                    sub_type="revenue_analysis",
                    status="completed",
                    owner="system",
                    metadata={"description": "Period KPIs, revenue/margin trends, SKU, region & channel breakdown.", "dataset_id": active_info["dataset_id"]},
                    updated_at=now,
                ),
                dec_pipe_id,
            )
            if rel_db_nid:
                link(pid=dec_pipe_id, run_id=dec_run_id, src=rel_db_nid, tgt=bi_nodes["revenue"], rel="POWERS", status="completed", record_count=total_db_records, transformation="SQL KPI aggregation")
            if mm_store_nid:
                link(pid=dec_pipe_id, run_id=dec_run_id, src=mm_store_nid, tgt=bi_nodes["revenue"], rel="ENRICHES", status="completed", record_count=len(mm_insights), transformation="Multimodal insight overlay")

            if "lightgbm" in ai_nodes:
                fc_st = "completed" if active_artifact else "pending"
                bi_nodes["forecast"] = track_node(
                    _upsert_node(
                        conn,
                        company_id=company_id,
                        node_key="bi:sales_forecast",
                        external_id=active_info["dataset_id"],
                        pipeline_id=dec_pipe_id,
                        dataset_id=active_info["dataset_id"],
                        name="Sales Forecast",
                        node_type="business_intelligence",
                        sub_type="sales_forecast",
                        status=fc_st,
                        owner="system",
                        metadata={"description": "7-30 day demand & revenue prediction intervals.", "model_version": (active_artifact or {}).get("version")},
                        updated_at=now,
                    ),
                    dec_pipe_id,
                )
                link(pid=dec_pipe_id, run_id=dec_run_id, src=ai_nodes["lightgbm"], tgt=bi_nodes["forecast"], rel="FORECASTS", status=fc_st, transformation="Conformal horizon projection")

            if caps.get("has_marketing"):
                bi_nodes["marketing"] = track_node(
                    _upsert_node(
                        conn,
                        company_id=company_id,
                        node_key="bi:marketing_performance",
                        external_id=active_info["dataset_id"],
                        pipeline_id=dec_pipe_id,
                        dataset_id=active_info["dataset_id"],
                        name="Marketing Performance & ROAS",
                        node_type="business_intelligence",
                        sub_type="marketing_performance",
                        status="completed",
                        owner="system",
                        metadata={"description": "Channel spend allocation, ROAS, CAC & conversion attribution."},
                        updated_at=now,
                    ),
                    dec_pipe_id,
                )
                if rel_db_nid:
                    link(pid=dec_pipe_id, run_id=dec_run_id, src=rel_db_nid, tgt=bi_nodes["marketing"], rel="POWERS", status="completed", transformation="Channel ROAS aggregation")

            if caps.get("has_inventory"):
                bi_nodes["inventory"] = track_node(
                    _upsert_node(
                        conn,
                        company_id=company_id,
                        node_key="bi:inventory_optimization",
                        external_id=active_info["dataset_id"],
                        pipeline_id=dec_pipe_id,
                        dataset_id=active_info["dataset_id"],
                        name="Inventory Optimization",
                        node_type="business_intelligence",
                        sub_type="inventory_optimization",
                        status="completed",
                        owner="system",
                        metadata={"description": "Stock availability, reorder point & SKU-day stockout risk monitor."},
                        updated_at=now,
                    ),
                    dec_pipe_id,
                )
                if rel_db_nid:
                    link(pid=dec_pipe_id, run_id=dec_run_id, src=rel_db_nid, tgt=bi_nodes["inventory"], rel="POWERS", status="completed", transformation="Daily inventory balance analysis")

            if "anomaly" in ai_nodes:
                bi_nodes["risk"] = track_node(
                    _upsert_node(
                        conn,
                        company_id=company_id,
                        node_key="bi:business_risk",
                        external_id=active_info["dataset_id"],
                        pipeline_id=dec_pipe_id,
                        dataset_id=active_info["dataset_id"],
                        name="Business Risk & Anomalies",
                        node_type="business_intelligence",
                        sub_type="business_risk_analysis",
                        status="completed",
                        owner="system",
                        metadata={"description": "Severity-ranked anomalies & statistical driver attribution."},
                        updated_at=now,
                    ),
                    dec_pipe_id,
                )
                link(pid=dec_pipe_id, run_id=dec_run_id, src=ai_nodes["anomaly"], tgt=bi_nodes["risk"], rel="DETECTS_RISK", status="completed", transformation="Root-cause & anomaly flagging")

            if "simulator" in ai_nodes:
                bi_nodes["scenario"] = track_node(
                    _upsert_node(
                        conn,
                        company_id=company_id,
                        node_key="bi:scenario_simulation",
                        external_id=active_info["dataset_id"],
                        pipeline_id=dec_pipe_id,
                        dataset_id=active_info["dataset_id"],
                        name="Scenario Simulation",
                        node_type="business_intelligence",
                        sub_type="scenario_simulation",
                        status="completed",
                        owner="system",
                        metadata={"description": "Interactive price, marketing budget & inventory policy comparison."},
                        updated_at=now,
                    ),
                    dec_pipe_id,
                )
                link(pid=dec_pipe_id, run_id=dec_run_id, src=ai_nodes["simulator"], tgt=bi_nodes["scenario"], rel="SIMULATES", status="completed", transformation="Evaluate objective scenarios")

        if mm_store_nid and "revenue" not in bi_nodes:
            bi_nodes["revenue"] = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="bi:multimodal_intel",
                    external_id=mm_insights[0]["id"],
                    pipeline_id=dec_pipe_id,
                    dataset_id=mm_insights[0]["dataset_id"],
                    name="Multimodal Business Intelligence",
                    node_type="business_intelligence",
                    sub_type="revenue_analysis",
                    status="completed",
                    owner="system",
                    metadata={"description": "Approved multimodal document, invoice & media signals.", "record_count": len(mm_insights)},
                    updated_at=mm_insights[0].get("approved_at") or now,
                ),
                dec_pipe_id,
            )
            link(pid=dec_pipe_id, run_id=dec_run_id, src=mm_store_nid, tgt=bi_nodes["revenue"], rel="POWERS", status="completed", record_count=len(mm_insights), transformation="Aggregate multimodal insights")

        # ---- Column 5: Final Outputs & Business Insights ----
        insight_count = 0
        if active_info or mm_insights:
            dash_out = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="output:executive_dashboard",
                    external_id=(active_info or {}).get("dataset_id"),
                    pipeline_id=dec_pipe_id,
                    dataset_id=(active_info or {}).get("dataset_id"),
                    name="Executive Dashboard Metrics",
                    node_type="final_output",
                    sub_type="dashboard_metrics",
                    status="completed",
                    owner="system",
                    metadata={"description": "Live Executive Dashboard KPIs, Pie/Donut allocations & trend insights.", "output_reference": "/"},
                    updated_at=now,
                ),
                dec_pipe_id,
            )
            _upsert_insight(
                conn,
                company_id=company_id,
                insight_key="dashboard_summary",
                dataset_id=(active_info or {}).get("dataset_id"),
                pipeline_run_id=dec_run_id,
                source_node_id=dash_out,
                insight_type="dashboard_metrics",
                name="Executive Dashboard Metrics",
                description="Aggregated revenue, profit, marketing ROAS & inventory metrics.",
                output_reference="/",
                owner="system",
                metadata={"route": "/"},
            )
            insight_count += 1
            for k in ("revenue", "marketing", "inventory"):
                if k in bi_nodes:
                    link(pid=dec_pipe_id, run_id=dec_run_id, src=bi_nodes[k], tgt=dash_out, rel="PUBLISHES_TO", status="completed", transformation="Render executive dashboard telemetry")

        if "forecast" in bi_nodes and active_info:
            end_str = active_info.get("end") or ""
            fc_out_status = "completed" if active_artifact else "pending"
            fc_out = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="output:revenue_forecast_insight",
                    external_id=f"fc:{active_info['dataset_id']}",
                    pipeline_id=dec_pipe_id,
                    dataset_id=active_info["dataset_id"],
                    name=f"Revenue Forecast ({end_str[:7] or active_info['dataset_id'][:8]})",
                    node_type="final_output",
                    sub_type="business_insight",
                    status=fc_out_status,
                    owner="system",
                    metadata={
                        "description": "Traceable revenue & unit demand forecast output grounded in observed series & LightGBM holdout validation.",
                        "output_reference": "/forecast",
                        "model_version": (active_artifact or {}).get("version"),
                    },
                    updated_at=now,
                ),
                dec_pipe_id,
            )
            _upsert_insight(
                conn,
                company_id=company_id,
                insight_key=f"forecast:{active_info['dataset_id']}",
                dataset_id=active_info["dataset_id"],
                pipeline_run_id=dec_run_id,
                source_node_id=fc_out,
                insight_type="sales_forecast",
                name=f"Revenue Forecast ({end_str[:7] or active_info['dataset_id'][:8]})",
                description="Grounded revenue forecast series and confidence bounds.",
                output_reference="/forecast",
                owner="system",
                metadata={"route": "/forecast"},
            )
            insight_count += 1
            link(pid=dec_pipe_id, run_id=dec_run_id, src=bi_nodes["forecast"], tgt=fc_out, rel="PRODUCES_INSIGHT", status=fc_out_status, transformation="Generate demand & revenue forecast insight")

        if active_info:
            rec_out = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="output:recommendations_decisions",
                    external_id=f"rec:{active_info['dataset_id']}",
                    pipeline_id=dec_pipe_id,
                    dataset_id=active_info["dataset_id"],
                    name=("Audited Decisions & Recommendations" if decision_audits else "Actionable Recommendations"),
                    node_type="final_output",
                    sub_type="decision_support" if decision_audits else "recommendations",
                    status="completed",
                    owner=(decision_audits[-1]["payload"].get("actor") if decision_audits else "system"),
                    metadata={
                        "description": "Prioritized operational recommendations and human-approved decision audit trail.",
                        "record_count": len(decision_audits),
                        "output_reference": "/recommendations",
                    },
                    updated_at=(decision_audits[-1].get("occurred_at") if decision_audits else now),
                ),
                dec_pipe_id,
            )
            _upsert_insight(
                conn,
                company_id=company_id,
                insight_key="recommendations_audit",
                dataset_id=active_info["dataset_id"],
                pipeline_run_id=dec_run_id,
                source_node_id=rec_out,
                insight_type="decision_support",
                name="Recommendations & Audited Decisions",
                description="Prioritized recommendations with immutable human decision approval records.",
                output_reference="/recommendations",
                owner="system",
                metadata={"audit_count": len(decision_audits)},
            )
            insight_count += 1
            if "recommendation" in ai_nodes:
                link(pid=dec_pipe_id, run_id=dec_run_id, src=ai_nodes["recommendation"], tgt=rec_out, rel="RECOMMENDS", status="completed", transformation="Prescriptive action prioritization")
            for k in ("risk", "scenario"):
                if k in bi_nodes:
                    link(pid=dec_pipe_id, run_id=dec_run_id, src=bi_nodes[k], tgt=rec_out, rel="INFORMS_DECISION", status="completed", transformation="Feed anomaly/scenario evaluation into human decision approval")

        if "llm" in ai_nodes and (rag_docs or asst_msgs):
            cop_out = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key="output:copilot_reports",
                    external_id=asst_msgs[0]["id"] if asst_msgs else "copilot",
                    pipeline_id=dec_pipe_id,
                    dataset_id=(active_info or {}).get("dataset_id"),
                    name="AI Copilot Grounded Reports",
                    node_type="final_output",
                    sub_type="ai_report",
                    status="completed" if asst_msgs else "normal",
                    owner="system",
                    metadata={
                        "description": "Citation-grounded natural language BI & document analysis reports generated in AI Copilot.",
                        "record_count": len(asst_msgs),
                        "output_reference": "/ask",
                    },
                    updated_at=(asst_msgs[0].get("created_at") if asst_msgs else now),
                ),
                dec_pipe_id,
            )
            _upsert_insight(
                conn,
                company_id=company_id,
                insight_key="copilot_reports",
                dataset_id=(active_info or {}).get("dataset_id"),
                pipeline_run_id=dec_run_id,
                source_node_id=cop_out,
                insight_type="ai_report",
                name="AI Copilot Grounded Reports",
                description="Citation-backed SQL and RAG synthesis.",
                output_reference="/ask",
                owner="system",
                metadata={"message_count": len(asst_msgs)},
            )
            insight_count += 1
            link(pid=dec_pipe_id, run_id=dec_run_id, src=ai_nodes["llm"], tgt=cop_out, rel="GENERATES_REPORT", status="completed", record_count=len(asst_msgs), transformation="Cited bilingual answer synthesis")

        # Individual Human-Approved Multimodal Business Insights (up to 6 most recent)
        for ins in mm_insights[:6]:
            ins_pipe_key = _det_id("pipe", company_id, f"multimodal:{ins['source_file_id']}")
            ins_nid = track_node(
                _upsert_node(
                    conn,
                    company_id=company_id,
                    node_key=f"output:mm_ins:{ins['id']}",
                    external_id=ins["id"],
                    pipeline_id=ins_pipe_key,
                    dataset_id=ins["dataset_id"],
                    name=ins["title"],
                    node_type="final_output",
                    sub_type="business_insight",
                    status="completed",
                    owner=ins.get("approved_by") or "system",
                    metadata={
                        "description": ins.get("summary_text") or "",
                        "modality": ins["modality"],
                        "entity_type": ins["entity_type"],
                        "metrics": ins.get("metrics_json") or {},
                        "confidence_score": ins.get("confidence_score"),
                        "output_reference": f"/data-sources?file={ins['source_file_id']}",
                    },
                    created_at=ins.get("approved_at"),
                    updated_at=ins.get("approved_at"),
                ),
                ins_pipe_key,
            )
            _upsert_insight(
                conn,
                company_id=company_id,
                insight_key=f"mm:{ins['id']}",
                dataset_id=ins["dataset_id"],
                pipeline_run_id=dec_run_id,
                source_node_id=ins_nid,
                insight_type="multimodal_insight",
                name=ins["title"],
                description=ins.get("summary_text"),
                output_reference=f"/data-sources?file={ins['source_file_id']}",
                owner=ins.get("approved_by") or "system",
                metadata={"source_file_id": ins["source_file_id"], "modality": ins["modality"]},
                created_at=ins.get("approved_at"),
            )
            insight_count += 1
            if "revenue" in bi_nodes:
                link(
                    pid=ins_pipe_key,
                    run_id=dec_run_id,
                    src=bi_nodes["revenue"],
                    tgt=ins_nid,
                    rel="PRODUCES_INSIGHT",
                    status="completed",
                    transformation=f"Verified multimodal {ins['modality']} promotion ({ins['extraction_method']})",
                    ts=ins.get("approved_at"),
                )

        # Persist complete pipeline_ids list into each node's metadata_json so UI & filter never miss multi-pipeline hubs
        if active_node_ids:
            for row in conn.execute(
                sa.select(lineage_nodes).where(
                    lineage_nodes.c.company_id == company_id,
                    lineage_nodes.c.id.in_(active_node_ids),
                )
            ).mappings():
                meta = dict(row.get("metadata_json") or {})
                pids = sorted(node_pipelines.get(row["id"], set()))
                if row.get("pipeline_id") and row["pipeline_id"] not in pids:
                    pids = sorted({*pids, row["pipeline_id"]})
                if meta.get("pipeline_ids") != pids:
                    meta["pipeline_ids"] = pids
                    conn.execute(
                        lineage_nodes.update()
                        .where(lineage_nodes.c.id == row["id"])
                        .values(metadata_json=meta)
                    )

        # Clean up stale nodes/edges/pipelines/insights from deleted datasets/files/rag_docs so graph stays strictly real
        if active_edge_ids:
            conn.execute(
                lineage_edges.delete().where(
                    lineage_edges.c.company_id == company_id,
                    ~lineage_edges.c.id.in_(active_edge_ids),
                )
            )
        else:
            conn.execute(lineage_edges.delete().where(lineage_edges.c.company_id == company_id))

        if active_node_ids:
            conn.execute(
                business_insights.delete().where(
                    business_insights.c.company_id == company_id,
                    business_insights.c.source_node_id.is_not(None),
                    ~business_insights.c.source_node_id.in_(active_node_ids),
                )
            )
            conn.execute(
                lineage_nodes.delete().where(
                    lineage_nodes.c.company_id == company_id,
                    ~lineage_nodes.c.id.in_(active_node_ids),
                )
            )
        else:
            conn.execute(business_insights.delete().where(business_insights.c.company_id == company_id))
            conn.execute(lineage_nodes.delete().where(lineage_nodes.c.company_id == company_id))

        if active_pipe_ids:
            conn.execute(
                pipeline_events.delete().where(
                    pipeline_events.c.company_id == company_id,
                    ~pipeline_events.c.pipeline_id.in_(active_pipe_ids),
                )
            )
            conn.execute(
                pipeline_runs.delete().where(
                    pipeline_runs.c.company_id == company_id,
                    ~pipeline_runs.c.pipeline_id.in_(active_pipe_ids),
                )
            )
            conn.execute(
                pipelines.delete().where(
                    pipelines.c.company_id == company_id,
                    ~pipelines.c.id.in_(active_pipe_ids),
                )
            )
        else:
            conn.execute(pipeline_events.delete().where(pipeline_events.c.company_id == company_id))
            conn.execute(pipeline_runs.delete().where(pipeline_runs.c.company_id == company_id))
            conn.execute(pipelines.delete().where(pipelines.c.company_id == company_id))

        # Recompute header KPI summary
        nodes_all = [
            dict(r)
            for r in conn.execute(sa.select(lineage_nodes).where(lineage_nodes.c.company_id == company_id)).mappings()
        ]
        pipes_all = [
            dict(r)
            for r in conn.execute(sa.select(pipelines).where(pipelines.c.company_id == company_id)).mappings()
        ]
        q_scores = [float(qr["overall_score"]) for qr in qr_by_ds.values()]
        if not q_scores and any(d.get("storage_mode") == "legacy_snapshot" for d in ds_rows):
            q_scores = [100.0]
        avg_quality = round(sum(q_scores) / len(q_scores), 1) if q_scores else None
        last_sync = max((_as_utc(n.get("updated_at")) for n in nodes_all if n.get("updated_at")), default=now)

        summary = {
            "total_data_sources": sum(1 for n in nodes_all if n["node_type"] == "data_source"),
            "processing_pipelines": len(pipes_all),
            "ai_models": sum(1 for n in nodes_all if n["node_type"] == "ai_model"),
            "business_insights": sum(1 for n in nodes_all if n["node_type"] in {"business_intelligence", "final_output"}),
            "data_quality_score": avg_quality,
            "last_synchronized": _iso(last_sync),
        }
        return {"company_id": company_id, "synced_at": now.isoformat(), "summary": summary}


# ---------------------------------------------------------------------------
# Graph Query, Filter, Inspection, BFS Lineage & Impact Analysis APIs
# ---------------------------------------------------------------------------


def _bfs_closure(
    edges: list[dict[str, Any]],
    start_ids: set[str],
    direction: str,
) -> tuple[list[str], list[str], dict[str, int]]:
    adj: dict[str, list[dict[str, Any]]] = {}
    for e in edges:
        key = e["target_node_id"] if direction == "upstream" else e["source_node_id"]
        adj.setdefault(key, []).append(e)

    visited_nodes: dict[str, int] = {nid: 0 for nid in start_ids}
    ordered_nodes: list[str] = list(start_ids)
    visited_edges: list[str] = []
    seen_edge_set: set[str] = set()
    queue: deque[str] = deque(start_ids)

    while queue:
        cur = queue.popleft()
        cur_depth = visited_nodes[cur]
        for edge in adj.get(cur, []):
            nxt = edge["source_node_id"] if direction == "upstream" else edge["target_node_id"]
            if edge["id"] not in seen_edge_set:
                seen_edge_set.add(edge["id"])
                visited_edges.append(edge["id"])
            if nxt not in visited_nodes:
                visited_nodes[nxt] = cur_depth + 1
                ordered_nodes.append(nxt)
                queue.append(nxt)

    return ordered_nodes, visited_edges, visited_nodes


def get_lineage_graph(
    engine: sa.Engine,
    *,
    company_id: str,
    node_type: str | None = None,
    status: str | None = None,
    pipeline_id: str | None = None,
    source_id: str | None = None,
    model: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    owner: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    sync_res = ensure_company_lineage_synced(engine, company_id)

    with engine.connect() as conn:
        all_nodes = [
            _serialize_node(dict(r))
            for r in conn.execute(
                sa.select(lineage_nodes)
                .where(lineage_nodes.c.company_id == company_id)
                .order_by(lineage_nodes.c.layer_order.asc(), lineage_nodes.c.created_at.asc())
            ).mappings()
        ]
        all_edges = [
            _serialize_edge(dict(r))
            for r in conn.execute(
                sa.select(lineage_edges)
                .where(lineage_edges.c.company_id == company_id)
                .order_by(lineage_edges.c.created_at.asc())
            ).mappings()
        ]
        all_pipes = [
            _serialize_pipeline(dict(r))
            for r in conn.execute(
                sa.select(pipelines)
                .where(pipelines.c.company_id == company_id)
                .order_by(pipelines.c.updated_at.desc())
            ).mappings()
        ]
        recent_events = [
            _serialize_event(dict(r))
            for r in conn.execute(
                sa.select(pipeline_events)
                .where(pipeline_events.c.company_id == company_id)
                .order_by(pipeline_events.c.timestamp.desc(), pipeline_events.c.step_order.desc())
                .limit(60)
            ).mappings()
        ]

    # Build facets from FULL graph before filtering
    facets = {
        "node_types": sorted({n["node_type"] for n in all_nodes}),
        "statuses": sorted({n["status"] for n in all_nodes}),
        "owners": sorted({n["owner"] for n in all_nodes if n.get("owner")}),
        "sources": [
            {"id": n["id"], "name": n["name"], "sub_type": n["sub_type"]}
            for n in all_nodes if n["node_type"] == "data_source"
        ],
        "models": [
            {"id": n["id"], "name": n["name"], "sub_type": n["sub_type"]}
            for n in all_nodes if n["node_type"] == "ai_model"
        ],
    }

    # Start with all node IDs and narrow cleanly
    candidate_ids = {n["id"] for n in all_nodes}
    matched_ids: list[str] = []

    if pipeline_id:
        p_nodes = {
            n["id"]
            for n in all_nodes
            if n.get("pipeline_id") == pipeline_id
            or pipeline_id in (n["metadata"].get("pipeline_ids") or [])
        }
        for e in all_edges:
            if e.get("pipeline_id") == pipeline_id:
                p_nodes.add(e["source_node_id"])
                p_nodes.add(e["target_node_id"])
        candidate_ids &= p_nodes

    if source_id:
        down_nodes, _, _ = _bfs_closure(all_edges, {source_id}, "downstream")
        candidate_ids &= set(down_nodes)

    if model:
        model_seeds = {
            n["id"]
            for n in all_nodes
            if n["id"] == model or model.lower() in n["name"].lower() or model.lower() == n["sub_type"].lower()
        }
        if model_seeds:
            up_n, _, _ = _bfs_closure(all_edges, model_seeds, "upstream")
            dn_n, _, _ = _bfs_closure(all_edges, model_seeds, "downstream")
            candidate_ids &= (set(up_n) | set(dn_n))
        else:
            candidate_ids = set()

    if node_type:
        candidate_ids &= {n["id"] for n in all_nodes if n["node_type"] == node_type}

    if status:
        candidate_ids &= {n["id"] for n in all_nodes if n["status"] == status}

    if owner:
        candidate_ids &= {n["id"] for n in all_nodes if (n.get("owner") or "").lower() == owner.lower()}

    if date_from or date_to:
        dt_from = datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc) if date_from else None
        dt_to = datetime.combine(date_to, datetime.max.time(), tzinfo=timezone.utc) if date_to else None
        date_keep: set[str] = set()
        for n in all_nodes:
            ts = _as_utc(n.get("updated_at")) or _as_utc(n.get("created_at"))
            if ts is None:
                continue
            if dt_from and ts < dt_from:
                continue
            if dt_to and ts > dt_to:
                continue
            date_keep.add(n["id"])
        candidate_ids &= date_keep

    q_term = (search or "").strip().lower()
    if q_term:
        search_keep: set[str] = set()
        for n in all_nodes:
            if n["id"] not in candidate_ids:
                continue
            haystack = " ".join([
                n["id"],
                str(n.get("external_id") or ""),
                n["name"],
                n["node_type"],
                n["sub_type"],
                str(n["metadata"].get("file_name") or ""),
                str(n["metadata"].get("model_version") or ""),
                " ".join(n["metadata"].get("pipeline_ids") or []),
            ]).lower()
            if q_term in haystack:
                search_keep.add(n["id"])
        matched_ids = sorted(search_keep)
        # When searching, keep matched nodes so search results isolate clearly or highlight
        if not any([node_type, status, pipeline_id, source_id, model, date_from, date_to, owner]):
            # Preserve surrounding connected context while highlighting matched_ids when pure text search is used!
            pass
        else:
            candidate_ids = search_keep
    else:
        matched_ids = sorted(candidate_ids)

    filtered_nodes = [n for n in all_nodes if n["id"] in candidate_ids]
    filtered_edges = [
        e
        for e in all_edges
        if e["source_node_id"] in candidate_ids
        and e["target_node_id"] in candidate_ids
        and (not pipeline_id or e.get("pipeline_id") == pipeline_id or e.get("pipeline_id") is None)
    ]

    return {
        "company_id": company_id,
        "synced_at": sync_res["synced_at"],
        "summary": sync_res["summary"],
        "nodes": filtered_nodes,
        "edges": filtered_edges,
        "matched_node_ids": matched_ids,
        "pipelines": all_pipes,
        "recent_events": recent_events,
        "facets": facets,
        "has_active_processing": any(p["status"] == "processing" for p in all_pipes) or any(n["status"] == "processing" for n in all_nodes),
    }


def _require_owned_node(conn: sa.Connection, company_id: str, node_id: str) -> dict[str, Any]:
    row = conn.execute(sa.select(lineage_nodes).where(lineage_nodes.c.id == node_id)).mappings().first()
    if row is None:
        raise HTTPException(404, f"Lineage node '{node_id}' not found.")
    if row["company_id"] != company_id:
        raise HTTPException(403, "Cross-tenant lineage access denied.")
    return _serialize_node(dict(row))


def traverse_lineage(
    engine: sa.Engine,
    *,
    company_id: str,
    node_id: str,
    direction: str,
) -> dict[str, Any]:
    ensure_company_lineage_synced(engine, company_id)
    with engine.connect() as conn:
        root = _require_owned_node(conn, company_id, node_id)
        all_nodes = {
            r["id"]: _serialize_node(dict(r))
            for r in conn.execute(sa.select(lineage_nodes).where(lineage_nodes.c.company_id == company_id)).mappings()
        }
        all_edges = [
            _serialize_edge(dict(r))
            for r in conn.execute(sa.select(lineage_edges).where(lineage_edges.c.company_id == company_id)).mappings()
        ]

    ordered_ids, edge_ids, depths = _bfs_closure(all_edges, {node_id}, direction)
    # Sort path sensibly left-to-right (layer_order asc, depth relative to direction)
    nodes_out = sorted(
        [all_nodes[nid] for nid in ordered_ids if nid in all_nodes],
        key=lambda n: (n["layer_order"], depths.get(n["id"], 0), n["name"]),
    )
    edge_map = {e["id"]: e for e in all_edges}
    edges_out = [edge_map[eid] for eid in edge_ids if eid in edge_map]

    return {
        "company_id": company_id,
        "root_node_id": node_id,
        "root_node": root,
        "direction": direction,
        "node_ids": [n["id"] for n in nodes_out],
        "edge_ids": [e["id"] for e in edges_out],
        "depths": depths,
        "nodes": nodes_out,
        "edges": edges_out,
    }


def _build_impact_result(
    *,
    company_id: str,
    node_id: str,
    root: dict[str, Any],
    all_nodes: dict[str, dict[str, Any]],
    all_edges: list[dict[str, Any]],
    all_pipes: dict[str, dict[str, Any]],
    stored_insights_count: int,
) -> dict[str, Any]:
    up_ids, _, _ = _bfs_closure(all_edges, {node_id}, "upstream")
    dn_ids, _, dn_depths = _bfs_closure(all_edges, {node_id}, "downstream")

    upstream_sources = [
        all_nodes[nid] for nid in up_ids
        if nid != node_id and nid in all_nodes and all_nodes[nid]["node_type"] == "data_source"
    ]
    dependent_nodes = sorted(
        [all_nodes[nid] for nid in dn_ids if nid != node_id and nid in all_nodes],
        key=lambda n: (dn_depths.get(n["id"], 99), n["layer_order"]),
    )

    affected_insight_node_ids = {n["id"] for n in dependent_nodes if n["node_type"] in {"business_intelligence", "final_output"}}
    if root["node_type"] in {"business_intelligence", "final_output"}:
        affected_insight_node_ids.add(root["id"])

    affected_reports = [
        {
            "id": n["id"],
            "name": n["name"],
            "sub_type": n["sub_type"],
            "status": n["status"],
            "output_reference": n["metadata"].get("output_reference") or "/",
        }
        for n in [all_nodes[nid] for nid in affected_insight_node_ids if nid in all_nodes]
    ]

    affected_pipe_ids = set()
    for n in [root, *dependent_nodes]:
        if n.get("pipeline_id"):
            affected_pipe_ids.add(n["pipeline_id"])
        for pid in (n["metadata"].get("pipeline_ids") or []):
            affected_pipe_ids.add(pid)
    affected_pipelines = [all_pipes[pid] for pid in affected_pipe_ids if pid in all_pipes]

    # Build grounded reprocessing recommendations (never falsely claim existing outputs are invalid!)
    recs: list[str] = []
    if root["status"] == "failed":
        recs.append("Resolve the upstream error or schema failure on this node first, then retry the failed pipeline stage.")
    if root["status"] == "warning":
        recs.append("Review flagged rows or pending Human-in-the-Loop approvals so warnings do not propagate unreviewed.")
    if root["node_type"] in {"data_source", "processing", "storage"}:
        if any(n["sub_type"] == "lightgbm" for n in dependent_nodes):
            recs.append("Re-run Data Validation and retrain the LightGBM / Anomaly model bundle so forecasts reflect updated distributions.")
        if any(n["sub_type"] in {"vector_db", "rag_retrieval_engine"} for n in dependent_nodes):
            recs.append("Trigger Knowledge Base re-indexing to refresh dense embeddings and BM25 terms for Copilot citations.")
        if affected_reports:
            recs.append(f"Review {len(affected_reports)} downstream BI view(s) & report(s) after reprocessing completes.")
    elif root["node_type"] == "ai_model":
        recs.append("Verify holdout metrics and re-evaluate downstream BI insights if model weights or thresholds changed.")
    else:
        recs.append("Inspect upstream source timestamps and quality scores before recording executive decisions.")

    return {
        "company_id": company_id,
        "node_id": node_id,
        "node": root,
        "upstream_sources": upstream_sources,
        "dependent_nodes": dependent_nodes,
        "affected_reports": affected_reports,
        "affected_pipelines": affected_pipelines,
        "stored_business_insights_count": stored_insights_count,
        "reprocessing_recommendations": recs,
        "honesty_note": (
            "If an upstream data source changes or reports a warning, downstream pipelines and insights are candidates "
            "for review or re-execution — existing metrics are not automatically marked invalid without verification."
        ),
    }


def analyze_impact(engine: sa.Engine, *, company_id: str, node_id: str) -> dict[str, Any]:
    ensure_company_lineage_synced(engine, company_id)
    with engine.connect() as conn:
        root = _require_owned_node(conn, company_id, node_id)
        all_nodes = {
            r["id"]: _serialize_node(dict(r))
            for r in conn.execute(sa.select(lineage_nodes).where(lineage_nodes.c.company_id == company_id)).mappings()
        }
        all_edges = [
            _serialize_edge(dict(r))
            for r in conn.execute(sa.select(lineage_edges).where(lineage_edges.c.company_id == company_id)).mappings()
        ]
        all_pipes = {
            r["id"]: _serialize_pipeline(dict(r))
            for r in conn.execute(sa.select(pipelines).where(pipelines.c.company_id == company_id)).mappings()
        }
        stored_insights_count = int(
            conn.scalar(
                sa.select(sa.func.count())
                .select_from(business_insights)
                .where(business_insights.c.company_id == company_id)
            )
            or 0
        )

    return _build_impact_result(
        company_id=company_id,
        node_id=node_id,
        root=root,
        all_nodes=all_nodes,
        all_edges=all_edges,
        all_pipes=all_pipes,
        stored_insights_count=stored_insights_count,
    )


def get_node_detail(engine: sa.Engine, *, company_id: str, node_id: str) -> dict[str, Any]:
    ensure_company_lineage_synced(engine, company_id)
    with engine.connect() as conn:
        node = _require_owned_node(conn, company_id, node_id)
        all_nodes = {
            r["id"]: _serialize_node(dict(r))
            for r in conn.execute(sa.select(lineage_nodes).where(lineage_nodes.c.company_id == company_id)).mappings()
        }
        all_edges = [
            _serialize_edge(dict(r))
            for r in conn.execute(sa.select(lineage_edges).where(lineage_edges.c.company_id == company_id)).mappings()
        ]
        all_pipes = {
            r["id"]: _serialize_pipeline(dict(r))
            for r in conn.execute(sa.select(pipelines).where(pipelines.c.company_id == company_id)).mappings()
        }
        stored_insights_count = int(
            conn.scalar(
                sa.select(sa.func.count())
                .select_from(business_insights)
                .where(business_insights.c.company_id == company_id)
            )
            or 0
        )
        node_events = [
            _serialize_event(dict(r))
            for r in conn.execute(
                sa.select(pipeline_events)
                .where(pipeline_events.c.company_id == company_id, pipeline_events.c.node_id == node_id)
                .order_by(pipeline_events.c.timestamp.desc())
                .limit(20)
            ).mappings()
        ]
        run_row = None
        run_id_ref = node["metadata"].get("run_id")
        if run_id_ref:
            r = conn.execute(
                sa.select(pipeline_runs).where(pipeline_runs.c.id == run_id_ref, pipeline_runs.c.company_id == company_id)
            ).mappings().first()
            if r:
                run_row = _serialize_run(dict(r))
        elif node.get("pipeline_id"):
            r = conn.execute(
                sa.select(pipeline_runs)
                .where(pipeline_runs.c.company_id == company_id, pipeline_runs.c.pipeline_id == node["pipeline_id"])
                .order_by(pipeline_runs.c.started_at.desc())
                .limit(1)
            ).mappings().first()
            if r:
                run_row = _serialize_run(dict(r))

    direct_up = [all_nodes[e["source_node_id"]] for e in all_edges if e["target_node_id"] == node_id and e["source_node_id"] in all_nodes]
    direct_dn = [all_nodes[e["target_node_id"]] for e in all_edges if e["source_node_id"] == node_id and e["target_node_id"] in all_nodes]
    related_pipe_ids = sorted({*(node["metadata"].get("pipeline_ids") or []), *([node["pipeline_id"]] if node.get("pipeline_id") else [])})
    related_pipelines = [all_pipes[pid] for pid in related_pipe_ids if pid in all_pipes]

    impact = _build_impact_result(
        company_id=company_id,
        node_id=node_id,
        root=node,
        all_nodes=all_nodes,
        all_edges=all_edges,
        all_pipes=all_pipes,
        stored_insights_count=stored_insights_count,
    )
    meta = node["metadata"]

    return {
        "node": node,
        "overview": {
            "id": node["id"],
            "external_id": node.get("external_id"),
            "name": node["name"],
            "node_type": node["node_type"],
            "sub_type": node["sub_type"],
            "status": node["status"],
            "description": meta.get("description") or "",
            "created_at": node.get("created_at"),
            "updated_at": node.get("updated_at"),
            "owner": node.get("owner") or "system",
        },
        "data_information": {
            "input_schema": meta.get("input_schema") or [],
            "output_schema": meta.get("output_schema") or [],
            "record_count": meta.get("record_count"),
            "data_size_bytes": meta.get("file_size_bytes") or meta.get("data_size_bytes"),
            "data_format": meta.get("data_format") or meta.get("file_type") or node["sub_type"],
            "quality_metrics": meta.get("quality_metrics") or (
                {"quality_score": meta["quality_score"]} if meta.get("quality_score") is not None else {}
            ),
        },
        "lineage": {
            "upstream_nodes": direct_up,
            "downstream_nodes": direct_dn,
            "related_pipelines": related_pipelines,
            "related_insights": impact["affected_reports"],
        },
        "execution": {
            "pipeline_run_id": run_row["id"] if run_row else (node_events[0]["pipeline_run_id"] if node_events else None),
            "execution_time": (run_row or {}).get("started_at") or meta.get("execution_time") or node.get("updated_at"),
            "duration_ms": (run_row or {}).get("duration_ms") or meta.get("duration_ms"),
            "model_version": meta.get("model_version") or (run_row or {}).get("model_version"),
            "error_details": meta.get("error_details") or (run_row or {}).get("error_message"),
            "logs": node_events,
        },
        "impact": impact,
    }


def list_pipelines_summary(engine: sa.Engine, *, company_id: str) -> dict[str, Any]:
    ensure_company_lineage_synced(engine, company_id)
    with engine.connect() as conn:
        pipe_rows = [
            _serialize_pipeline(dict(r))
            for r in conn.execute(
                sa.select(pipelines)
                .where(pipelines.c.company_id == company_id)
                .order_by(pipelines.c.updated_at.desc())
            ).mappings()
        ]
        runs_rows = [
            _serialize_run(dict(r))
            for r in conn.execute(
                sa.select(pipeline_runs)
                .where(pipeline_runs.c.company_id == company_id)
                .order_by(pipeline_runs.c.started_at.desc())
            ).mappings()
        ]
    runs_by_pipe: dict[str, list[dict[str, Any]]] = {}
    for r in runs_rows:
        runs_by_pipe.setdefault(r["pipeline_id"], []).append(r)

    for p in pipe_rows:
        p_runs = runs_by_pipe.get(p["id"], [])
        p["run_count"] = len(p_runs)
        p["latest_run"] = p_runs[0] if p_runs else None

    return {"company_id": company_id, "items": pipe_rows}


def list_pipeline_runs(engine: sa.Engine, *, company_id: str, pipeline_id: str) -> dict[str, Any]:
    ensure_company_lineage_synced(engine, company_id)
    with engine.connect() as conn:
        p_row = conn.execute(sa.select(pipelines).where(pipelines.c.id == pipeline_id)).mappings().first()
        if p_row is None:
            raise HTTPException(404, f"Pipeline '{pipeline_id}' not found.")
        if p_row["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant pipeline access denied.")
        runs_rows = [
            _serialize_run(dict(r))
            for r in conn.execute(
                sa.select(pipeline_runs)
                .where(pipeline_runs.c.company_id == company_id, pipeline_runs.c.pipeline_id == pipeline_id)
                .order_by(pipeline_runs.c.started_at.desc())
            ).mappings()
        ]
    return {"company_id": company_id, "pipeline": _serialize_pipeline(dict(p_row)), "items": runs_rows}


def get_run_events(engine: sa.Engine, *, company_id: str, run_id: str) -> dict[str, Any]:
    ensure_company_lineage_synced(engine, company_id)
    with engine.connect() as conn:
        r_row = conn.execute(sa.select(pipeline_runs).where(pipeline_runs.c.id == run_id)).mappings().first()
        if r_row is None:
            raise HTTPException(404, f"Pipeline run '{run_id}' not found.")
        if r_row["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant pipeline run access denied.")

        events = [
            _serialize_event(dict(e))
            for e in conn.execute(
                sa.select(pipeline_events)
                .where(pipeline_events.c.company_id == company_id, pipeline_events.c.pipeline_run_id == run_id)
                .order_by(pipeline_events.c.step_order.asc(), pipeline_events.c.timestamp.asc())
            ).mappings()
        ]
        all_edges = [
            _serialize_edge(dict(e))
            for e in conn.execute(sa.select(lineage_edges).where(lineage_edges.c.company_id == company_id)).mappings()
        ]

    # Attach exact incoming edge IDs reaching each event's node_id so UI playback highlights the directional path step-by-step
    edges_by_target: dict[str, list[str]] = {}
    for edge in all_edges:
        edges_by_target.setdefault(edge["target_node_id"], []).append(edge["id"])

    for ev in events:
        nid = ev.get("node_id")
        ev["incoming_edge_ids"] = edges_by_target.get(nid, []) if nid else []

    return {
        "company_id": company_id,
        "run": _serialize_run(dict(r_row)),
        "items": events,
    }
