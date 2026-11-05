"""DecisionPilot HTTP API. Production deployment must add identity and access controls."""
import hmac
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
from backend.app.db import audit, datasets, make_engine, read_connection
from backend.app.schemas import Feedback, Filters, ForecastRequest, Question, QueryResponse, ScenarioRequest
from scripts.pipeline import LIMIT_BYTES, SnapshotConflict, load_snapshot, read_upload

log = logging.getLogger(__name__)


def history(conn, limit, kind=None):
    statement = sa.select(audit).order_by(audit.c.id.desc()).limit(limit)
    if kind:
        statement = statement.where(audit.c.kind==kind)
    rows = [dict(row) for row in conn.execute(statement).mappings()]
    for row in rows:
        occurred_at = row["occurred_at"]
        if occurred_at.tzinfo is None:
            row["occurred_at"] = occurred_at.replace(tzinfo=timezone.utc)
    return rows


def create_app(engine=None):
    engine = engine if engine is not None else make_engine()
    app = FastAPI(root_path=os.getenv("ROOT_PATH","/api"),title="DecisionPilot AI",version="1.0.0",description="Business analytics and decision support for a single validated workspace.")

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

    @app.get("/kpi/summary")
    def kpi(filters: Annotated[Filters,Query()]):
        with read_connection(engine) as conn:
            return services.dashboard(conn,dataset_info(conn),filters)

    @app.post("/query",response_model=QueryResponse)
    def ask(question: Question):
        with read_connection(engine) as conn:
            info = dataset_info(conn)
            result = query(conn,info,question)
        with engine.begin() as conn:
            conn.execute(audit.insert().values(kind="query",subject=result["trace"]["tool"],
                                               payload=jsonable_encoder(result["trace"])))
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
            return services.simulate(conn,dataset_info(conn),request)

    @app.get("/recommendations")
    def recommendations():
        with read_connection(engine) as conn:
            info = dataset_info(conn)
            rows = services.recommendations(conn,info)
            decisions = {}
            for row in history(conn,100,"recommendation_feedback"):
                if row["payload"]["dataset_id"]==info["dataset_id"]:
                    decisions.setdefault(row["subject"],row["payload"]["decision"])
        for row in rows:
            row["decision"] = decisions.get(row["id"],"pending")
        return {"rows":rows,"dataset_id":info["dataset_id"],"result_type":"business recommendation"}

    @app.post("/recommendations/feedback")
    def feedback(request: Feedback):
        with engine.begin() as conn:
            if conn.dialect.name=="postgresql":
                conn.exec_driver_sql("SELECT pg_advisory_xact_lock(177480102)")
            else:
                conn.exec_driver_sql("BEGIN IMMEDIATE")
            info = dataset_info(conn)
            if info["dataset_id"]!=request.dataset_id:
                raise HTTPException(409,"The dataset changed. Review the latest recommendation.")
            if request.recommendation_id not in {r["id"] for r in services.recommendations(conn,info)}:
                raise HTTPException(404,"Recommendation is no longer available.")
            existing = conn.execute(sa.select(audit.c.id,audit.c.payload).where(
                audit.c.kind=="recommendation_feedback",audit.c.subject==request.recommendation_id)
                .order_by(audit.c.id.desc())).all()
            latest = next((row for row in existing if row.payload["dataset_id"]==request.dataset_id),None)
            if latest and latest.payload["decision"]==request.decision:
                return {"id":latest.id,"decision":request.decision,"status":"recorded"}
            result = conn.execute(audit.insert().values(kind="recommendation_feedback",subject=request.recommendation_id,
                payload={"dataset_id":request.dataset_id,"decision":request.decision}))
            return {"id":result.inserted_primary_key[0],"decision":request.decision,"status":"recorded"}

    @app.get("/audit")
    def audit_log(limit: Annotated[int,Query(ge=1,le=100)]=25,
                  kind: Literal["query","dataset_loaded","recommendation_feedback"] | None=None):
        with read_connection(engine) as conn:
            return {"rows":history(conn,limit,kind)}

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
                "currency":"VND","timezone":"Asia/Ho_Chi_Minh"},expected_id=expected_dataset_id)

        try:
            return await run_in_threadpool(process)
        except SnapshotConflict as exc:
            raise HTTPException(409,str(exc)) from exc
        except (ValueError,sa.exc.IntegrityError) as exc:
            raise HTTPException(422,str(exc) if isinstance(exc,ValueError) else "Snapshot violates database constraints.") from exc

    return app


app = create_app()
