"""DecisionPilot HTTP API. Production deployment must add identity and access controls."""
import hmac
import hashlib
import json
import logging
import os
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
from backend.app.db import audit, datasets, make_engine, read_connection, simulations
from backend.app.schemas import Feedback, Filters, ForecastRequest, Question, QueryResponse, ScenarioRequest, ScenarioFeedback
from backend.app.security import credentials, identify
from scripts.pipeline import LIMIT_BYTES, SnapshotConflict, load_snapshot, read_upload

log = logging.getLogger(__name__)


def history(conn, limit, kind=None, before=None):
    statement = sa.select(audit).order_by(audit.c.id.desc()).limit(limit)
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


def latest_decision(conn, kind, subject, dataset_id):
    statement = sa.select(audit.c.id, audit.c.payload).where(
        audit.c.kind == kind, audit.c.subject == subject,
        audit.c.payload["dataset_id"].as_string() == dataset_id).order_by(audit.c.id.desc()).limit(1)
    return conn.execute(statement).first()


def create_app(engine=None):
    engine = engine if engine is not None else make_engine()
    access = credentials()
    app = FastAPI(root_path=os.getenv("ROOT_PATH","/api"),title="DecisionPilot AI",version="1.0.0",description="Business analytics and decision support for a single validated workspace.")

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
        if identity is None:
            return JSONResponse(status_code=401, content={"detail": "Sign in with a workspace access token."},
                                headers={"WWW-Authenticate": "Bearer"})
        request.state.identity = identity
        required = "admin" if request.url.path == "/import" else "analyst" if request.url.path.endswith("/feedback") else "viewer"
        if {"viewer": 0, "analyst": 1, "admin": 2}[identity["role"]] < {"viewer": 0, "analyst": 1, "admin": 2}[required]:
            return JSONResponse(status_code=403, content={"detail": "Your workspace role cannot perform this action."})
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

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
    def health():
        try:
            with read_connection(engine) as conn:
                conn.execute(sa.select(1))
                info = conn.scalar(sa.select(datasets.c.payload))
            model = services.artifact(info) if info else None
            return dict(status="ok",database="ok",database_dialect=engine.dialect.name,dataset_ready=bool(info),
                        model_ready=bool(model),model_version=model["version"] if model else None)
        except sa.exc.SQLAlchemyError:
            return JSONResponse(status_code=503,content={"status":"unavailable","database":"unavailable","model_ready":False})

    @app.get("/dataset")
    def dataset():
        with read_connection(engine) as conn:
            return dataset_info(conn)

    @app.get("/options")
    def available_filters():
        with read_connection(engine) as conn:
            dataset_info(conn)
            return options(conn)

    @app.get("/models/quality")
    def quality():
        with read_connection(engine) as conn:
            return services.model_quality(dataset_info(conn))

    @app.get("/kpi/summary")
    def kpi(filters: Annotated[Filters,Query()]):
        with read_connection(engine) as conn:
            return services.dashboard(conn,dataset_info(conn),filters)

    @app.post("/query",response_model=QueryResponse)
    def ask(question: Question, request: Request):
        with read_connection(engine) as conn:
            info = dataset_info(conn)
            result = query(conn,info,question)
        with engine.begin() as conn:
            conn.execute(audit.insert().values(kind="query",subject=result["trace"]["tool"],
                                               payload={**jsonable_encoder(result["trace"]), "actor": request.state.identity["actor"], "dataset_id": info["dataset_id"]}))
        return result

    @app.get("/anomalies")
    def anomalies(start: date | None=None, end: date | None=None,
                  severity: Literal["critical","high","medium"] | None=None,
                  limit: Annotated[int,Query(ge=1,le=100)]=40):
        with read_connection(engine) as conn:
            rows = services.alerts(conn,dataset_info(conn),start,end)
        return {"rows":[r for r in rows if not severity or r["severity"]==severity][:limit],"result_type":"observed alerts"}

    @app.get("/anomalies/{alert_id}")
    def anomaly_detail(alert_id: str, start: date | None=None, end: date | None=None):
        with read_connection(engine) as conn:
            info = dataset_info(conn)
            alert = next((a for a in services.alerts(conn,info,start,end) if a["id"]==alert_id),None)
            if alert is None:
                raise HTTPException(404,"Alert is outside the requested date range.")
            return services.alert_detail(conn,info,alert)

    @app.post("/forecast")
    def forecast(request: ForecastRequest):
        with read_connection(engine) as conn:
            return services.forecast(conn,dataset_info(conn),request)

    @app.post("/simulate")
    def simulate(request: ScenarioRequest):
        with read_connection(engine) as conn:
            info = dataset_info(conn)
            result = services.simulate(conn,info,request)
        payload = jsonable_encoder({"request": request.model_dump(), "result": result})
        simulation_id = hashlib.sha256(json.dumps({"dataset_id": info["dataset_id"], **payload},
            sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
        with engine.begin() as conn:
            lock_workspace(conn)
            if dataset_info(conn)["dataset_id"] != info["dataset_id"]:
                raise HTTPException(409, "Dataset changed during simulation. Run it again.")
            if not conn.scalar(sa.select(simulations.c.id).where(simulations.c.id == simulation_id)):
                conn.execute(simulations.insert().values(id=simulation_id, dataset_id=info["dataset_id"], payload=payload))
            latest = latest_decision(conn, "scenario_feedback", simulation_id, info["dataset_id"])
        return {**result, "simulation_id": simulation_id, "dataset_id": info["dataset_id"],
                "decision": latest.payload["decision"] if latest else "pending"}

    @app.post("/scenarios/feedback")
    def scenario_feedback(body: ScenarioFeedback, request: Request):
        with engine.begin() as conn:
            lock_workspace(conn)
            info = dataset_info(conn)
            if info["dataset_id"] != body.dataset_id:
                raise HTTPException(409, "Dataset changed. Run the scenario again before deciding.")
            run = conn.execute(sa.select(simulations).where(simulations.c.id == body.simulation_id)).mappings().first()
            if not run or run["dataset_id"] != body.dataset_id:
                raise HTTPException(404, "Run this scenario before recording a decision.")
            recommendation = None
            if body.recommendation_id:
                recommendation = next((r for r in services.recommendations(conn, info) if r["id"] == body.recommendation_id), None)
                if recommendation is None:
                    raise HTTPException(404, "Recommendation is no longer available.")
            actor = request.state.identity["actor"]
            latest = latest_decision(conn, "scenario_feedback", body.simulation_id, body.dataset_id)
            if latest and latest.payload["decision"] == body.decision:
                event_id = latest.id
            else:
                event_id = conn.execute(audit.insert().values(kind="scenario_feedback", subject=body.simulation_id,
                    payload={**body.model_dump(exclude={"recommendation_id"}), "actor": actor,
                             "request": run["payload"]["request"], "recommended": run["payload"]["result"]["recommended"]})).inserted_primary_key[0]
            if recommendation:
                # Same transaction: the recommendation card and the scenario decision never disagree.
                linked = latest_decision(conn, "recommendation_feedback", body.recommendation_id, body.dataset_id)
                if not (linked and linked.payload["decision"] == body.decision):
                    conn.execute(audit.insert().values(kind="recommendation_feedback", subject=body.recommendation_id,
                        payload={"dataset_id": body.dataset_id, "decision": body.decision, "actor": actor,
                                 "recommendation": recommendation, "simulation_id": body.simulation_id}))
            return {"id": event_id, "decision": body.decision, "status": "recorded"}

    @app.get("/recommendations")
    def recommendations():
        with read_connection(engine) as conn:
            info = dataset_info(conn)
            rows = services.recommendations(conn,info)
            decisions = {}
            for row in rows:
                latest = latest_decision(conn, "recommendation_feedback", row["id"], info["dataset_id"])
                if latest:
                    decisions[row["id"]] = latest.payload["decision"]
        for row in rows:
            row["decision"] = decisions.get(row["id"],"pending")
        return {"rows":rows,"dataset_id":info["dataset_id"],"result_type":"business recommendation"}

    @app.post("/recommendations/feedback")
    def feedback(request: Feedback, http_request: Request):
        with engine.begin() as conn:
            lock_workspace(conn)
            info = dataset_info(conn)
            if info["dataset_id"]!=request.dataset_id:
                raise HTTPException(409,"The dataset changed. Review the latest recommendation.")
            recommendation = next((r for r in services.recommendations(conn,info) if r["id"] == request.recommendation_id), None)
            if recommendation is None:
                raise HTTPException(404,"Recommendation is no longer available.")
            latest = latest_decision(conn, "recommendation_feedback", request.recommendation_id, request.dataset_id)
            if latest and latest.payload["decision"]==request.decision:
                return {"id":latest.id,"decision":request.decision,"status":"recorded"}
            result = conn.execute(audit.insert().values(kind="recommendation_feedback",subject=request.recommendation_id,
                payload={"dataset_id":request.dataset_id,"decision":request.decision,
                         "actor": http_request.state.identity["actor"], "recommendation": recommendation}))
            return {"id":result.inserted_primary_key[0],"decision":request.decision,"status":"recorded"}

    @app.get("/audit")
    def audit_log(limit: Annotated[int,Query(ge=1,le=100)]=25,
                  kind: Literal["query","dataset_loaded","recommendation_feedback","scenario_feedback","decisions"] | None=None,
                  before: Annotated[int | None, Query(ge=1)]=None):
        with read_connection(engine) as conn:
            rows = history(conn,limit+1,kind,before)
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
            return load_snapshot(engine,data,{"kind":"imported","title":"Imported business snapshot",
                "currency":"VND","timezone":"Asia/Ho_Chi_Minh"},expected_id=expected_dataset_id,
                actor=request.state.identity["actor"])

        try:
            return await run_in_threadpool(process)
        except SnapshotConflict as exc:
            raise HTTPException(409,str(exc)) from exc
        except (ValueError,sa.exc.IntegrityError) as exc:
            raise HTTPException(422,str(exc) if isinstance(exc,ValueError) else "Snapshot violates database constraints.") from exc

    return app


app = create_app()
