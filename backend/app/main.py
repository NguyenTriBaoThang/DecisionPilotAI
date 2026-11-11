"""DecisionPilot HTTP API with Multi-Tenant Enterprise Ingestion, Multimodal Intelligence, and Decision Support."""
from contextlib import asynccontextmanager
import hmac
import hashlib
import json
import logging
import os
import re
from datetime import date, timezone
from typing import Annotated, Literal

import sqlalchemy as sa
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from ai_service.llm_orchestrator import query
from backend.app import services
from backend.app.analytics import dataset_info, options
from backend.app.db import audit, companies, datasets, make_engine, read_connection, simulations
from backend.app.ingestion import service as ingestion_service
from backend.app.ingestion.router import build_ingestion_router
from backend.app.ingestion.storage import ObjectStorage, get_object_storage
from backend.app.multimodal import service as multimodal_service
from backend.app.multimodal.router import build_multimodal_router
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
        statement = statement.where(audit.c.kind.in_(["recommendation_feedback", "scenario_feedback"]))
    elif kind:
        statement = statement.where(audit.c.kind==kind)
    if before is not None:
        statement = statement.where(audit.c.id < before)
    rows = [dict(row) for row in conn.execute(statement).mappings()]
    for row in rows:
        occurred_at = row["occurred_at"]
        if occurred_at.tzinfo is None:
            row["occurred_at"] = occurred_at.replace(tzinfo=timezone.utc)
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
    app.include_router(ingestion_router, prefix="/v1")
    app.include_router(ingestion_router, prefix="/api/v1", include_in_schema=False)
    app.include_router(multimodal_router, prefix="/v1")
    app.include_router(multimodal_router, prefix="/api/v1", include_in_schema=False)

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
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
            result = query(conn,info,question)
        with engine.begin() as conn:
            conn.execute(audit.insert().values(company_id=info["company_id"],kind="query",subject=result["trace"]["tool"],
                                               payload={**jsonable_encoder(result["trace"]), "actor": request.state.identity["actor"], "dataset_id": info["dataset_id"]}))
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
        cid, ds_id = _tenant_ids(request)
        with read_connection(engine) as conn:
            return services.forecast(conn,dataset_info(conn, company_id=cid, dataset_id=ds_id),request_body)

    @app.post("/simulate")
    def simulate(request_body: ScenarioRequest, request: Request):
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
        return {**result, "simulation_id": simulation_id, "dataset_id": info["dataset_id"],
                "decision": latest.payload["decision"] if latest else "pending"}

    @app.post("/scenarios/feedback")
    def scenario_feedback(body: ScenarioFeedback, request: Request):
        cid, ds_id = _tenant_ids(request)
        with engine.begin() as conn:
            lock_workspace(conn)
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
            if info["dataset_id"] != body.dataset_id:
                raise HTTPException(409, "Dataset changed. Run the scenario again before deciding.")
            run = conn.execute(sa.select(simulations).where(simulations.c.id == body.simulation_id)).mappings().first()
            if not run or run["dataset_id"] != body.dataset_id or run["company_id"] != cid:
                raise HTTPException(404, "Run this scenario before recording a decision.")
            recommendation = None
            if body.recommendation_id:
                recommendation = next((r for r in services.recommendations(conn, info) if r["id"] == body.recommendation_id), None)
                if recommendation is None:
                    raise HTTPException(404, "Recommendation is no longer available.")
            actor = request.state.identity["actor"]
            latest = latest_decision(conn, "scenario_feedback", body.simulation_id, body.dataset_id, company_id=cid)
            if latest and latest.payload["decision"] == body.decision:
                event_id = latest.id
            else:
                event_id = conn.execute(audit.insert().values(company_id=cid, kind="scenario_feedback", subject=body.simulation_id,
                    payload={**body.model_dump(exclude={"recommendation_id"}), "actor": actor,
                             "request": run["payload"]["request"], "recommended": run["payload"]["result"]["recommended"]})).inserted_primary_key[0]
            if recommendation:
                # Same transaction: the recommendation card and the scenario decision never disagree.
                linked = latest_decision(conn, "recommendation_feedback", body.recommendation_id, body.dataset_id, company_id=cid)
                if not (linked and linked.payload["decision"] == body.decision):
                    conn.execute(audit.insert().values(company_id=cid, kind="recommendation_feedback", subject=body.recommendation_id,
                        payload={"dataset_id": body.dataset_id, "decision": body.decision, "actor": actor,
                                 "recommendation": recommendation, "simulation_id": body.simulation_id}))
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
        with engine.begin() as conn:
            lock_workspace(conn)
            info = dataset_info(conn, company_id=cid, dataset_id=ds_id)
            if info["dataset_id"]!=body.dataset_id:
                raise HTTPException(409,"The dataset changed. Review the latest recommendation.")
            recommendation = next((r for r in services.recommendations(conn,info) if r["id"] == body.recommendation_id), None)
            if recommendation is None:
                raise HTTPException(404,"Recommendation is no longer available.")
            latest = latest_decision(conn, "recommendation_feedback", body.recommendation_id, body.dataset_id, company_id=cid)
            if latest and latest.payload["decision"]==body.decision:
                return {"id":latest.id,"decision":body.decision,"status":"recorded"}
            result = conn.execute(audit.insert().values(company_id=cid, kind="recommendation_feedback",subject=body.recommendation_id,
                payload={"dataset_id":body.dataset_id,"decision":body.decision,
                         "actor": http_request.state.identity["actor"], "recommendation": recommendation}))
            return {"id":result.inserted_primary_key[0],"decision":body.decision,"status":"recorded"}

    @app.get("/audit")
    def audit_log(request: Request,
                  limit: Annotated[int,Query(ge=1,le=100)]=25,
                  kind: Literal[
                      "query",
                      "dataset_loaded",
                      "recommendation_feedback",
                      "scenario_feedback",
                      "decisions",
                      "company_created",
                      "dataset_deleted",
                      "data_source_registered",
                      "multimodal_uploaded",
                      "multimodal_approved",
                      "multimodal_deleted",
                      "connector_synced",
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
            return info

        try:
            return await run_in_threadpool(process)
        except SnapshotConflict as exc:
            raise HTTPException(409,str(exc)) from exc
        except (ValueError,sa.exc.IntegrityError) as exc:
            raise HTTPException(422,str(exc) if isinstance(exc,ValueError) else "Snapshot violates database constraints.") from exc

    return app


app = create_app()
