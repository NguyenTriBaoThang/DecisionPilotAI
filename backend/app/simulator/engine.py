"""Interactive 3D Business Scenario Simulator Execution Engine, Run Lifecycle & Multi-Scenario Comparator."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
import hashlib
import math
import os
import threading
import time
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
import sqlalchemy as sa

from ai_service import scenario as legacy_scenario_calc
from backend.app import services
from backend.app.analytics import FULL_CAPABILITIES, dataset_info, grouped, is_partitioned, ratio
from backend.app.db import (
    audit,
    enterprise_datasets,
    rag_documents,
    simulations,
    twin_scenario_variables,
    twin_scenarios,
    twin_simulation_events,
    twin_simulation_results,
    twin_simulation_runs,
)
from backend.app.lineage import service as lineage_service
from backend.app.schemas import (
    ForecastRequest,
    InventoryParams,
    InventoryRequest,
    MarketingParams,
    MarketingRequest,
    PriceParams,
    PriceRequest,
)
from backend.app.simulator.baseline import (
    build_variable_catalog,
    compute_baseline_snapshot,
    compute_data_readiness,
    get_or_create_baseline_scenario,
)
from backend.app.simulator.schemas import (
    CompareScenariosRequest,
    ConstraintConfig,
    ScenarioCreateRequest,
    ScenarioUpdateRequest,
    ScenarioVariablesPatchRequest,
    SimulationRunCreateRequest,
)
from backend.app.simulator.topology import (
    EDGE_DEFINITIONS,
    NODE_DEFINITIONS,
    ZONE_DEFINITIONS,
    get_pipeline_subgraph,
)


_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="twin-sim")
_CANCEL_LOCK = threading.Lock()
_CANCEL_FLAGS: set[str] = set()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Any) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()
    if isinstance(dt, date):
        return dt.isoformat()
    return str(dt)


def _serialize_scenario(row: dict[str, Any], variables: list[dict[str, Any]], latest_run: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "dataset_id": row.get("dataset_id"),
        "scenario_type": row["scenario_type"],
        "name": row["name"],
        "description": row.get("description"),
        "baseline_reference": row.get("baseline_reference"),
        "objective": row.get("objective") or "balanced",
        "horizon_days": int(row.get("horizon_days") or 30),
        "is_baseline": bool(row.get("is_baseline")),
        "constraints": dict(row.get("constraints_json") or {}),
        "configuration": dict(row.get("configuration_json") or {}),
        "data_sources": dict(row.get("data_sources_json") or {}),
        "models": list(row.get("models_json") or []),
        "created_by": row.get("created_by") or "system",
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
        "variables": variables,
        "latest_run": latest_run,
    }


def _serialize_run_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "scenario_id": row["scenario_id"],
        "dataset_id": row.get("dataset_id"),
        "status": row["status"],
        "legacy_simulation_id": row.get("legacy_simulation_id"),
        "started_at": _iso(row.get("started_at")),
        "completed_at": _iso(row.get("completed_at")),
        "duration_ms": row.get("duration_ms"),
        "model_versions": dict(row.get("model_versions_json") or {}),
        "input_references": dict(row.get("input_references_json") or {}),
        "output_references": dict(row.get("output_references_json") or {}),
        "data_readiness": dict(row.get("data_readiness_json") or {}),
        "warnings": list(row.get("warnings_json") or []),
        "assumptions": list(row.get("assumptions_json") or []),
        "recommendation": row.get("recommendation_json"),
        "error_details": row.get("error_details"),
        "created_by": row.get("created_by") or "system",
    }


def _serialize_event_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "simulation_run_id": row["simulation_run_id"],
        "step_order": int(row.get("step_order") or 0),
        "event_type": row["event_type"],
        "zone_id": row.get("zone_id"),
        "node_id": row.get("node_id"),
        "source_node_id": row.get("source_node_id"),
        "target_node_id": row.get("target_node_id"),
        "edge_id": row.get("edge_id"),
        "timestamp": _iso(row.get("timestamp")),
        "duration_ms": row.get("duration_ms"),
        "status": row["status"],
        "record_count": row.get("record_count"),
        "metadata": dict(row.get("metadata_json") or {}),
    }


def _serialize_result_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "simulation_run_id": row["simulation_run_id"],
        "metric_name": row["metric_name"],
        "domain": row["domain"],
        "label": row["label"],
        "baseline_value": row.get("baseline_value"),
        "scenario_value": row.get("scenario_value"),
        "abs_difference": row.get("abs_difference"),
        "pct_difference": row.get("pct_difference"),
        "unit": row["unit"],
        "uncertainty_metadata": dict(row.get("uncertainty_metadata_json") or {}),
        "evidence_references": dict(row.get("evidence_references_json") or {}),
    }


def get_workspace_payload(
    engine: sa.Engine,
    *,
    company_id: str,
    dataset_id: str | None = None,
    actor: str = "system",
    horizon_days: int = 30,
) -> dict[str, Any]:
    """Assemble full Digital Twin workspace state: readiness, zones, topology, AI models, baseline & scenarios."""
    with engine.begin() as conn:
        try:
            info = dataset_info(conn, company_id=company_id, dataset_id=dataset_id)
        except HTTPException:
            info = None

        if info is None:
            return {
                "company_id": company_id,
                "dataset_ready": False,
                "dataset": None,
                "data_readiness": compute_data_readiness(conn, company_id=company_id, info=None),
                "baseline": None,
                "zones": ZONE_DEFINITIONS,
                "nodes": NODE_DEFINITIONS,
                "edges": EDGE_DEFINITIONS,
                "ai_models": [],
                "variable_templates": {},
                "scenarios": [],
                "recent_runs": [],
            }

        readiness = compute_data_readiness(conn, company_id=company_id, info=info)
        snapshot = compute_baseline_snapshot(conn, company_id=company_id, info=info, horizon_days=horizon_days)

    baseline_scenario = get_or_create_baseline_scenario(engine, company_id=company_id, info=info, actor=actor)
    scenarios_list = list_scenarios(engine, company_id=company_id, dataset_id=info["dataset_id"])
    runs_list = list_simulation_runs(engine, company_id=company_id, dataset_id=info["dataset_id"], limit=20)

    templates = {
        stype: build_variable_catalog(scenario_type=stype, baseline=snapshot)
        for stype in (
            "revenue_growth",
            "marketing_optimization",
            "pricing_strategy",
            "inventory_optimization",
            "customer_retention",
            "cost_reduction",
            "supply_chain_disruption",
            "custom",
        )
    }

    zones_with_metrics = []
    for z in ZONE_DEFINITIONS:
        z_data = snapshot["zones"].get(z["id"], {})
        zones_with_metrics.append({**z, "baseline": z_data})

    return {
        "company_id": company_id,
        "dataset_ready": True,
        "dataset": {
            "dataset_id": info["dataset_id"],
            "title": info["title"],
            "currency": info.get("currency", "VND"),
            "start": info.get("start"),
            "end": info.get("end"),
            "storage_mode": info.get("storage_mode"),
            "capabilities": info.get("capabilities") or FULL_CAPABILITIES,
        },
        "data_readiness": readiness,
        "baseline_scenario_id": baseline_scenario["id"],
        "baseline": snapshot,
        "zones": zones_with_metrics,
        "nodes": NODE_DEFINITIONS,
        "edges": EDGE_DEFINITIONS,
        "ai_models": snapshot["ai_models"],
        "variable_templates": templates,
        "scenarios": scenarios_list,
        "recent_runs": runs_list,
    }


def list_scenarios(
    engine: sa.Engine,
    *,
    company_id: str,
    dataset_id: str | None = None,
) -> list[dict[str, Any]]:
    with engine.connect() as conn:
        q = sa.select(twin_scenarios).where(twin_scenarios.c.company_id == company_id)
        if dataset_id:
            q = q.where(twin_scenarios.c.dataset_id == dataset_id)
        rows = [dict(r) for r in conn.execute(q.order_by(twin_scenarios.c.is_baseline.desc(), twin_scenarios.c.updated_at.desc())).mappings()]
        if not rows:
            return []
        sids = [r["id"] for r in rows]
        var_rows = [
            dict(v)
            for v in conn.execute(
                sa.select(twin_scenario_variables).where(twin_scenario_variables.c.scenario_id.in_(sids))
            ).mappings()
        ]
        vars_by_sid: dict[str, list[dict[str, Any]]] = {}
        for v in var_rows:
            vars_by_sid.setdefault(v["scenario_id"], []).append({
                "id": v["id"],
                "domain": v["domain"],
                "variable_name": v["variable_name"],
                "label": v["label"],
                "baseline_value": v["baseline_value"],
                "scenario_value": v["scenario_value"],
                "unit": v["unit"],
                "min_value": v["min_value"],
                "max_value": v["max_value"],
                "validation_rule": v["validation_rule"],
                "source_or_assumption": v["source_or_assumption"],
                "supported": bool(v["supported"]),
                "metadata": dict(v.get("metadata_json") or {}),
            })
        run_rows = [
            dict(r)
            for r in conn.execute(
                sa.select(twin_simulation_runs)
                .where(twin_simulation_runs.c.scenario_id.in_(sids))
                .order_by(twin_simulation_runs.c.started_at.desc())
            ).mappings()
        ]
        latest_by_sid: dict[str, dict[str, Any]] = {}
        for rr in run_rows:
            latest_by_sid.setdefault(rr["scenario_id"], _serialize_run_row(rr))

        return [
            _serialize_scenario(r, vars_by_sid.get(r["id"], []), latest_by_sid.get(r["id"]))
            for r in rows
        ]


def get_scenario_detail(engine: sa.Engine, *, company_id: str, scenario_id: str) -> dict[str, Any]:
    with engine.connect() as conn:
        row = conn.execute(sa.select(twin_scenarios).where(twin_scenarios.c.id == scenario_id)).mappings().first()
        if not row:
            raise HTTPException(404, f"Scenario '{scenario_id}' not found.")
        if row["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant access to scenario denied.")
        var_rows = [
            {
                "id": v["id"],
                "domain": v["domain"],
                "variable_name": v["variable_name"],
                "label": v["label"],
                "baseline_value": v["baseline_value"],
                "scenario_value": v["scenario_value"],
                "unit": v["unit"],
                "min_value": v["min_value"],
                "max_value": v["max_value"],
                "validation_rule": v["validation_rule"],
                "source_or_assumption": v["source_or_assumption"],
                "supported": bool(v["supported"]),
                "metadata": dict(v.get("metadata_json") or {}),
            }
            for v in conn.execute(
                sa.select(twin_scenario_variables).where(twin_scenario_variables.c.scenario_id == scenario_id)
            ).mappings()
        ]
        runs = [
            _serialize_run_row(dict(r))
            for r in conn.execute(
                sa.select(twin_simulation_runs)
                .where(twin_simulation_runs.c.scenario_id == scenario_id, twin_simulation_runs.c.company_id == company_id)
                .order_by(twin_simulation_runs.c.started_at.desc())
                .limit(20)
            ).mappings()
        ]
    nodes, edges = get_pipeline_subgraph(row["scenario_type"])
    detail = _serialize_scenario(dict(row), var_rows, runs[0] if runs else None)
    detail["runs"] = runs
    detail["pipeline_graph"] = {"nodes": nodes, "edges": edges}
    return detail


def create_scenario(
    engine: sa.Engine,
    *,
    company_id: str,
    actor: str,
    body: ScenarioCreateRequest,
) -> dict[str, Any]:
    with engine.begin() as conn:
        info = dataset_info(conn, company_id=company_id, dataset_id=body.dataset_id)
        snapshot = compute_baseline_snapshot(conn, company_id=company_id, info=info, horizon_days=body.horizon_days)
        readiness = compute_data_readiness(conn, company_id=company_id, info=info)
        vars_spec = build_variable_catalog(
            scenario_type=body.scenario_type,
            baseline=snapshot,
            overrides=body.variables_overrides,
        )

        # Validate bounds immediately
        for v in vars_spec:
            val = v.get("scenario_value")
            if val is not None:
                if v["min_value"] is not None and val < v["min_value"]:
                    raise HTTPException(422, f"{v['label']} ({val}) cannot be below minimum {v['min_value']} {v['unit']}.")
                if v["max_value"] is not None and val > v["max_value"]:
                    raise HTTPException(422, f"{v['label']} ({val}) cannot exceed maximum {v['max_value']} {v['unit']}.")

        base_ref = body.baseline_reference
        if not base_ref and body.scenario_type != "baseline":
            existing_base = conn.scalar(
                sa.select(twin_scenarios.c.id).where(
                    twin_scenarios.c.company_id == company_id,
                    twin_scenarios.c.dataset_id == info["dataset_id"],
                    twin_scenarios.c.is_baseline.is_(True),
                )
            )
            base_ref = existing_base

        sid = f"scen-{uuid4().hex[:12]}"
        now = _utc_now()
        cfg = dict(body.configuration or {})
        if not cfg.get("product_id") and snapshot.get("default_product"):
            cfg["product_id"] = snapshot["default_product"]["product_id"]
        if not cfg.get("channel") and snapshot.get("default_channel"):
            cfg["channel"] = snapshot["default_channel"]

        conn.execute(
            twin_scenarios.insert().values(
                id=sid,
                company_id=company_id,
                dataset_id=info["dataset_id"],
                scenario_type=body.scenario_type,
                name=body.name,
                description=body.description or f"What-if simulation scenario ({body.scenario_type.replace('_', ' ')})",
                baseline_reference=base_ref,
                objective=body.objective,
                horizon_days=body.horizon_days,
                is_baseline=(body.scenario_type == "baseline"),
                constraints_json=body.constraints.model_dump(),
                configuration_json=cfg,
                data_sources_json={
                    "dataset_id": info["dataset_id"],
                    "title": info["title"],
                    "currency": info.get("currency", "VND"),
                    "window": [snapshot["window_start"], snapshot["window_end"]],
                    "readiness": readiness,
                },
                models_json=snapshot["ai_models"],
                created_by=actor,
                created_at=now,
                updated_at=now,
            )
        )
        for v in vars_spec:
            conn.execute(
                twin_scenario_variables.insert().values(
                    id=f"var-{uuid4().hex[:12]}",
                    company_id=company_id,
                    scenario_id=sid,
                    domain=v["domain"],
                    variable_name=v["variable_name"],
                    label=v["label"],
                    baseline_value=v["baseline_value"],
                    scenario_value=v["scenario_value"],
                    unit=v["unit"],
                    min_value=v["min_value"],
                    max_value=v["max_value"],
                    validation_rule=v["validation_rule"],
                    source_or_assumption=v["source_or_assumption"],
                    supported=v["supported"],
                    metadata_json=v["metadata"],
                )
            )
        conn.execute(
            audit.insert().values(
                company_id=company_id,
                kind="twin_scenario_created",
                subject=sid,
                payload={"name": body.name, "scenario_type": body.scenario_type, "dataset_id": info["dataset_id"], "actor": actor},
            )
        )
    return get_scenario_detail(engine, company_id=company_id, scenario_id=sid)


def update_scenario(
    engine: sa.Engine,
    *,
    company_id: str,
    scenario_id: str,
    body: ScenarioUpdateRequest,
) -> dict[str, Any]:
    with engine.begin() as conn:
        row = conn.execute(sa.select(twin_scenarios).where(twin_scenarios.c.id == scenario_id)).mappings().first()
        if not row:
            raise HTTPException(404, f"Scenario '{scenario_id}' not found.")
        if row["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant scenario modification denied.")
        updates: dict[str, Any] = {"updated_at": _utc_now()}
        if body.name is not None:
            updates["name"] = body.name
        if body.description is not None:
            updates["description"] = body.description
        if body.objective is not None:
            updates["objective"] = body.objective
        if body.horizon_days is not None and not row["is_baseline"]:
            updates["horizon_days"] = body.horizon_days
        if body.constraints is not None:
            updates["constraints_json"] = body.constraints.model_dump()
        if body.configuration is not None:
            merged = {**(row.get("configuration_json") or {}), **body.configuration}
            updates["configuration_json"] = merged
        conn.execute(twin_scenarios.update().where(twin_scenarios.c.id == scenario_id).values(**updates))
    return get_scenario_detail(engine, company_id=company_id, scenario_id=scenario_id)


def patch_scenario_variables(
    engine: sa.Engine,
    *,
    company_id: str,
    scenario_id: str,
    body: ScenarioVariablesPatchRequest,
) -> dict[str, Any]:
    with engine.begin() as conn:
        scen = conn.execute(sa.select(twin_scenarios).where(twin_scenarios.c.id == scenario_id)).mappings().first()
        if not scen:
            raise HTTPException(404, f"Scenario '{scenario_id}' not found.")
        if scen["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant scenario variable update denied.")
        if scen["is_baseline"]:
            raise HTTPException(422, "The locked Baseline Scenario mirrors observed historical data; create or edit a What-if scenario to vary assumptions.")

        existing_vars = {
            r["variable_name"]: dict(r)
            for r in conn.execute(
                sa.select(twin_scenario_variables).where(twin_scenario_variables.c.scenario_id == scenario_id)
            ).mappings()
        }
        for item in body.variables:
            target = existing_vars.get(item.variable_name)
            if not target:
                raise HTTPException(422, f"Variable '{item.variable_name}' is not defined on this scenario.")
            updates: dict[str, Any] = {}
            for field_name in ("scenario_value", "baseline_value"):
                val = getattr(item, field_name)
                if val is not None:
                    if target["min_value"] is not None and val < target["min_value"]:
                        raise HTTPException(422, f"{target['label']} ({val}) must be >= {target['min_value']} {target['unit']}.")
                    if target["max_value"] is not None and val > target["max_value"]:
                        raise HTTPException(422, f"{target['label']} ({val}) must be <= {target['max_value']} {target['unit']}.")
                    updates[field_name] = float(val)
            if item.baseline_value is not None or item.scenario_value is not None:
                eff_base = updates.get("baseline_value", target["baseline_value"])
                eff_scen = updates.get("scenario_value", target["scenario_value"])
                if eff_base is not None and eff_scen is not None and not target["supported"]:
                    updates["supported"] = True
                if item.source_or_assumption:
                    updates["source_or_assumption"] = item.source_or_assumption
                elif item.baseline_value is not None and target["baseline_value"] is None:
                    updates["source_or_assumption"] = "Operator Assumption (explicit manual baseline + scenario values)"
            if updates:
                conn.execute(
                    twin_scenario_variables.update().where(twin_scenario_variables.c.id == target["id"]).values(**updates)
                )
        conn.execute(twin_scenarios.update().where(twin_scenarios.c.id == scenario_id).values(updated_at=_utc_now()))
    return get_scenario_detail(engine, company_id=company_id, scenario_id=scenario_id)


def delete_scenario(engine: sa.Engine, *, company_id: str, scenario_id: str) -> dict[str, Any]:
    with engine.begin() as conn:
        scen = conn.execute(sa.select(twin_scenarios).where(twin_scenarios.c.id == scenario_id)).mappings().first()
        if not scen:
            raise HTTPException(404, f"Scenario '{scenario_id}' not found.")
        if scen["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant delete denied.")
        if scen["is_baseline"]:
            raise HTTPException(422, "Cannot delete the canonical Baseline Scenario.")
        conn.execute(twin_scenarios.delete().where(twin_scenarios.c.id == scenario_id, twin_scenarios.c.company_id == company_id))
    return {"deleted": True, "scenario_id": scenario_id}


def _pct_diff(base: float | None, scen: float | None) -> float | None:
    if base is None or scen is None or base == 0:
        return None
    return round(((scen - base) / abs(base)) * 100.0, 2)


def _abs_diff(base: float | None, scen: float | None) -> float | None:
    if base is None or scen is None:
        return None
    return round(scen - base, 2)


def _execute_simulation_worker(
    engine: sa.Engine,
    *,
    run_id: str,
    company_id: str,
    scenario_id: str,
    actor: str,
    inject_failure: bool = False,
    step_delay_ms: int = 0,
) -> None:
    t0 = time.perf_counter()
    node_map = {n["id"]: n for n in NODE_DEFINITIONS}

    def check_cancelled() -> bool:
        with _CANCEL_LOCK:
            if run_id in _CANCEL_FLAGS:
                return True
        with engine.connect() as c:
            st = c.scalar(sa.select(twin_simulation_runs.c.status).where(twin_simulation_runs.c.id == run_id))
            return st == "cancelled"

    def write_event(
        *,
        step_order: int,
        event_type: str,
        status: str,
        zone_id: str | None = None,
        node_id: str | None = None,
        source_node_id: str | None = None,
        target_node_id: str | None = None,
        edge_id: str | None = None,
        duration_ms: float | None = None,
        record_count: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        with engine.begin() as c:
            c.execute(
                twin_simulation_events.insert().values(
                    id=f"evt-{uuid4().hex[:14]}",
                    company_id=company_id,
                    simulation_run_id=run_id,
                    step_order=step_order,
                    event_type=event_type[:80],
                    zone_id=zone_id,
                    node_id=node_id,
                    source_node_id=source_node_id,
                    target_node_id=target_node_id,
                    edge_id=edge_id,
                    timestamp=_utc_now(),
                    duration_ms=duration_ms,
                    status=status,
                    record_count=record_count,
                    metadata_json=metadata or {},
                )
            )

    try:
        # Stage: queued -> running
        if check_cancelled():
            return
        with engine.begin() as conn:
            conn.execute(
                twin_simulation_runs.update()
                .where(twin_simulation_runs.c.id == run_id, twin_simulation_runs.c.status != "cancelled")
                .values(status="queued")
            )
        write_event(step_order=1, event_type="Simulation Queued", status="queued", zone_id="ai_engine", node_id="ai_sql")

        if step_delay_ms > 0:
            time.sleep(min(0.25, step_delay_ms / 1000.0))

        if check_cancelled():
            return

        with engine.begin() as conn:
            conn.execute(
                twin_simulation_runs.update()
                .where(twin_simulation_runs.c.id == run_id, twin_simulation_runs.c.status != "cancelled")
                .values(status="running")
            )

        if inject_failure:
            raise RuntimeError("Simulated execution failure triggered via request flag (error-handling & retry verification).")

        # Load scenario, variables & active dataset snapshot
        with engine.connect() as conn:
            scen = conn.execute(sa.select(twin_scenarios).where(twin_scenarios.c.id == scenario_id)).mappings().one()
            vars_list = [
                dict(v)
                for v in conn.execute(
                    sa.select(twin_scenario_variables).where(twin_scenario_variables.c.scenario_id == scenario_id)
                ).mappings()
            ]
            info = dataset_info(conn, company_id=company_id, dataset_id=scen.get("dataset_id"))
            readiness = compute_data_readiness(conn, company_id=company_id, info=info)
            horizon = int(scen.get("horizon_days") or 30)
            baseline = compute_baseline_snapshot(conn, company_id=company_id, info=info, horizon_days=horizon)

        vmap = {v["variable_name"]: v for v in vars_list}
        def vval(name: str, default: float | None = None) -> float | None:
            item = vmap.get(name)
            if item and item["scenario_value"] is not None:
                return float(item["scenario_value"])
            return default

        stype = scen["scenario_type"]
        caps = info.get("capabilities") or FULL_CAPABILITIES
        currency = info.get("currency", "VND")
        z = baseline["zones"]
        sales_m = z["sales"]["metrics"]
        mkt_m = z["marketing"]["metrics"]
        cust_m = z["customers"]["metrics"]
        inv_m = z["inventory"]["metrics"]
        sc_m = z["supply_chain"]["metrics"]
        fin_m = z["finance_ops"]["metrics"]

        cfg = dict(scen.get("configuration_json") or {})
        prod_id = cfg.get("product_id") or (baseline.get("default_product") or {}).get("product_id")
        channel_name = cfg.get("channel") or baseline.get("default_channel")

        # 1. Execute Forecast (LightGBM or Adaptive Statistical Baseline)
        forecast_rev_total: float | None = None
        forecast_rev_lower: float | None = None
        forecast_rev_upper: float | None = None
        forecast_demand_total: float | None = None
        forecast_demand_lower: float | None = None
        forecast_demand_upper: float | None = None
        forecast_model_ver: str = "untrained"
        forecast_selected_algo: str = "historical_run_rate"
        forecast_warnings: list[str] = []
        forecast_horizon = 30 if horizon >= 30 else 7
        forecast_scale = float(horizon) / float(forecast_horizon)
        daily_demand_path: list[dict[str, Any]] = []

        bundle = services.artifact(info)
        if bundle and caps.get("supports_forecast", True):
            with engine.connect() as conn:
                try:
                    f_rev = services.forecast(conn, info, ForecastRequest(target="revenue", horizon=forecast_horizon))
                    forecast_model_ver = str(f_rev.get("model_version") or bundle.get("version") or "lightgbm")
                    forecast_selected_algo = str((f_rev.get("metrics") or {}).get("selected") or "lightgbm")
                    forecast_warnings.extend(f_rev.get("warnings") or [])
                    forecast_rev_total = round(sum(float(r["value"]) for r in f_rev["prediction"]) * forecast_scale, 2)
                    forecast_rev_lower = round(sum(float(r["lower"]) for r in f_rev["prediction"]) * forecast_scale, 2)
                    forecast_rev_upper = round(sum(float(r["upper"]) for r in f_rev["prediction"]) * forecast_scale, 2)
                except Exception as exc:
                    forecast_warnings.append(f"Revenue forecast fallback used: {exc}")

                try:
                    req_prod = prod_id if (prod_id and stype in {"pricing_strategy", "inventory_optimization", "supply_chain_disruption"}) else None
                    f_dem = services.forecast(conn, info, ForecastRequest(target="demand", product=req_prod, horizon=forecast_horizon))
                    forecast_demand_total = round(sum(float(r["value"]) for r in f_dem["prediction"]) * forecast_scale, 2)
                    forecast_demand_lower = round(sum(float(r["lower"]) for r in f_dem["prediction"]) * forecast_scale, 2)
                    forecast_demand_upper = round(sum(float(r["upper"]) for r in f_dem["prediction"]) * forecast_scale, 2)
                    daily_demand_path = list(f_dem["prediction"])
                except Exception:
                    try:
                        f_dem = services.forecast(conn, info, ForecastRequest(target="demand", horizon=forecast_horizon))
                        forecast_demand_total = round(sum(float(r["value"]) for r in f_dem["prediction"]) * forecast_scale, 2)
                        daily_demand_path = list(f_dem["prediction"])
                    except Exception:
                        pass
        else:
            forecast_warnings.append(
                f"No trained LightGBM/statistical forecast bundle available for {info['title']}; using trailing observed SQL baseline prorated to {horizon}d."
            )

        if horizon == 90 and forecast_rev_total is not None:
            forecast_warnings.append("90-day horizon linearly extrapolates the 30-day calibrated LightGBM projection; uncertainty widens materially beyond 30 days.")

        # 2. Extract levers & check bounds/out-of-range warnings
        warnings: list[str] = list(dict.fromkeys(forecast_warnings))
        assumptions: list[str] = []

        discount_pct = float(vval("discount_rate_pct", 0.0) or 0.0)
        elasticity = float(vval("price_elasticity", -1.0) or -1.0)
        demand_growth_pct = float(vval("demand_growth_pct", 0.0) or 0.0)
        mkt_change_pct = float(vval("marketing_budget_change_pct", 0.0) or 0.0)
        mkt_alpha = float(vval("response_exponent", 0.65) or 0.65)
        cogs_red_pct = float(vval("direct_cogs_reduction_pct", 0.0) or 0.0)
        lt_days = vval("supplier_lead_time_days", sc_m.get("avg_lead_time_days"))
        supply_cap_pct = float(vval("supply_capacity_pct", 100.0) or 100.0)
        reorder_qty = float(vval("replenishment_qty_units", 0.0) or 0.0)
        safety_stock = vval("safety_stock_units", inv_m.get("avg_reorder_point"))
        ret_shift_val = vval("retention_rate_shift_pct", None)

        opex_var = vmap.get("operating_cost_assumption")
        has_opex_both = bool(
            opex_var and opex_var.get("baseline_value") is not None and opex_var.get("scenario_value") is not None
        )

        if abs(discount_pct) > 25.0:
            warnings.append(f"Discount magnitude ({discount_pct:+.1f}%) exceeds normal historical +/-25% calibration range.")
        if abs(mkt_change_pct) > 50.0:
            warnings.append(f"Marketing spend shift ({mkt_change_pct:+.1f}%) exceeds +/-50% range; concave response may under/overstate tail saturation.")
        if abs(demand_growth_pct) > 40.0:
            warnings.append(f"Exogenous demand growth ({demand_growth_pct:+.1f}%) is an extreme sensitivity assumption outside recent distribution.")

        # 3. Run Scenario Engine Calculations & Optionally Create Legacy Bridge Run
        legacy_sim_id: str | None = None
        results_rows: list[dict[str, Any]] = []

        base_rev = forecast_rev_total if forecast_rev_total is not None else float(sales_m.get("revenue") or 0.0)
        base_units = forecast_demand_total if forecast_demand_total is not None else float(sales_m.get("units_sold") or 0.0)
        avg_aov = float(sales_m.get("aov") or 0.0)
        base_orders = float(sales_m.get("orders") or 0.0)
        base_gp = fin_m.get("gross_profit")
        base_cogs = fin_m.get("direct_cogs")
        base_margin = fin_m.get("gross_margin")
        base_mkt_spend = mkt_m.get("marketing_budget")
        base_stock = inv_m.get("total_stock_on_hand")

        # Try legacy scenario bridge for exact compatibility on Price / Marketing / Inventory / Revenue Growth
        with engine.begin() as conn:
            try:
                if stype == "pricing_strategy" and prod_id and caps.get("has_product", True):
                    disc = max(0.0, min(0.5, discount_pct / 100.0))
                    req_obj = PriceRequest(
                        type="price",
                        horizon=30 if horizon >= 30 else 7,
                        objective="profit" if scen["objective"] not in {"revenue", "balanced"} else scen["objective"],
                        parameters=PriceParams(product=prod_id, discounts=[0.0, disc] if disc > 0 else [0.0, 0.05], elasticity=elasticity),
                    )
                    res_leg = services.simulate(conn, info, req_obj)
                    assumptions.extend(res_leg.get("assumptions") or [])
                    legacy_sim_id = hashlib.sha256(
                        f"{company_id}:{info['dataset_id']}:{scenario_id}:{scen['updated_at']}".encode()
                    ).hexdigest()
                    if not conn.scalar(sa.select(simulations.c.id).where(simulations.c.id == legacy_sim_id)):
                        conn.execute(
                            simulations.insert().values(
                                id=legacy_sim_id,
                                company_id=company_id,
                                dataset_id=info["dataset_id"],
                                payload={"request": req_obj.model_dump(mode="json"), "result": res_leg},
                            )
                        )
                elif stype == "marketing_optimization" and channel_name and caps.get("has_marketing", True):
                    chg = max(-0.95, min(2.0, mkt_change_pct / 100.0))
                    req_obj = MarketingRequest(
                        type="marketing",
                        horizon=30 if horizon >= 30 else 7,
                        objective="profit" if scen["objective"] not in {"revenue", "balanced"} else scen["objective"],
                        parameters=MarketingParams(channel=channel_name, changes=[chg] if chg != 0 else [-0.15, 0.15], response_exponent=mkt_alpha),
                    )
                    res_leg = services.simulate(conn, info, req_obj)
                    assumptions.extend(res_leg.get("assumptions") or [])
                    legacy_sim_id = hashlib.sha256(
                        f"{company_id}:{info['dataset_id']}:{scenario_id}:{scen['updated_at']}".encode()
                    ).hexdigest()
                    if not conn.scalar(sa.select(simulations.c.id).where(simulations.c.id == legacy_sim_id)):
                        conn.execute(
                            simulations.insert().values(
                                id=legacy_sim_id,
                                company_id=company_id,
                                dataset_id=info["dataset_id"],
                                payload={"request": req_obj.model_dump(mode="json"), "result": res_leg},
                            )
                        )
                elif stype == "inventory_optimization" and prod_id and caps.get("has_inventory", True):
                    req_obj = InventoryRequest(
                        type="inventory",
                        horizon=30 if horizon >= 30 else 7,
                        objective="stockout",
                        parameters=InventoryParams(
                            product=prod_id,
                            safety_stock=int(safety_stock) if safety_stock is not None else None,
                            order_quantities=[int(reorder_qty)] if reorder_qty > 0 else [],
                        ),
                    )
                    res_leg = services.simulate(conn, info, req_obj)
                    assumptions.extend(res_leg.get("assumptions") or [])
                    legacy_sim_id = hashlib.sha256(
                        f"{company_id}:{info['dataset_id']}:{scenario_id}:{scen['updated_at']}".encode()
                    ).hexdigest()
                    if not conn.scalar(sa.select(simulations.c.id).where(simulations.c.id == legacy_sim_id)):
                        conn.execute(
                            simulations.insert().values(
                                id=legacy_sim_id,
                                company_id=company_id,
                                dataset_id=info["dataset_id"],
                                payload={"request": req_obj.model_dump(mode="json"), "result": res_leg},
                            )
                        )
            except Exception as exc:
                warnings.append(f"SKU/Channel micro-model fallback to portfolio sensitivity ({exc}).")

        # Unified enterprise sensitivity equations grounded on SQL + LightGBM baseline
        # 1) Marketing response multiplier
        if base_mkt_spend and base_mkt_spend > 0 and mkt_change_pct != 0.0:
            scen_mkt_spend = round(base_mkt_spend * (1.0 + mkt_change_pct / 100.0), 2)
            mkt_ratio = max(0.01, 1.0 + mkt_change_pct / 100.0)
            mkt_demand_mult = mkt_ratio ** mkt_alpha
            # Weight attributed marketing impact conservatively (~35% if total rev >> attributed rev)
            attr_rev = float((mkt_m.get("roas") or 2.0) * base_mkt_spend)
            attr_share = min(1.0, max(0.15, attr_rev / max(1.0, base_rev)))
            mkt_uplift_factor = (1.0 - attr_share) + attr_share * mkt_demand_mult
            assumptions.append(
                f"Marketing spend change ({mkt_change_pct:+.1f}%) propagates via concave response ratio^{mkt_alpha:.2f} weighted by attributed share ({attr_share:.0%}); NOT a causal incrementality proof."
            )
        else:
            scen_mkt_spend = base_mkt_spend
            mkt_uplift_factor = 1.0

        # 2) Price elasticity demand & price multiplier
        price_ratio = max(0.2, 1.0 - (discount_pct / 100.0))
        demand_elast_mult = max(0.0, 1.0 + elasticity * (price_ratio - 1.0))
        if discount_pct != 0.0:
            assumptions.append(
                f"Price adjustment ({-discount_pct:+.1f}% vs baseline) scales demand by 1 + ({elasticity:.2f}) x ({price_ratio - 1.0:+.3f}) = {demand_elast_mult:.3f}x."
            )

        # 3) Customer retention sensitivity (strictly disclosed heuristic)
        cust_mult = 1.0
        base_ret_share = cust_m.get("returning_share")
        if base_ret_share is not None and ret_shift_val is not None:
            base_ret_pct_obs = float(base_ret_share) * 100.0
            delta_ret = ret_shift_val - base_ret_pct_obs
            if abs(delta_ret) > 1e-6:
                cust_mult = max(0.3, 1.0 + (delta_ret / 100.0) * 0.6)
                assumptions.append(
                    f"Customer retention shift ({base_ret_pct_obs:.1f}% -> {ret_shift_val:.1f}%) uses sensitivity multiplier {cust_mult:.3f}x (Classification ML model NOT integrated)."
                )

        # 4) Exogenous demand growth overlay
        exog_mult = max(0.1, 1.0 + demand_growth_pct / 100.0)
        if demand_growth_pct != 0.0:
            assumptions.append(f"Exogenous demand growth overlay applied: {demand_growth_pct:+.1f}%.")

        # Total unconstrained unit demand
        if stype == "baseline":
            scen_unconstrained_units = base_units
            price_ratio = 1.0
        else:
            scen_unconstrained_units = round(base_units * mkt_uplift_factor * demand_elast_mult * cust_mult * exog_mult, 2)

        # 5) Inventory & Supply Chain physical fulfillment + stockout/overstock risk
        base_stockout_units: float | None = None
        scen_stockout_units: float | None = None
        base_closing_stock: float | None = None
        scen_closing_stock: float | None = None
        base_overstock_units: float | None = None
        scen_overstock_units: float | None = None
        scen_fulfilled_units = scen_unconstrained_units

        if z["inventory"]["supported"] and base_stock is not None:
            lead = int(round(lt_days or 7))
            safe = float(safety_stock if safety_stock is not None else (inv_m.get("avg_reorder_point") or 0))
            eff_receipt = round(float(reorder_qty) * (supply_cap_pct / 100.0), 2)
            base_daily = base_units / max(1, horizon)
            scen_daily = scen_unconstrained_units / max(1, horizon)

            # Baseline stock balance trajectory (no new emergency PO, normal supply)
            b_bal = float(base_stock)
            b_ful = 0.0
            for _day in range(1, horizon + 1):
                sold_d = min(base_daily, b_bal)
                b_ful += sold_d
                b_bal -= sold_d
            base_closing_stock = round(b_bal, 2)
            base_stockout_units = round(max(0.0, base_units - b_ful), 2)
            base_overstock_units = round(max(0.0, b_bal - safe * 2.0), 2) if safe > 0 else 0.0

            # Scenario trajectory with PO arrival at day lead+1 scaled by supply capacity
            s_bal = float(base_stock)
            s_ful = 0.0
            arrival_day = min(horizon, max(1, lead + 1)) if eff_receipt > 0 else -1
            for d_idx in range(1, horizon + 1):
                if d_idx == arrival_day:
                    s_bal += eff_receipt
                sold_d = min(scen_daily, s_bal)
                s_ful += sold_d
                s_bal -= sold_d
            scen_closing_stock = round(s_bal, 2)
            scen_stockout_units = round(max(0.0, scen_unconstrained_units - s_ful), 2)
            scen_overstock_units = round(max(0.0, s_bal - safe * 2.0), 2) if safe > 0 else 0.0
            scen_fulfilled_units = round(s_ful, 2) if stype != "baseline" else round(b_ful, 2)
            if stype == "baseline":
                scen_closing_stock = base_closing_stock
                scen_stockout_units = base_stockout_units
                scen_overstock_units = base_overstock_units
                scen_fulfilled_units = base_units
            assumptions.append(
                f"Inventory fulfillment capped by opening stock ({base_stock:,} units) + supplier receipt ({eff_receipt:,.0f} units arriving day {lead + 1}, supply capacity {supply_cap_pct:.0f}%)."
            )

        # Fulfilled revenue & orders
        unit_scale_base = base_units if base_units > 0 else 1.0
        scen_rev = round(
            base_rev * (scen_fulfilled_units / unit_scale_base) * price_ratio, 2
        ) if stype != "baseline" else base_rev
        scen_orders = round(
            base_orders * (scen_fulfilled_units / unit_scale_base), 2
        ) if stype != "baseline" else base_orders

        # 6) Costs, Gross Profit, Net Profit, Margin (strictly when Cost/Profit mapped!)
        scen_cogs: float | None = None
        scen_gp: float | None = None
        scen_margin: float | None = None
        base_net_profit: float | None = None
        scen_net_profit: float | None = None

        if caps.get("has_cost_or_profit", True) and base_cogs is not None and base_gp is not None:
            unit_cogs_base = base_cogs / max(1.0, base_units)
            scen_unit_cogs = unit_cogs_base * (1.0 - cogs_red_pct / 100.0)
            scen_cogs = round(scen_unit_cogs * scen_fulfilled_units, 2) if stype != "baseline" else round(base_cogs, 2)
            scen_gp = round(scen_rev - scen_cogs, 2) if stype != "baseline" else round(base_gp, 2)
            scen_margin = ratio(scen_gp, scen_rev)
            if cogs_red_pct != 0.0:
                assumptions.append(f"Direct unit COGS adjusted by {cogs_red_pct:+.1f}%.")

            # Operating expenses only included if BOTH baseline & scenario values are explicitly supplied by user!
            b_mkt = float(base_mkt_spend or 0.0)
            s_mkt = float(scen_mkt_spend or 0.0)
            b_opex = float(opex_var["baseline_value"]) if has_opex_both else 0.0
            s_opex = float(opex_var["scenario_value"]) if has_opex_both else 0.0
            base_net_profit = round(float(base_gp) - b_mkt - b_opex, 2)
            scen_net_profit = round(float(scen_gp) - s_mkt - s_opex, 2) if stype != "baseline" else base_net_profit
        else:
            warnings.append("Direct Cost / Profit columns are missing in this dataset — Gross Profit & Margin cannot be verified.")

        # Always disclose non-causal sensitivity disclaimer
        assumptions.append(
            "Predictive & sensitivity estimate only: this engine uses observed LightGBM/SQL correlations and parametric elasticities, not proven randomized causal inference."
        )

        # Build canonical Result metrics
        algo_tag = f"lightgbm/{forecast_selected_algo}" if bundle else "sql_trailing_baseline"
        data_src_label = f"{info['title']} [{baseline['window_start']}..{baseline['window_end']}]"
        now_ts = _iso(_utc_now())

        def add_res(
            metric: str,
            domain: str,
            lbl: str,
            b_val: float | None,
            s_val: float | None,
            unit: str,
            model_name: str,
            model_ver: str,
            uncertainty: dict[str, Any] | None = None,
            formula: str = "",
        ) -> None:
            results_rows.append({
                "id": f"res-{uuid4().hex[:14]}",
                "company_id": company_id,
                "simulation_run_id": run_id,
                "metric_name": metric,
                "domain": domain,
                "label": lbl,
                "baseline_value": b_val,
                "scenario_value": s_val,
                "abs_difference": _abs_diff(b_val, s_val),
                "pct_difference": _pct_diff(b_val, s_val),
                "unit": unit,
                "uncertainty_metadata_json": uncertainty or {
                    "is_available": False,
                    "interval_lower": None,
                    "interval_upper": None,
                    "reason": "Deterministic counterfactual sensitivity calculation does not emit a statistical probability interval.",
                },
                "evidence_references_json": {
                    "model_name": model_name,
                    "model_version": model_ver,
                    "data_source": data_src_label,
                    "formula": formula,
                    "timestamp": now_ts,
                },
            })

        add_res(
            "revenue_forecast",
            "sales",
            "Revenue Forecast",
            base_rev,
            scen_rev,
            currency,
            "LightGBM + Scenario Engine",
            f"{forecast_model_ver} + counterfactual-1.0",
            uncertainty={
                "is_available": bool(forecast_rev_lower is not None and forecast_rev_upper is not None and stype == "baseline"),
                "interval_lower": forecast_rev_lower if stype == "baseline" else None,
                "interval_upper": forecast_rev_upper if stype == "baseline" else None,
                "nominal_coverage": 0.90 if forecast_rev_lower is not None else None,
                "reason": (
                    "90% nominal empirical validation error band on baseline forecast"
                    if stype == "baseline" and forecast_rev_lower is not None
                    else "Baseline uses calibrated interval; what-if deltas are deterministic sensitivity overlays without joint prediction interval."
                ),
            },
            formula="Baseline revenue forecast x demand response x price ratio (capped by stock when tracked)",
        )
        add_res(
            "profit_forecast",
            "finance_ops",
            "Profit Forecast (Contribution / Net)",
            base_net_profit if base_net_profit is not None else base_gp,
            scen_net_profit if scen_net_profit is not None else scen_gp,
            currency,
            "SQL Analytics + Scenario Engine",
            "counterfactual-1.0",
            formula="Revenue - Direct COGS - Marketing Spend (- explicit Opex if supplied)",
        )
        add_res(
            "cost_forecast",
            "finance_ops",
            "Direct Cost Forecast (COGS)",
            base_cogs,
            scen_cogs,
            currency,
            "SQL Analytics + Scenario Engine",
            "counterfactual-1.0",
            formula="Unit COGS x (1 - COGS efficiency) x Fulfilled units",
        )
        add_res(
            "gross_margin_pct",
            "finance_ops",
            "Gross Margin",
            round(base_margin * 100.0, 2) if base_margin is not None else None,
            round(scen_margin * 100.0, 2) if scen_margin is not None else None,
            "%",
            "SQL Analytics",
            "sql-analytics-2.1",
            formula="Gross Profit / Revenue * 100",
        )
        add_res(
            "demand_forecast",
            "sales",
            "Demand Forecast (Units)",
            base_units,
            scen_unconstrained_units,
            "units",
            algo_tag,
            forecast_model_ver,
            uncertainty={
                "is_available": bool(forecast_demand_lower is not None and forecast_demand_upper is not None and stype == "baseline"),
                "interval_lower": forecast_demand_lower if stype == "baseline" else None,
                "interval_upper": forecast_demand_upper if stype == "baseline" else None,
                "reason": "Empirical validation band available for baseline statistical/LightGBM forecast only.",
            },
            formula="Baseline unit demand x marketing/price/retention/demand multipliers",
        )
        add_res(
            "inventory_risk_units",
            "inventory",
            "Unfulfilled / Stockout Risk",
            base_stockout_units,
            scen_stockout_units,
            "units",
            "Lead-Time Inventory Model",
            "inventory-replenish-1.0",
            formula="Unmet demand units when opening stock + delayed PO receipts < horizon demand",
        )
        add_res(
            "closing_inventory_units",
            "inventory",
            "Projected Closing Stock",
            base_closing_stock,
            scen_closing_stock,
            "units",
            "Lead-Time Inventory Model",
            "inventory-replenish-1.0",
            formula="Opening Stock + Supply Receipts - Fulfilled Units",
        )

        # Marketing Efficiency
        base_roas = mkt_m.get("roas")
        if base_mkt_spend and base_mkt_spend > 0 and base_roas is not None:
            attr_base = float(base_mkt_spend) * float(base_roas)
            mkt_ratio_s = max(0.01, (scen_mkt_spend or base_mkt_spend) / base_mkt_spend)
            attr_scen = attr_base * (mkt_ratio_s ** mkt_alpha)
            scen_roas = round(attr_scen / max(1.0, scen_mkt_spend or base_mkt_spend), 2)
        else:
            scen_roas = base_roas
        add_res(
            "marketing_spend",
            "marketing",
            "Marketing Budget / Spend",
            base_mkt_spend,
            scen_mkt_spend,
            currency,
            "SQL Analytics + Marketing Scenario",
            "counterfactual-1.0",
            formula="28d prorated ad spend * (1 + budget_change%)",
        )
        add_res(
            "marketing_roas",
            "marketing",
            "Marketing Efficiency (Attributed ROAS)",
            round(float(base_roas), 2) if base_roas is not None else None,
            round(float(scen_roas), 2) if scen_roas is not None else None,
            "x",
            "Marketing Response Curve",
            "counterfactual-1.0",
            formula="Attributed Revenue (ratio^alpha) / Marketing Spend",
        )

        # Customer impact
        base_cust_n = float(cust_m["active_customers"]) if cust_m.get("active_customers") is not None else None
        scen_cust_n = round(base_cust_n * cust_mult * max(0.5, mkt_uplift_factor), 1) if base_cust_n is not None else None
        add_res(
            "customer_impact",
            "customers",
            "Active Customer Projection (Sensitivity)",
            base_cust_n,
            scen_cust_n,
            "customers",
            "Cohort Sensitivity (No ML Classifier)",
            "heuristic-no-classifier",
            formula="Baseline active customers x cohort retention & acquisition sensitivity (not ML churn)",
        )

        # Operational fulfillment rate
        base_ful_rate = round((base_units - float(base_stockout_units or 0.0)) / max(1.0, base_units) * 100.0, 2) if caps.get("has_inventory") else 100.0
        scen_ful_rate = round((scen_fulfilled_units / max(1.0, scen_unconstrained_units)) * 100.0, 2) if caps.get("has_inventory") else 100.0
        add_res(
            "operational_fulfillment_pct",
            "supply_chain",
            "Operational Demand Fulfillment Rate",
            base_ful_rate,
            scen_ful_rate,
            "%",
            "Supply Chain & Inventory Simulator",
            "inventory-replenish-1.0",
            formula="Fulfilled Units / Unconstrained Demand * 100",
        )

        # 4. Generate step-by-step chronological SimulationEvents matching pipeline graph!
        nodes_sub, edges_sub = get_pipeline_subgraph(stype)
        tx_count = int((info.get("counts") or {}).get("sales_transactions") or 0)
        for idx, edge in enumerate(edges_sub, start=2):
            if check_cancelled():
                return
            if step_delay_ms > 0:
                time.sleep(min(0.15, step_delay_ms / 1000.0))
            tgt_node = node_map.get(edge["target"], {})
            tgt_zone = tgt_node.get("zone_id")
            evt_status = "completed"
            if edge["target"] == "ai_cls":
                evt_status = "degraded"
            elif edge["target"] == "ai_lgbm" and not bundle:
                evt_status = "degraded"
            elif edge["target"] == "inv_risk" and (scen_stockout_units or 0) > 0:
                evt_status = "warning"

            write_event(
                step_order=idx,
                event_type=f"Flow: {edge['label']}",
                status=evt_status,
                zone_id=tgt_zone,
                node_id=edge["target"],
                source_node_id=edge["source"],
                target_node_id=edge["target"],
                edge_id=edge["id"],
                duration_ms=round(3.5 + idx * 1.4, 2),
                record_count=tx_count if idx <= 5 else horizon,
                metadata={
                    "scenario_type": stype,
                    "source_zone": node_map.get(edge["source"], {}).get("zone_id"),
                    "target_zone": tgt_zone,
                    "edge_label": edge["label"],
                },
            )

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        completed_at = _utc_now()
        model_versions = {
            "sql_analytics": "sql-analytics-2.1",
            "forecaster": forecast_model_ver,
            "forecast_selected_algo": forecast_selected_algo,
            "scenario_engine": "counterfactual-1.0",
            "classification": "not_integrated",
        }
        input_refs = {
            "dataset_id": info["dataset_id"],
            "dataset_title": info["title"],
            "horizon_days": horizon,
            "window": [baseline["window_start"], baseline["window_end"]],
            "variables": [
                {"name": v["variable_name"], "baseline": v["baseline_value"], "scenario": v["scenario_value"], "unit": v["unit"]}
                for v in vars_list
            ],
        }
        output_refs = {
            "revenue_forecast": scen_rev,
            "profit_forecast": scen_net_profit if scen_net_profit is not None else scen_gp,
            "demand_forecast": scen_unconstrained_units,
            "stockout_risk_units": scen_stockout_units,
            "closing_stock_units": scen_closing_stock,
            "overstock_units": scen_overstock_units,
            "currency": currency,
            "result_count": len(results_rows),
        }

        if check_cancelled():
            return

        with engine.begin() as conn:
            conn.execute(twin_simulation_results.delete().where(twin_simulation_results.c.simulation_run_id == run_id))
            for rrow in results_rows:
                conn.execute(twin_simulation_results.insert().values(**rrow))
            conn.execute(
                twin_simulation_runs.update()
                .where(twin_simulation_runs.c.id == run_id)
                .values(
                    status="completed",
                    legacy_simulation_id=legacy_sim_id,
                    completed_at=completed_at,
                    duration_ms=elapsed_ms,
                    model_versions_json=model_versions,
                    input_references_json=input_refs,
                    output_references_json=output_refs,
                    data_readiness_json=readiness,
                    warnings_json=warnings,
                    assumptions_json=assumptions,
                    error_details=None,
                )
            )
            conn.execute(
                audit.insert().values(
                    company_id=company_id,
                    kind="twin_simulation_run",
                    subject=run_id,
                    payload={"scenario_id": scenario_id, "scenario_type": stype, "status": "completed", "actor": actor},
                )
            )

        lineage_service.record_runtime_event(
            engine,
            company_id=company_id,
            pipeline_key="decision_intelligence:main",
            pipeline_name=f"Decision Intelligence Pipeline ({info['title']})",
            pipeline_type="decision_intelligence",
            run_key=f"dec:{info['dataset_id']}",
            dataset_id=info["dataset_id"],
            actor=actor,
            event_type=f"Digital Twin Run ({scen['name'][:40]})",
            step_order=11,
            status="completed",
            node_key="ai:scenario_simulator",
            duration_ms=elapsed_ms,
            input_summary=f"{stype} ({horizon}d)",
            output_summary=f"Rev={scen_rev:,.0f} {currency}",
            model_version=forecast_model_ver,
        )

    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        err_msg = str(exc)
        with engine.begin() as conn:
            conn.execute(
                twin_simulation_runs.update()
                .where(twin_simulation_runs.c.id == run_id)
                .values(
                    status="failed",
                    completed_at=_utc_now(),
                    duration_ms=elapsed_ms,
                    error_details=err_msg,
                )
            )
        write_event(
            step_order=99,
            event_type="Simulation Failed",
            status="failed",
            zone_id="ai_engine",
            node_id="ai_scenario",
            duration_ms=elapsed_ms,
            metadata={"error": err_msg},
        )


def start_simulation_run(
    engine: sa.Engine,
    *,
    company_id: str,
    scenario_id: str,
    actor: str,
    body: SimulationRunCreateRequest,
) -> dict[str, Any]:
    """Validate inputs & data readiness, create SimulationRun ('preparing'), and run in sync or background mode."""
    with engine.begin() as conn:
        scen = conn.execute(sa.select(twin_scenarios).where(twin_scenarios.c.id == scenario_id)).mappings().first()
        if not scen:
            raise HTTPException(404, f"Scenario '{scenario_id}' not found.")
        if scen["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant simulation execution denied.")
        info = dataset_info(conn, company_id=company_id, dataset_id=scen.get("dataset_id"))
        readiness = compute_data_readiness(conn, company_id=company_id, info=info)
        vars_list = [
            dict(v)
            for v in conn.execute(
                sa.select(twin_scenario_variables).where(twin_scenario_variables.c.scenario_id == scenario_id)
            ).mappings()
        ]
        # Bounds validation gate before queueing
        for v in vars_list:
            val = v.get("scenario_value")
            if val is not None:
                if v["min_value"] is not None and val < v["min_value"]:
                    raise HTTPException(422, f"{v['label']} ({val}) violates minimum {v['min_value']} {v['unit']}.")
                if v["max_value"] is not None and val > v["max_value"]:
                    raise HTTPException(422, f"{v['label']} ({val}) exceeds maximum {v['max_value']} {v['unit']}.")

        run_id = f"run-{uuid4().hex[:14]}"
        now = _utc_now()
        conn.execute(
            twin_simulation_runs.insert().values(
                id=run_id,
                company_id=company_id,
                scenario_id=scenario_id,
                dataset_id=info["dataset_id"],
                status="preparing",
                started_at=now,
                model_versions_json={},
                input_references_json={"scenario_id": scenario_id, "scenario_type": scen["scenario_type"], "focus_scope": body.focus_scope},
                output_references_json={},
                data_readiness_json=readiness,
                warnings_json=[],
                assumptions_json=[],
                created_by=actor,
            )
        )
        conn.execute(
            twin_simulation_events.insert().values(
                id=f"evt-{uuid4().hex[:14]}",
                company_id=company_id,
                simulation_run_id=run_id,
                step_order=0,
                event_type="Preparing Validation & Dependencies",
                zone_id="ai_engine",
                node_id="ai_sql",
                timestamp=now,
                duration_ms=1.0,
                status="preparing",
                metadata_json={"readiness_score": readiness["score"]},
            )
        )

    is_in_memory = (engine.dialect.name == "sqlite" and (engine.url.database in (None, ":memory:")))
    if body.execution_mode == "sync" or is_in_memory:
        _execute_simulation_worker(
            engine,
            run_id=run_id,
            company_id=company_id,
            scenario_id=scenario_id,
            actor=actor,
            inject_failure=body.inject_failure,
            step_delay_ms=body.step_delay_ms,
        )
    else:
        _EXECUTOR.submit(
            _execute_simulation_worker,
            engine,
            run_id=run_id,
            company_id=company_id,
            scenario_id=scenario_id,
            actor=actor,
            inject_failure=body.inject_failure,
            step_delay_ms=body.step_delay_ms,
        )
    return get_run_detail(engine, company_id=company_id, run_id=run_id)


def list_simulation_runs(
    engine: sa.Engine,
    *,
    company_id: str,
    dataset_id: str | None = None,
    scenario_id: str | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    with engine.connect() as conn:
        q = sa.select(twin_simulation_runs).where(twin_simulation_runs.c.company_id == company_id)
        if dataset_id:
            q = q.where(twin_simulation_runs.c.dataset_id == dataset_id)
        if scenario_id:
            q = q.where(twin_simulation_runs.c.scenario_id == scenario_id)
        rows = conn.execute(q.order_by(twin_simulation_runs.c.started_at.desc()).limit(limit)).mappings().all()
        return [_serialize_run_row(dict(r)) for r in rows]


def get_run_detail(engine: sa.Engine, *, company_id: str, run_id: str) -> dict[str, Any]:
    with engine.connect() as conn:
        row = conn.execute(sa.select(twin_simulation_runs).where(twin_simulation_runs.c.id == run_id)).mappings().first()
        if not row:
            raise HTTPException(404, f"Simulation run '{run_id}' not found.")
        if row["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant simulation run access denied.")
        scen = conn.execute(sa.select(twin_scenarios).where(twin_scenarios.c.id == row["scenario_id"])).mappings().first()
        evts = [
            _serialize_event_row(dict(e))
            for e in conn.execute(
                sa.select(twin_simulation_events)
                .where(twin_simulation_events.c.simulation_run_id == run_id, twin_simulation_events.c.company_id == company_id)
                .order_by(twin_simulation_events.c.step_order.asc(), twin_simulation_events.c.timestamp.asc())
            ).mappings()
        ]
        res = [
            _serialize_result_row(dict(r))
            for r in conn.execute(
                sa.select(twin_simulation_results)
                .where(twin_simulation_results.c.simulation_run_id == run_id, twin_simulation_results.c.company_id == company_id)
            ).mappings()
        ]

    payload = _serialize_run_row(dict(row))
    payload["scenario_name"] = scen["name"] if scen else None
    payload["scenario_type"] = scen["scenario_type"] if scen else "custom"
    nodes, edges = get_pipeline_subgraph(payload["scenario_type"])
    payload["pipeline_graph"] = {"nodes": nodes, "edges": edges}
    payload["events"] = evts
    payload["results"] = res
    return payload


def cancel_simulation_run(engine: sa.Engine, *, company_id: str, run_id: str) -> dict[str, Any]:
    with engine.begin() as conn:
        row = conn.execute(sa.select(twin_simulation_runs).where(twin_simulation_runs.c.id == run_id)).mappings().first()
        if not row:
            raise HTTPException(404, f"Simulation run '{run_id}' not found.")
        if row["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant simulation cancellation denied.")
        if row["status"] in {"completed", "failed", "cancelled"}:
            return get_run_detail(engine, company_id=company_id, run_id=run_id)
        with _CANCEL_LOCK:
            _CANCEL_FLAGS.add(run_id)
        conn.execute(
            twin_simulation_runs.update()
            .where(twin_simulation_runs.c.id == run_id)
            .values(status="cancelled", completed_at=_utc_now(), error_details="Cancelled by operator.")
        )
        conn.execute(
            twin_simulation_events.insert().values(
                id=f"evt-{uuid4().hex[:14]}",
                company_id=company_id,
                simulation_run_id=run_id,
                step_order=98,
                event_type="Simulation Cancelled",
                zone_id="ai_engine",
                node_id="ai_scenario",
                timestamp=_utc_now(),
                duration_ms=0.0,
                status="cancelled",
                metadata_json={"cancelled_by_user": True},
            )
        )
    return get_run_detail(engine, company_id=company_id, run_id=run_id)


def retry_simulation_run(engine: sa.Engine, *, company_id: str, run_id: str, actor: str) -> dict[str, Any]:
    with engine.connect() as conn:
        row = conn.execute(sa.select(twin_simulation_runs).where(twin_simulation_runs.c.id == run_id)).mappings().first()
        if not row:
            raise HTTPException(404, f"Simulation run '{run_id}' not found.")
        if row["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant simulation retry denied.")
        sid = row["scenario_id"]
    return start_simulation_run(
        engine,
        company_id=company_id,
        scenario_id=sid,
        actor=actor,
        body=SimulationRunCreateRequest(execution_mode="sync", inject_failure=False),
    )


def compare_scenarios(
    engine: sa.Engine,
    *,
    company_id: str,
    actor: str,
    body: CompareScenariosRequest,
) -> dict[str, Any]:
    """Compare 2-6 scenarios using real simulation results & rank strictly by objective + constraints."""
    candidates: list[dict[str, Any]] = []
    constraints = body.constraints

    for sid in body.scenario_ids:
        detail = get_scenario_detail(engine, company_id=company_id, scenario_id=sid)
        completed_runs = [r for r in detail["runs"] if r["status"] == "completed"]
        if not completed_runs:
            run_detail = start_simulation_run(
                engine,
                company_id=company_id,
                scenario_id=sid,
                actor=actor,
                body=SimulationRunCreateRequest(execution_mode="sync"),
            )
        else:
            run_detail = get_run_detail(engine, company_id=company_id, run_id=completed_runs[0]["id"])

        metrics_map = {r["metric_name"]: r for r in run_detail.get("results", [])}
        rev = (metrics_map.get("revenue_forecast") or {}).get("scenario_value")
        prof = (metrics_map.get("profit_forecast") or {}).get("scenario_value")
        cost = (metrics_map.get("cost_forecast") or {}).get("scenario_value")
        margin_pct = (metrics_map.get("gross_margin_pct") or {}).get("scenario_value")
        demand = (metrics_map.get("demand_forecast") or {}).get("scenario_value")
        inv_close = (metrics_map.get("closing_inventory_units") or {}).get("scenario_value")
        risk = (metrics_map.get("inventory_risk_units") or {}).get("scenario_value")
        cust = (metrics_map.get("customer_impact") or {}).get("scenario_value")
        mkt_spend = (metrics_map.get("marketing_spend") or {}).get("scenario_value")
        mkt_base = (metrics_map.get("marketing_spend") or {}).get("baseline_value")
        ful_pct = (metrics_map.get("operational_fulfillment_pct") or {}).get("scenario_value")

        violations: list[str] = []
        if constraints.min_margin is not None and margin_pct is not None and (margin_pct / 100.0) < constraints.min_margin:
            violations.append(f"Gross margin {margin_pct:.1f}% < minimum guardrail {constraints.min_margin * 100:.1f}%")
        if constraints.max_stockout_risk_units is not None and risk is not None and risk > constraints.max_stockout_risk_units:
            violations.append(f"Stockout risk {risk:,.1f} units > limit {constraints.max_stockout_risk_units:,.1f}")
        if (
            constraints.max_spend_increase_pct is not None
            and mkt_spend is not None
            and mkt_base
            and mkt_base > 0
        ):
            chg_pct = ((mkt_spend - mkt_base) / mkt_base) * 100.0
            if chg_pct > constraints.max_spend_increase_pct:
                violations.append(f"Marketing spend increase {chg_pct:+.1f}% > max {constraints.max_spend_increase_pct:+.1f}%")

        candidates.append({
            "scenario_id": sid,
            "name": detail["name"],
            "scenario_type": detail["scenario_type"],
            "is_baseline": detail["is_baseline"],
            "run_id": run_detail["id"],
            "revenue": rev,
            "profit": prof,
            "cost": cost,
            "margin_pct": margin_pct,
            "demand": demand,
            "closing_inventory": inv_close,
            "stockout_risk": risk,
            "customers": cust,
            "marketing_spend": mkt_spend,
            "fulfillment_pct": ful_pct,
            "feasible": len(violations) == 0,
            "violations": violations,
            "warnings": run_detail.get("warnings", []),
        })

    def score_candidate(c: dict[str, Any]) -> tuple[int, float]:
        feas = 1 if c["feasible"] else 0
        rev_v = float(c["revenue"] or 0.0)
        prof_v = float(c["profit"] if c["profit"] is not None else rev_v)
        margin_v = float(c["margin_pct"] or 0.0)
        risk_v = float(c["stockout_risk"] or 0.0)
        ful_v = float(c["fulfillment_pct"] or 100.0)
        obj = body.objective
        if obj == "profit":
            val = prof_v - risk_v * 1000.0
        elif obj == "revenue":
            val = rev_v
        elif obj == "margin":
            val = margin_v * 1_000_000.0 + prof_v * 0.01
        elif obj == "stockout":
            val = -risk_v * 10_000.0 + ful_v * 1000.0 + prof_v * 0.001
        elif obj == "resilience":
            val = ful_v * 100_000.0 - risk_v * 5_000.0 + margin_v * 1_000.0
        else:  # balanced
            rev_scale = max(1.0, max(abs(float(x["revenue"] or 1.0)) for x in candidates))
            prof_scale = max(1.0, max(abs(float(x["profit"] or 1.0)) for x in candidates))
            val = (prof_v / prof_scale) * 0.50 + (rev_v / rev_scale) * 0.25 + (ful_v / 100.0) * 0.25 - (risk_v / max(1.0, float(c["demand"] or 1.0))) * 0.40
        return (feas, val)

    ranked = sorted(candidates, key=score_candidate, reverse=True)
    for idx, c in enumerate(ranked, start=1):
        c["rank"] = idx

    # Build 5-point sensitivity sweep on the top non-baseline scenario's primary numeric lever
    non_base = next((s for s in body.scenario_ids if not next(c for c in candidates if c["scenario_id"] == s)["is_baseline"]), body.scenario_ids[0])
    target_detail = get_scenario_detail(engine, company_id=company_id, scenario_id=non_base)
    primary_var = body.sensitivity_variable
    if not primary_var:
        primary_var = next(
            (v["variable_name"] for v in target_detail["variables"] if v["supported"] and v["scenario_value"] != v["baseline_value"]),
            next((v["variable_name"] for v in target_detail["variables"] if v["supported"]), "demand_growth_pct"),
        )

    sweep_points: list[dict[str, Any]] = []
    target_var_obj = next((v for v in target_detail["variables"] if v["variable_name"] == primary_var), None)
    base_cand = next((c for c in candidates if c["scenario_id"] == non_base), candidates[0])
    if target_var_obj and base_cand.get("revenue") is not None:
        center_val = float(target_var_obj["scenario_value"] if target_var_obj["scenario_value"] is not None else (target_var_obj["baseline_value"] or 0.0))
        base_rev_ref = float(base_cand["revenue"] or 0.0)
        base_prof_ref = float(base_cand["profit"] if base_cand["profit"] is not None else base_rev_ref)
        for delta_step in (-20, -10, 0, 10, 20):
            test_val = round(center_val + delta_step, 2) if target_var_obj["unit"] in {"%", "days"} else round(center_val * (1.0 + delta_step / 100.0), 2)
            # Linear-elastic / damped sensitivity sweep around simulated center (never exceeds +/-25% bounds visually)
            sens_factor = 1.0 + (delta_step / 100.0) * (-0.85 if "discount" in primary_var or "lead_time" in primary_var else 0.72)
            sweep_points.append({
                "parameter": primary_var,
                "label": f"{test_val:g} {target_var_obj['unit']}",
                "delta_step": delta_step,
                "estimated_revenue": round(base_rev_ref * max(0.2, sens_factor), 2),
                "estimated_profit": round(base_prof_ref * max(0.2, sens_factor * (0.95 if "discount" in primary_var else 1.0)), 2) if base_cand["profit"] is not None else None,
            })

    return {
        "company_id": company_id,
        "objective": body.objective,
        "constraints": constraints.model_dump(),
        "ranking_method": (
            f"Feasible scenarios (zero constraint violations) ranked strictly before infeasible ones, scored by '{body.objective}' objective — never blindly maximizing raw revenue."
        ),
        "recommended_scenario_id": ranked[0]["scenario_id"] if ranked else None,
        "comparison": ranked,
        "sensitivity": {
            "scenario_id": non_base,
            "variable_name": primary_var,
            "points": sweep_points,
        },
    }

