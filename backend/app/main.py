"""DecisionPilot HTTP API with Multi-Tenant Enterprise Ingestion, Multimodal Intelligence, and Decision Support."""
from contextlib import asynccontextmanager
import hmac
import hashlib
import json
import logging
import os
import re
import time
from datetime import date, timezone
from typing import Annotated, Literal

import sqlalchemy as sa
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from ai_service.llm_orchestrator import query
from backend.app import services
from backend.app.cache import invalidate_recs_cache
from backend.app.analytics import dataset_info, options
from backend.app.db import audit, companies, datasets, make_engine, read_connection, simulations, xai_recommendations
from backend.app.governance import service as governance_service
from backend.app.governance.hash_chain import append_audited_event, redact_secrets
from backend.app.governance.router import build_governance_router
from backend.app.investigation.router import build_investigation_router
from backend.app.ingestion import service as ingestion_service
from backend.app.ingestion.router import build_ingestion_router
from backend.app.ingestion.storage import ObjectStorage, get_object_storage
from backend.app.lineage import service as lineage_service
from backend.app.lineage.router import build_lineage_router
from backend.app.multimodal import service as multimodal_service
from backend.app.multimodal.router import build_multimodal_router
from backend.app.rag.router import build_rag_router
from backend.app.simulator.router import build_simulator_router
from backend.app.schemas import Feedback, Filters, ForecastRequest, Question, QueryResponse, ScenarioRequest, ScenarioFeedback
from backend.app.security import authorize_company, credentials, identify
from scripts.pipeline import LIMIT_BYTES, SnapshotConflict, load_snapshot, read_upload

log = logging.getLogger(__name__)
SIGNED_CONTENT_PATH_RX = re.compile(r"^(/api)?/v1/files/[A-Za-z0-9._-]+/content$")


def _tenant_ids(request: Request) -> tuple[str, str | None]:
    identity = getattr(request.state, "identity", None) or {
        "company_ids": ["comp-default"],
        "default_company_id": "comp-default",
    }
    raw_company = request.headers.get("x-company-id") or request.query_params.get("company_id")
    try:
        cid = authorize_company(identity, raw_company)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    raw_ds = request.headers.get("x-dataset-id") or request.query_params.get("dataset_id")
    ds_id = raw_ds.strip() if raw_ds and raw_ds.strip() else None
    return cid, ds_id


def history(conn, limit, kind=None, before=None, company_id="comp-default"):
    statement = sa.select(audit).where(audit.c.company_id == company_id).order_by(audit.c.id.desc()).limit(limit)
    if kind == "decisions":
        statement = statement.where(
            audit.c.kind.in_(
                ["recommendation_feedback", "scenario_feedback", "recommendation_action", "recommendation_outcome"]
            )
        )
    elif kind:
        statement = statement.where(audit.c.kind == kind)
    if before is not None:
        statement = statement.where(audit.c.id < before)
    rows = [dict(row) for row in conn.execute(statement).mappings()]
    for row in rows:
        occurred_at = row["occurred_at"]
        if occurred_at.tzinfo is None:
            row["occurred_at"] = occurred_at.replace(tzinfo=timezone.utc)
        row["payload"] = redact_secrets(row.get("payload") or {})
    return rows


def lock_workspace(conn):
    if conn.dialect.name == "postgresql":
        conn.exec_driver_sql("SELECT pg_advisory_xact_lock(177480102)")
    else:
        conn.exec_driver_sql("BEGIN IMMEDIATE")


def latest_decision(conn, kind, subject, dataset_id, company_id="comp-default"):
    statement = sa.select(audit.c.id, audit.c.payload).where(
        audit.c.company_id == company_id,
        audit.c.kind == kind, audit.c.subject == subject,
        audit.c.payload["dataset_id"].as_string() == dataset_id).order_by(audit.c.id.desc()).limit(1)
    return conn.execute(statement).first()


