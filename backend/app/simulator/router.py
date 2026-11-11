"""FastAPI Router for the Interactive 3D Business Scenario Simulator (Digital Twin APIs)."""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
import sqlalchemy as sa

from backend.app.analytics import dataset_info
from backend.app.ingestion.router import require_role, resolve_tenant
from backend.app.simulator import advisor, baseline, engine as sim_engine
from backend.app.simulator.schemas import (
    CompareScenariosRequest,
    RecommendRequest,
    ScenarioCreateRequest,
    ScenarioUpdateRequest,
    ScenarioVariablesPatchRequest,
    SimulationRunCreateRequest,
)


def build_simulator_router(engine: sa.Engine) -> APIRouter:
    router = APIRouter(prefix="/twin", tags=["Interactive 3D Business Scenario Simulator"])

    @router.get("/workspace")
    def get_twin_workspace(
        request: Request,
        dataset_id: str | None = None,
        horizon_days: Annotated[int, Query(ge=7, le=90)] = 30,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        ds_id = dataset_id or (x_dataset_id.strip() if x_dataset_id and x_dataset_id.strip() else None)
        return sim_engine.get_workspace_payload(
            engine,
            company_id=cid,
            dataset_id=ds_id,
            actor=identity["actor"],
            horizon_days=horizon_days,
        )

    @router.post("/scenarios/baseline")
    def ensure_baseline_scenario(
        request: Request,
        dataset_id: str | None = None,
        force_refresh: bool = False,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        ds_id = dataset_id or (x_dataset_id.strip() if x_dataset_id and x_dataset_id.strip() else None)
        with engine.connect() as conn:
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
        row = baseline.get_or_create_baseline_scenario(
            engine,
            company_id=cid,
            info=info,
            actor=identity["actor"],
            force_refresh=force_refresh,
        )
        return sim_engine.get_scenario_detail(engine, company_id=cid, scenario_id=row["id"])

    @router.get("/scenarios")
    def list_scenarios(
        request: Request,
        dataset_id: str | None = None,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        ds_id = dataset_id or (x_dataset_id.strip() if x_dataset_id and x_dataset_id.strip() else None)
        items = sim_engine.list_scenarios(engine, company_id=cid, dataset_id=ds_id)
        return {"company_id": cid, "items": items, "count": len(items)}

    @router.post("/scenarios", status_code=201)
    def create_scenario(
        body: ScenarioCreateRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        if not body.dataset_id and x_dataset_id and x_dataset_id.strip():
            body.dataset_id = x_dataset_id.strip()
        return sim_engine.create_scenario(engine, company_id=cid, actor=identity["actor"], body=body)

    @router.get("/scenarios/{scenario_id}")
    def get_scenario(
        scenario_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return sim_engine.get_scenario_detail(engine, company_id=cid, scenario_id=scenario_id)

    @router.patch("/scenarios/{scenario_id}")
    def update_scenario(
        scenario_id: str,
        body: ScenarioUpdateRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return sim_engine.update_scenario(engine, company_id=cid, scenario_id=scenario_id, body=body)

    @router.delete("/scenarios/{scenario_id}")
    def delete_scenario(
        scenario_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return sim_engine.delete_scenario(engine, company_id=cid, scenario_id=scenario_id)

    @router.patch("/scenarios/{scenario_id}/variables")
    def patch_variables(
        scenario_id: str,
        body: ScenarioVariablesPatchRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return sim_engine.patch_scenario_variables(engine, company_id=cid, scenario_id=scenario_id, body=body)

    @router.post("/scenarios/{scenario_id}/runs")
    def start_run(
        scenario_id: str,
        body: SimulationRunCreateRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        run = sim_engine.start_simulation_run(
            engine,
            company_id=cid,
            scenario_id=scenario_id,
            actor=identity["actor"],
            body=body,
        )
        code = 202 if run["status"] in {"preparing", "queued", "running"} else 201
        return JSONResponse(status_code=code, content=run)

    @router.get("/runs")
    def list_runs(
        request: Request,
        dataset_id: str | None = None,
        scenario_id: str | None = None,
        limit: Annotated[int, Query(ge=1, le=100)] = 30,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        items = sim_engine.list_simulation_runs(
            engine,
            company_id=cid,
            dataset_id=dataset_id,
            scenario_id=scenario_id,
            limit=limit,
        )
        return {"company_id": cid, "items": items, "count": len(items)}

    @router.get("/runs/{run_id}")
    def get_run(
        run_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return sim_engine.get_run_detail(engine, company_id=cid, run_id=run_id)

    @router.get("/runs/{run_id}/events")
    def get_run_events(
        run_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        run = sim_engine.get_run_detail(engine, company_id=cid, run_id=run_id)
        return {
            "run_id": run_id,
            "status": run["status"],
            "events": run["events"],
            "pipeline_graph": run["pipeline_graph"],
        }

    @router.post("/runs/{run_id}/cancel")
    def cancel_run(
        run_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return sim_engine.cancel_simulation_run(engine, company_id=cid, run_id=run_id)

    @router.post("/runs/{run_id}/retry")
    def retry_run(
        run_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return sim_engine.retry_simulation_run(engine, company_id=cid, run_id=run_id, actor=identity["actor"])

    @router.post("/compare")
    def compare_scenarios(
        body: CompareScenariosRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return sim_engine.compare_scenarios(engine, company_id=cid, actor=identity["actor"], body=body)

    @router.post("/runs/{run_id}/recommend")
    def recommend_for_run(
        run_id: str,
        body: RecommendRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return advisor.generate_run_recommendation(
            engine,
            company_id=cid,
            run_id=run_id,
            role=identity["role"],
            language=body.language,
            custom_focus=body.custom_focus,
        )

    @router.get("/runs/{run_id}/export")
    def export_run(
        run_id: str,
        request: Request,
        format: Literal["json", "csv"] = "json",
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        content, media_type, filename = advisor.export_run_report(engine, company_id=cid, run_id=run_id, fmt=format)
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return router

