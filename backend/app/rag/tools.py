"""Unified Business & RAG Tool Registry for DecisionPilot AI Copilot."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import time
from typing import Any

from fastapi import HTTPException
import sqlalchemy as sa

from ai_service import root_cause
from backend.app import services
from backend.app.analytics import dataset_info, options, previous_period
from backend.app.db import read_connection
from backend.app.rag.config import fold_text
from backend.app.rag.retrieval import RetrievalTrace, hybrid_search
from backend.app.rag.text_to_sql import execute_text_to_sql
from backend.app.schemas import Filters, ForecastRequest, InventoryParams, InventoryRequest, MarketingParams, MarketingRequest, PriceParams, PriceRequest


@dataclass
class ToolInvocationResult:
    tool_name: str
    ok: bool
    latency_ms: float
    summary: str
    data: dict[str, Any]
    chart: dict[str, Any] | None = None
    citations: list[dict[str, Any]] | None = None
    sql_trace: dict[str, Any] | None = None


def tool_hybrid_rag_search(
    engine: sa.Engine,
    *,
    query: str,
    company_id: str,
    role: str,
    dataset_id: str | None = None,
    domain: str | None = None,
    document_type: str | None = None,
    document_ids: list[str] | None = None,
    session_context: dict[str, Any] | None = None,
    top_k: int = 5,
) -> tuple[ToolInvocationResult, RetrievalTrace]:
    t0 = time.perf_counter()
    with read_connection(engine) as conn:
        hits, trace = hybrid_search(
            conn,
            query=query,
            company_id=company_id,
            role=role,
            dataset_id=dataset_id,
            domain=domain,
            document_type=document_type,
            document_ids=document_ids,
            session_context=session_context,
            top_k=top_k,
        )
    ms = round((time.perf_counter() - t0) * 1000, 2)
    return (
        ToolInvocationResult(
            tool_name="hybrid_rag_search",
            ok=True,
            latency_ms=ms,
            summary=f"Retrieved {len(hits)} verified knowledge chunks (dense={trace.dense_hits}, bm25={trace.bm25_hits}).",
            data={"hits": hits, "trace": trace.__dict__},
            citations=hits,
        ),
        trace,
    )


def tool_dashboard_kpi(
    engine: sa.Engine,
    *,
    company_id: str,
    dataset_id: str | None = None,
    filters: dict[str, Any] | None = None,
) -> ToolInvocationResult:
    t0 = time.perf_counter()
    try:
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=company_id, dataset_id=dataset_id)
            flt = Filters(**(filters or {}))
            dash = services.dashboard(conn, info, flt)
        return ToolInvocationResult(
            tool_name="dashboard_kpi",
            ok=True,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            summary=f"Computed verified KPIs for {info['title']} ({dash['range'][0]} to {dash['range'][1]}).",
            data={"info": info, "dashboard": dash},
            chart=(
                {"type": "line", "x": "date", "y": "revenue", "rows": dash["trend"][-30:]}
                if dash.get("trend")
                else None
            ),
        )
    except HTTPException as exc:
        return ToolInvocationResult(
            tool_name="dashboard_kpi",
            ok=False,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            summary=exc.detail,
            data={"error": exc.detail, "status_code": exc.status_code},
        )


def tool_safe_sql(
    engine: sa.Engine,
    *,
    question: str,
    company_id: str,
    dataset_id: str | None = None,
    session_context: dict[str, Any] | None = None,
    explicit_sql: str | None = None,
    actor: str = "workspace-user",
) -> ToolInvocationResult:
    t0 = time.perf_counter()
    try:
        res = execute_text_to_sql(
            engine,
            question=question,
            company_id=company_id,
            dataset_id=dataset_id,
            session_context=session_context,
            explicit_sql=explicit_sql,
            actor=actor,
        )
    except HTTPException as exc:
        return ToolInvocationResult(
            tool_name="safe_text_to_sql",
            ok=False,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            summary=exc.detail,
            data={"error": exc.detail, "executed": False},
        )
    ok = bool(res.get("executed") and not res.get("blocked"))
    summary = (
        f"Executed read-only SQL ({res.get('template')}) returning {res.get('row_count', 0)} row(s)."
        if ok
        else f"SQL step skipped or blocked: {res.get('reason', 'not matched')}."
    )
    return ToolInvocationResult(
        tool_name="safe_text_to_sql",
        ok=ok,
        latency_ms=round((time.perf_counter() - t0) * 1000, 2),
        summary=summary,
        data=res,
        chart=res.get("chart"),
        sql_trace={
            "executed": ok,
            "sql": res.get("sql"),
            "template": res.get("template"),
            "scoped_tables": res.get("scoped_tables") or [],
            "read_only_verified": bool(res.get("read_only_verified")),
            "blocked": bool(res.get("blocked")),
            "reason": res.get("reason"),
            "row_count": res.get("row_count", 0),
            "execution_ms": res.get("execution_ms"),
            "rows": (res.get("rows") or [])[:15],
        },
    )


def tool_anomaly_investigator(
    engine: sa.Engine,
    *,
    company_id: str,
    dataset_id: str | None = None,
) -> ToolInvocationResult:
    t0 = time.perf_counter()
    try:
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=company_id, dataset_id=dataset_id)
            alerts = services.alerts(conn, info)
            end_d = date.fromisoformat(info["end"])
            start_d = max(end_d.replace(day=1), date.fromisoformat(info["start"]))
            prior = previous_period(start_d, end_d, True)
            decomposition = None
            if prior[0] >= date.fromisoformat(info["start"]):
                decomposition = root_cause.decompose(conn, (start_d, end_d), prior, {}, info=info)
        chart_rows = (
            decomposition["contributions"]["product"][:8]
            if decomposition and decomposition.get("contributions", {}).get("product")
            else alerts[:8]
        )
        chart = (
            {"type": "bar", "x": "name", "y": "delta", "rows": chart_rows}
            if decomposition and chart_rows
            else None
        )
        return ToolInvocationResult(
            tool_name="anomaly_detector",
            ok=True,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            summary=f"Found {len(alerts)} active anomaly alert(s) and decomposed period drivers.",
            data={"info": info, "alerts": alerts[:12], "decomposition": decomposition},
            chart=chart,
        )
    except HTTPException as exc:
        return ToolInvocationResult(
            tool_name="anomaly_detector",
            ok=False,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            summary=exc.detail,
            data={"error": exc.detail},
        )


def tool_forecaster(
    engine: sa.Engine,
    *,
    question: str,
    company_id: str,
    dataset_id: str | None = None,
    session_context: dict[str, Any] | None = None,
) -> ToolInvocationResult:
    t0 = time.perf_counter()
    qf = fold_text(question)
    horizon = 7 if any(w in qf for w in ("7 day", "7 ngay", "next week", "tuan toi")) else 30
    target = "orders" if any(w in qf for w in ("orders", "don hang")) else "demand" if any(w in qf for w in ("demand", "units", "nhu cau")) else "revenue"

    try:
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=company_id, dataset_id=dataset_id)
            avail = options(conn, info=info)
            matched_prod = None
            for p in avail.get("products") or []:
                if fold_text(p["product_name"]) in qf or fold_text(p["product_id"]) in qf:
                    matched_prod = p["product_id"]
                    break
            if not matched_prod and session_context and any(w in qf for w in ("it", "that product", "san pham do")):
                matched_prod = session_context.get("last_product")
            req = ForecastRequest(target=target, product=matched_prod, horizon=horizon)
            res = services.forecast(conn, info, req)
        chart = {"type": "line", "x": "date", "y": "value", "rows": res["prediction"]} if res.get("prediction") else None
        return ToolInvocationResult(
            tool_name="demand_forecaster",
            ok=True,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            summary=f"Generated {horizon}-day {target} forecast (scope={res['scope']}, total={round(res['total'], 2)}).",
            data={"info": info, "forecast": res},
            chart=chart,
        )
    except HTTPException as exc:
        return ToolInvocationResult(
            tool_name="demand_forecaster",
            ok=False,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            summary=exc.detail,
            data={"error": exc.detail},
        )


def tool_scenario_simulator(
    engine: sa.Engine,
    *,
    question: str,
    company_id: str,
    dataset_id: str | None = None,
) -> ToolInvocationResult:
    t0 = time.perf_counter()
    qf = fold_text(question)
    try:
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=company_id, dataset_id=dataset_id)
            avail = options(conn, info=info)
            caps = info.get("capabilities") or {}
            if any(w in qf for w in ("marketing", "budget", "spend", "ads", "roas", "quang cao", "ngan sach")) and caps.get("has_marketing", True):
                m_channels = avail.get("marketing_channels") or []
                channel = next((c for c in m_channels if fold_text(c) in qf), m_channels[0] if m_channels else None)
                if not channel:
                    raise HTTPException(422, "No marketing channel available in active dataset.")
                req = MarketingRequest(type="marketing", objective="profit", parameters=MarketingParams(channel=channel))
                res = services.simulate(conn, info, req)
            elif any(w in qf for w in ("inventory", "stock", "restock", "ton kho", "nhap hang")) and caps.get("has_inventory", True):
                phys = [p for p in (avail.get("products") or []) if p.get("is_physical")]
                prod = next((p["product_id"] for p in phys if fold_text(p["product_name"]) in qf), phys[0]["product_id"] if phys else None)
                if not prod:
                    raise HTTPException(422, "No physical SKU available for inventory simulation.")
                req = InventoryRequest(type="inventory", objective="stockout", parameters=InventoryParams(product=prod, order_quantities=[0, 100, 300]))
                res = services.simulate(conn, info, req)
            else:
                prods = avail.get("products") or []
                prod = next((p["product_id"] for p in prods if fold_text(p["product_name"]) in qf), prods[0]["product_id"] if prods else None)
                if not prod:
                    raise HTTPException(422, "No product available for price simulation.")
                req = PriceRequest(type="price", objective="profit", parameters=PriceParams(product=prod, discounts=[0, 0.05, 0.10]))
                res = services.simulate(conn, info, req)

        rows = [res["baseline"], *(res.get("alternatives") or [])]
        chart = {"type": "bar", "x": "name", "y": "profit" if "profit" in res["baseline"] else "revenue", "rows": rows}
        return ToolInvocationResult(
            tool_name="scenario_simulator",
            ok=True,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            summary=f"Ran read-only '{res['type']}' sensitivity simulation (recommended={res['recommended'].get('name')}).",
            data={"info": info, "simulation": res, "requires_human_confirmation_to_apply": True},
            chart=chart,
        )
    except HTTPException as exc:
        return ToolInvocationResult(
            tool_name="scenario_simulator",
            ok=False,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            summary=exc.detail,
            data={"error": exc.detail},
        )


def tool_recommendations(
    engine: sa.Engine,
    *,
    company_id: str,
    dataset_id: str | None = None,
) -> ToolInvocationResult:
    t0 = time.perf_counter()
    try:
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=company_id, dataset_id=dataset_id)
            recs = services.recommendations(conn, info)
        return ToolInvocationResult(
            tool_name="recommendation_engine",
            ok=True,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            summary=f"Retrieved {len(recs)} prioritized actionable recommendation(s).",
            data={"info": info, "recommendations": recs},
        )
    except HTTPException as exc:
        return ToolInvocationResult(
            tool_name="recommendation_engine",
            ok=False,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            summary=exc.detail,
            data={"error": exc.detail},
        )