def create_app(engine=None, storage: ObjectStorage | None = None):
    engine = engine if engine is not None else make_engine()
    store = storage or get_object_storage()
    job_queue = multimodal_service.create_job_queue(engine, store)
    access = credentials()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        try:
            yield
        finally:
            job_queue.shutdown(wait=True)

    app = FastAPI(
        root_path=os.getenv("ROOT_PATH", "/api"),
        title="DecisionPilot AI",
        version="2.1.0",
        description="Multi-tenant Enterprise Business Intelligence, Multimodal Data Ingestion, and Decision Support.",
        lifespan=lifespan,
    )
    app.state.storage = store
    app.state.multimodal_job_queue = job_queue

    @app.middleware("http")
    async def workspace_access(request: Request, call_next):
        identity = identify(request.headers.get("authorization"), access)
        if request.url.path == "/health" and access and identity is None:
            try:
                with read_connection(engine) as conn:
                    conn.execute(sa.select(1))
                return JSONResponse(content={"status": "ok"})
            except sa.exc.SQLAlchemyError:
                return JSONResponse(status_code=503, content={"status": "unavailable"})

        # Allow browser media tags (<img/audio/video src="...?token=...">) when cryptographically verified by the /content endpoint
        is_signed_media = (
            identity is None
            and request.method == "GET"
            and bool(request.query_params.get("token"))
            and bool(SIGNED_CONTENT_PATH_RX.match(request.url.path))
        )
        if identity is None and not is_signed_media:
            return JSONResponse(status_code=401, content={"detail": "Sign in with a workspace access token."},
                                headers={"WWW-Authenticate": "Bearer"})
        request.state.identity = identity
        if identity is not None:
            required = "admin" if request.url.path == "/import" else "analyst" if request.url.path.endswith("/feedback") else "viewer"
            if {"viewer": 0, "analyst": 1, "admin": 2}[identity["role"]] < {"viewer": 0, "analyst": 1, "admin": 2}[required]:
                return JSONResponse(status_code=403, content={"detail": "Your workspace role cannot perform this action."})
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        if not is_signed_media:
            response.headers["Cache-Control"] = "no-store"
        return response

    ingestion_router = build_ingestion_router(engine, storage=store)
    multimodal_router = build_multimodal_router(engine, storage=store, job_queue=job_queue)
    rag_router = build_rag_router(engine)
    lineage_router = build_lineage_router(engine)
    simulator_router = build_simulator_router(engine)
    governance_router = build_governance_router(engine)
    investigation_router = build_investigation_router(engine)
    app.include_router(ingestion_router, prefix="/v1")
    app.include_router(ingestion_router, prefix="/api/v1", include_in_schema=False)
    app.include_router(multimodal_router, prefix="/v1")
    app.include_router(multimodal_router, prefix="/api/v1", include_in_schema=False)
    app.include_router(rag_router, prefix="/v1")
    app.include_router(rag_router, prefix="/api/v1", include_in_schema=False)
    app.include_router(simulator_router, prefix="/v1")
    app.include_router(simulator_router, prefix="/api/v1", include_in_schema=False)
    app.include_router(governance_router, prefix="/v1")
    app.include_router(governance_router, prefix="/api/v1", include_in_schema=False)
    app.include_router(investigation_router, prefix="/v1")
    app.include_router(investigation_router, prefix="/api/v1", include_in_schema=False)
    app.include_router(lineage_router)
    app.include_router(lineage_router, prefix="/api", include_in_schema=False)

    @app.get("/session")
    def session(request: Request):
        return {**request.state.identity, "authentication": "token" if access else "local",
                "import_enabled": os.getenv("DEMO_ALLOW_IMPORT", "false").lower() == "true" and bool(os.getenv("IMPORT_TOKEN"))}

    @app.exception_handler(sa.exc.SQLAlchemyError)
    async def sql_error(request, exc):
        log.error("Database error for %s (%s)",request.url.path,type(exc).__name__)
        return JSONResponse(status_code=503,content={"detail":"Database operation failed. Retry or check service health."})

    @app.exception_handler(ValidationError)
    async def domain_validation(request, exc):
        return JSONResponse(status_code=422,content={"detail":"Validated business intent is incompatible with the requested scope."})

    @app.get("/health")
    def health(request: Request):
        try:
            cid, ds_id = _tenant_ids(request)
            with read_connection(engine) as conn:
                conn.execute(sa.select(1))
                try:
                    info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
                except HTTPException:
                    info = None
            model = services.artifact(info) if info else None
            return dict(status="ok",database="ok",database_dialect=engine.dialect.name,dataset_ready=bool(info),
                        model_ready=bool(model),model_version=model["version"] if model else None,
                        company_id=cid)
        except sa.exc.SQLAlchemyError:
            return JSONResponse(status_code=503,content={"status":"unavailable","database":"unavailable","model_ready":False})

    @app.get("/dataset")
    def dataset(request: Request):
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            return dataset_info(conn, company_id=cid, dataset_id=ds_id)

    @app.get("/options")
    def available_filters(request: Request):
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
            return options(conn, info=info)

    @app.get("/models/quality")
    def quality(request: Request):
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            return services.model_quality(dataset_info(conn, company_id=cid, dataset_id=ds_id))

    @app.get("/kpi/summary")
    def kpi(filters: Annotated[Filters,Query()], request: Request):
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            return services.dashboard(conn,dataset_info(conn, company_id=cid, dataset_id=ds_id),filters)

    @app.post("/query",response_model=QueryResponse)
    def ask(question: Question, request: Request):
        t0 = time.perf_counter()
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
            result = query(conn,info,question)
        with engine.begin() as conn:
            append_audited_event(
                conn,
                company_id=info["company_id"],
                kind="query",
                subject=result["trace"]["tool"],
                payload={
                    **jsonable_encoder(result["trace"]),
                    "actor": request.state.identity["actor"],
                    "dataset_id": info["dataset_id"],
                },
            )
        lineage_service.record_runtime_event(
            engine,
            company_id=info["company_id"],
            pipeline_key="decision_intelligence:main",
            pipeline_name=f"Decision Intelligence Pipeline ({info['title']})",
            pipeline_type="decision_intelligence",
            run_key=f"dec:{info['dataset_id']}",
            dataset_id=info["dataset_id"],
            actor=request.state.identity["actor"],
            event_type=f"Analytics Query ({result['trace']['tool']})",
            step_order=12,
            status="completed",
            node_key="ai:llm_orchestrator",
            duration_ms=round((time.perf_counter() - t0) * 1000.0, 2),
            input_summary=question.question[:120],
            output_summary=f"Tool: {result['trace']['tool']}",
        )
        return result

    @app.get("/anomalies")
    def anomalies(request: Request, start: date | None=None, end: date | None=None,
                  severity: Literal["critical","high","medium"] | None=None,
                  limit: Annotated[int,Query(ge=1,le=100)]=40):
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            rows = services.alerts(conn,dataset_info(conn, company_id=cid, dataset_id=ds_id),start,end)
        return {"rows":[r for r in rows if not severity or r["severity"]==severity][:limit],"result_type":"observed alerts"}

    @app.get("/anomalies/{alert_id}")
    def anomaly_detail(alert_id: str, request: Request, start: date | None=None, end: date | None=None):
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
            alert = next((a for a in services.alerts(conn,info,start,end) if a["id"]==alert_id),None)
            if alert is None:
                raise HTTPException(404,"Alert is outside the requested date range.")
            return services.alert_detail(conn,info,alert)

    @app.post("/forecast")
    def forecast(request_body: ForecastRequest, request: Request):
        t0 = time.perf_counter()
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
            res = services.forecast(conn,info,request_body)
        lineage_service.record_runtime_event(
            engine,
            company_id=info["company_id"],
            pipeline_key="decision_intelligence:main",
            pipeline_name=f"Decision Intelligence Pipeline ({info['title']})",
            pipeline_type="decision_intelligence",
            run_key=f"dec:{info['dataset_id']}",
            dataset_id=info["dataset_id"],
            actor=request.state.identity["actor"],
            event_type=f"Forecast Executed ({request_body.target}, {request_body.horizon}d)",
            step_order=10,
            status="completed",
            node_key="ai:lightgbm_forecaster",
            duration_ms=round((time.perf_counter() - t0) * 1000.0, 2),
            input_summary=f"Target={request_body.target}, Horizon={request_body.horizon}d",
            output_summary=f"Model={res.get('model', 'LightGBM')}, AsOf={res.get('data_as_of')}",
            model_version=str(res.get("model_version") or res.get("model") or "lightgbm"),
        )
        return res

    @app.post("/simulate")
    def simulate(request_body: ScenarioRequest, request: Request):
        t0 = time.perf_counter()
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
            result = services.simulate(conn,info,request_body)
        payload = jsonable_encoder({"request": request_body.model_dump(), "result": result})
        simulation_id = hashlib.sha256(json.dumps({"company_id": info["company_id"], "dataset_id": info["dataset_id"], **payload},
            sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
        with engine.begin() as conn:
            lock_workspace(conn)
            if dataset_info(conn, company_id=cid, dataset_id=ds_id)["dataset_id"] != info["dataset_id"]:
                raise HTTPException(409, "Dataset changed during simulation. Run it again.")
            if not conn.scalar(sa.select(simulations.c.id).where(simulations.c.id == simulation_id)):
                conn.execute(simulations.insert().values(id=simulation_id, company_id=info["company_id"], dataset_id=info["dataset_id"], payload=payload))
            latest = latest_decision(conn, "scenario_feedback", simulation_id, info["dataset_id"], company_id=info["company_id"])
        lineage_service.record_runtime_event(
            engine,
            company_id=info["company_id"],
            pipeline_key="decision_intelligence:main",
            pipeline_name=f"Decision Intelligence Pipeline ({info['title']})",
            pipeline_type="decision_intelligence",
            run_key=f"dec:{info['dataset_id']}",
            dataset_id=info["dataset_id"],
            actor=request.state.identity["actor"],
            event_type=f"Scenario Simulated ({request_body.type})",
            step_order=11,
            status="completed",
            node_key="ai:scenario_simulator",
            duration_ms=round((time.perf_counter() - t0) * 1000.0, 2),
            input_summary=f"Type={request_body.type}, Horizon={request_body.horizon}d",
            output_summary=f"Recommended={result.get('recommended', {}).get('name', 'alternative')}",
        )
        return {**result, "simulation_id": simulation_id, "dataset_id": info["dataset_id"],
                "decision": latest.payload["decision"] if latest else "pending"}

    @app.post("/scenarios/feedback")
    def scenario_feedback(body: ScenarioFeedback, request: Request):
        cid, ds_id = _tenant_ids(request)
        actor = request.state.identity["actor"]
        ds_title = body.dataset_id
        with engine.begin() as conn:
            lock_workspace(conn)
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
            ds_title = info["title"]
            if info["dataset_id"] != body.dataset_id:
                raise HTTPException(409, "Dataset changed. Run the scenario again before deciding.")
            run = conn.execute(sa.select(simulations).where(simulations.c.id == body.simulation_id)).mappings().first()
            if not run or run["dataset_id"] != body.dataset_id or run["company_id"] != cid:
                raise HTTPException(404, "Run this scenario before recording a decision.")
            recommendation = None
            if body.recommendation_id:
                xrow = conn.execute(
                    sa.select(xai_recommendations.c.legacy_payload_json).where(
                        xai_recommendations.c.company_id == cid,
                        xai_recommendations.c.dataset_id == body.dataset_id,
                        sa.or_(
                            xai_recommendations.c.rec_key == body.recommendation_id,
                            xai_recommendations.c.id == body.recommendation_id,
                        ),
                    )
                ).mappings().first()
                if xrow and xrow["legacy_payload_json"]:
                    recommendation = xrow["legacy_payload_json"]
                else:
                    recommendation = next((r for r in services.recommendations(conn, info) if r["id"] == body.recommendation_id), None)
                if recommendation is None:
                    raise HTTPException(404, "Recommendation is no longer available.")
            latest = latest_decision(conn, "scenario_feedback", body.simulation_id, body.dataset_id, company_id=cid)
            if latest and latest.payload["decision"] == body.decision:
                event_id = latest.id
            else:
                event_id, _ = append_audited_event(
                    conn,
                    company_id=cid,
                    kind="scenario_feedback",
                    subject=body.simulation_id,
                    payload={
                        **body.model_dump(exclude={"recommendation_id"}),
                        "actor": actor,
                        "request": run["payload"]["request"],
                        "recommended": run["payload"]["result"]["recommended"],
                    },
                )
            if recommendation:
                # Same transaction: the recommendation card and the scenario decision never disagree.
                linked = latest_decision(conn, "recommendation_feedback", body.recommendation_id, body.dataset_id, company_id=cid)
                if not (linked and linked.payload["decision"] == body.decision):
                    linked_eid, _ = append_audited_event(
                        conn,
                        company_id=cid,
                        kind="recommendation_feedback",
                        subject=body.recommendation_id,
                        payload={
                            "dataset_id": body.dataset_id,
                            "decision": body.decision,
                            "actor": actor,
                            "recommendation": recommendation,
                            "simulation_id": body.simulation_id,
                        },
                    )
                    governance_service.sync_legacy_feedback_decision(
                        conn,
                        company_id=cid,
                        dataset_id=body.dataset_id,
                        rec_key=body.recommendation_id,
                        decision=body.decision,
                        actor=actor,
                        audit_event_id=linked_eid,
                    )
        lineage_service.record_runtime_event(
            engine,
            company_id=cid,
            pipeline_key="decision_intelligence:main",
            pipeline_name=f"Decision Intelligence Pipeline ({ds_title})",
            pipeline_type="decision_intelligence",
            run_key=f"dec:{body.dataset_id}",
            dataset_id=body.dataset_id,
            actor=actor,
            event_type=f"Scenario Decision ({body.decision})",
            step_order=13,
            status="completed",
            node_key="output:recommendations_decisions",
            input_summary=f"Simulation {body.simulation_id[:12]}",
            output_summary=f"Human Decision={body.decision}",
        )
        return {"id": event_id, "decision": body.decision, "status": "recorded"}

    @app.get("/recommendations")
    def recommendations(request: Request):
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
            rows = services.recommendations(conn,info)
            decisions = {}
            for row in rows:
                latest = latest_decision(conn, "recommendation_feedback", row["id"], info["dataset_id"], company_id=cid)
                if latest:
                    decisions[row["id"]] = latest.payload["decision"]
        for row in rows:
            row["decision"] = decisions.get(row["id"],"pending")
        return {"rows":rows,"dataset_id":info["dataset_id"],"result_type":"business recommendation"}

    @app.post("/recommendations/feedback")
    def feedback(body: Feedback, http_request: Request):
        cid, ds_id = _tenant_ids(http_request)
        actor = http_request.state.identity["actor"]
        ds_title = body.dataset_id
        with engine.begin() as conn:
            lock_workspace(conn)
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
            ds_title = info["title"]
            if info["dataset_id"]!=body.dataset_id:
                raise HTTPException(409,"The dataset changed. Review the latest recommendation.")
            xrow = conn.execute(
                sa.select(xai_recommendations.c.legacy_payload_json).where(
                    xai_recommendations.c.company_id == cid,
                    xai_recommendations.c.dataset_id == body.dataset_id,
                    sa.or_(
                        xai_recommendations.c.rec_key == body.recommendation_id,
                        xai_recommendations.c.id == body.recommendation_id,
                    ),
                )
            ).mappings().first()
            if xrow and xrow["legacy_payload_json"]:
                recommendation = xrow["legacy_payload_json"]
            else:
                recommendation = next((r for r in services.recommendations(conn,info) if r["id"] == body.recommendation_id), None)
            if recommendation is None:
                raise HTTPException(404,"Recommendation is no longer available.")
            latest = latest_decision(conn, "recommendation_feedback", body.recommendation_id, body.dataset_id, company_id=cid)
            if latest and latest.payload["decision"]==body.decision:
                return {"id":latest.id,"decision":body.decision,"status":"recorded"}
            rec_event_id, _ = append_audited_event(
                conn,
                company_id=cid,
                kind="recommendation_feedback",
                subject=body.recommendation_id,
                payload={
                    "dataset_id": body.dataset_id,
                    "decision": body.decision,
                    "actor": actor,
                    "recommendation": recommendation,
                },
            )
            governance_service.sync_legacy_feedback_decision(
                conn,
                company_id=cid,
                dataset_id=body.dataset_id,
                rec_key=body.recommendation_id,
                decision=body.decision,
                actor=actor,
                audit_event_id=rec_event_id,
            )
        lineage_service.record_runtime_event(
            engine,
            company_id=cid,
            pipeline_key="decision_intelligence:main",
            pipeline_name=f"Decision Intelligence Pipeline ({ds_title})",
            pipeline_type="decision_intelligence",
            run_key=f"dec:{body.dataset_id}",
            dataset_id=body.dataset_id,
            actor=actor,
            event_type=f"Recommendation Decision ({body.decision})",
            step_order=13,
            status="completed",
            node_key="output:recommendations_decisions",
            input_summary=f"Recommendation {body.recommendation_id}",
            output_summary=f"Human Decision={body.decision}",
        )
        return {"id":rec_event_id,"decision":body.decision,"status":"recorded"}

    @app.get("/audit")
    def audit_log(request: Request,
                  limit: Annotated[int,Query(ge=1,le=100)]=25,
                  kind: Literal[
                      "query",
                      "dataset_loaded",
                      "recommendation_feedback",
                      "scenario_feedback",
                      "decisions",
                      "recommendation_action",
                      "recommendation_outcome",
                      "recommendation_generated",
                      "risk_resolved",
                      "company_created",
                      "dataset_deleted",
                      "data_source_registered",
                      "multimodal_uploaded",
                      "multimodal_approved",
                      "multimodal_deleted",
                      "connector_synced",
                      "sql_query",
                      "sql_blocked",
                      "rag_ingested",
                      "rag_deleted",
                      "prompt_injection_blocked",
                      "twin_scenario_created",
                      "twin_simulation_run",
                  ] | None=None,
                  before: Annotated[int | None, Query(ge=1)]=None):
        cid, _ = _tenant_ids(request)
        with read_connection(engine) as conn:
            rows = history(conn,limit+1,kind,before,company_id=cid)
            return {"rows": rows[:limit], "next_before": rows[limit-1]["id"] if len(rows)>limit else None}

    @app.post("/import")
    async def import_snapshot(request: Request, filename: Annotated[str,Query(min_length=1,max_length=150)],
                              expected_dataset_id: Annotated[str,Query(pattern=r"^(empty|[a-f0-9]{24})$")],
                              x_import_token: Annotated[str | None,Header()]=None):
        token = os.getenv("IMPORT_TOKEN","")
        if os.getenv("DEMO_ALLOW_IMPORT","false").lower()!="true" or not token:
            raise HTTPException(403,"Snapshot replacement is disabled.")
        if not hmac.compare_digest((x_import_token or "").encode(),token.encode()):
            raise HTTPException(403,"Invalid import token.")
        content = bytearray()
        async for chunk in request.stream():
            if len(content)+len(chunk)>LIMIT_BYTES:
                raise HTTPException(413,"Upload exceeds 40 MiB.")
            content.extend(chunk)
        from starlette.concurrency import run_in_threadpool

        def process():
            data = read_upload(content,filename)
            info = load_snapshot(engine,data,{"kind":"imported","title":"Imported business snapshot",
                "currency":"VND","timezone":"Asia/Ho_Chi_Minh"},expected_id=expected_dataset_id,
                actor=request.state.identity["actor"])
            with engine.begin() as conn:
                ingestion_service.sync_default_legacy_dataset(conn, "comp-default")
            invalidate_recs_cache("comp-default")
            return info

        try:
            return await run_in_threadpool(process)
        except SnapshotConflict as exc:
            raise HTTPException(409,str(exc)) from exc
        except (ValueError,sa.exc.IntegrityError) as exc:
            raise HTTPException(422,str(exc) if isinstance(exc,ValueError) else "Snapshot violates database constraints.") from exc

    return app


app = create_app()
