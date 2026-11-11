"""Comprehensive integration tests for Enterprise Data Traceability, Lineage, Impact & Real-time Events."""
from __future__ import annotations

from datetime import date, timedelta
from io import BytesIO
import json
import time

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont
import pytest
import sqlalchemy as sa

from backend.app.db import ROOT, ingestion_jobs, make_engine, multimodal_files
from backend.app.ingestion.storage import LocalObjectStorage
from backend.app.main import create_app


@pytest.fixture()
def lineage_env(tmp_path, monkeypatch):
    db_path = tmp_path / "lineage_test.sqlite"
    db_url = f"sqlite:///{db_path}"
    store_dir = tmp_path / "obj_store"
    art_dir = tmp_path / "artifacts"
    art_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("LLM_PROVIDER", "none")
    monkeypatch.setenv("INGESTION_STORAGE_DIR", str(store_dir))
    monkeypatch.setattr("backend.app.db.ARTIFACTS", art_dir)
    monkeypatch.setattr("backend.app.services.ARTIFACTS", art_dir)
    monkeypatch.setattr("backend.app.ingestion.service.ARTIFACTS", art_dir)
    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    engine = make_engine(db_url)
    storage = LocalObjectStorage(store_dir)
    yield engine, storage, art_dir
    engine.dispose()


def _sales_csv(days: int = 32, start_date: date = date(2026, 6, 1)) -> bytes:
    lines = ["Order Date,SKU Item,Line Category,Qty Sold,Net Sales,COGS,Client,City,Channel Name,Ad Budget,Stock On Hand"]
    for d in range(days):
        cur = (start_date + timedelta(days=d)).isoformat()
        qty = 8 + (d % 4)
        rev = qty * 150.0
        cogs = qty * 85.0
        lines.append(
            f'{cur},PulseMonitor Pro,Displays,{qty},"${rev:,.2f}","${cogs:,.2f}",Orion Ltd,HCMC,Online,$42.00,{70 - d}'
        )
    return "\n".join(lines).encode("utf-8")


def _png_bytes() -> bytes:
    img = Image.new("RGB", (1000, 420), "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=28)
    y = 28
    for line in [
        "INVOICE #MM-204",
        "Date: 2026-07-15",
        "Product: VisionPOS Terminal",
        "Customer: Omega Retail",
        "Grand Total: $1,250.00",
        "Cost: $620.00",
    ]:
        draw.text((32, y), line, fill="black", font=font)
        y += 52
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _wait_multimodal_jobs(http: TestClient, headers: dict[str, str], file_id: str, timeout_sec: float = 15.0) -> None:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        jobs = http.get("/api/v1/jobs", headers=headers, params={"file_id": file_id}).json()["items"]
        j = next((item for item in jobs if item.get("file_id") == file_id), None)
        if j and j["status"] in {"completed", "failed"}:
            return
        time.sleep(0.1)


def test_empty_company_honest_lineage(lineage_env):
    engine, storage, _ = lineage_env
    with TestClient(create_app(engine, storage=storage)) as http:
        comp = http.post("/api/v1/companies", json={"name": "Fresh Empty Corp"}).json()
        hdr = {"X-Company-ID": comp["id"]}

        g = http.get("/api/lineage/graph", headers=hdr)
        assert g.status_code == 200
        body = g.json()
        assert body["nodes"] == []
        assert body["edges"] == []
        assert body["pipelines"] == []
        assert body["has_active_processing"] is False
        assert body["summary"] == {
            "total_data_sources": 0,
            "processing_pipelines": 0,
            "ai_models": 0,
            "business_insights": 0,
            "data_quality_score": None,
            "last_synchronized": None,
        }


def test_csv_pipeline_end_to_end_lineage_upstream_downstream_and_impact(lineage_env):
    engine, storage, _ = lineage_env
    with TestClient(create_app(engine, storage=storage)) as http:
        comp = http.post("/api/v1/companies", json={"name": "Lineage Retail Co"}).json()
        cid = comp["id"]
        hdr = {"X-Company-ID": cid}

        up = http.post(
            "/api/v1/datasets/upload",
            headers=hdr,
            files={"file": ("lineage_q2.csv", _sales_csv(days=32), "text/csv")},
            data={"dataset_name": "Lineage Q2 Sales"},
        )
        assert up.status_code == 200
        ds_id = up.json()["dataset"]["id"]
        sugg = up.json()["mapping_suggestions"]["suggested_mapping"]

        assert http.post(
            f"/api/v1/datasets/{ds_id}/mapping",
            headers=hdr,
            json={"mappings": sugg, "currency": "USD", "confirmed": True},
        ).status_code == 200
        assert http.post(f"/api/v1/datasets/{ds_id}/validate", headers=hdr, json={}).status_code == 200
        imp = http.post(
            f"/api/v1/datasets/{ds_id}/import",
            headers=hdr,
            json={"confirmed": True, "activate": True, "currency": "USD"},
        )
        assert imp.status_code == 200
        assert imp.json()["model_ready"] is True

        # Trigger live Forecast, Simulation & Copilot Query runtime hooks
        assert http.post("/forecast", headers=hdr, json={"target": "revenue", "horizon": 7}).status_code == 200
        opts = http.get("/options", headers=hdr).json()
        prod_id = opts["products"][0]["product_id"]
        sim = http.post(
            "/simulate",
            headers=hdr,
            json={"type": "price", "horizon": 7, "parameters": {"product": prod_id, "discounts": [0, 0.05]}},
        )
        assert sim.status_code == 200
        assert http.post("/query", headers=hdr, json={"question": "What is the top selling product?"}).status_code == 200

        # Query lineage graph (both prefixed /api/lineage/graph & unprefixed /lineage/graph)
        g_res = http.get("/api/lineage/graph", headers=hdr)
        assert g_res.status_code == 200
        assert http.get("/lineage/graph", headers=hdr).status_code == 200
        graph = g_res.json()

        assert graph["has_active_processing"] is False
        assert graph["summary"]["total_data_sources"] >= 1
        assert graph["summary"]["processing_pipelines"] >= 2
        assert graph["summary"]["ai_models"] >= 5
        assert graph["summary"]["business_insights"] >= 5
        assert graph["summary"]["data_quality_score"] >= 90.0
        assert graph["summary"]["last_synchronized"] is not None

        # Strictly implemented models only (never display Churn Prediction or Classification Model)
        all_names = " ".join(n["name"] + " " + n["sub_type"] for n in graph["nodes"]).lower()
        assert "churn" not in all_names
        assert "classification model" not in all_names
        assert "lightgbm forecaster" in all_names
        assert "hybrid anomaly detector" in all_names
        assert "hybrid rag" in all_names

        # Upstream trace from Revenue Forecast -> ... -> raw CSV data_source
        fc_node = next(n for n in graph["nodes"] if "revenue forecast" in n["name"].lower())
        up_res = http.get(f"/api/lineage/nodes/{fc_node['id']}/upstream", headers=hdr)
        assert up_res.status_code == 200
        up_body = up_res.json()
        up_types = {n["node_type"] for n in up_body["nodes"]}
        assert {"data_source", "processing", "storage", "ai_model", "business_intelligence", "final_output"} <= up_types
        csv_src = next(n for n in up_body["nodes"] if n["node_type"] == "data_source" and n["external_id"] == ds_id)
        assert csv_src["name"] == "lineage_q2.csv"

        # Downstream & Impact Analysis from raw CSV data_source
        dn_res = http.get(f"/api/lineage/nodes/{csv_src['id']}/downstream", headers=hdr)
        assert dn_res.status_code == 200
        assert fc_node["id"] in dn_res.json()["node_ids"]

        imp_res = http.get(f"/api/lineage/nodes/{csv_src['id']}/impact", headers=hdr)
        assert imp_res.status_code == 200
        impact = imp_res.json()
        report_names = {r["name"] for r in impact["affected_reports"]}
        assert "Executive Dashboard Metrics" in report_names
        assert any("Revenue Forecast" in rn for rn in report_names)
        assert len(impact["affected_pipelines"]) >= 1
        assert len(impact["reprocessing_recommendations"]) >= 1
        assert "not automatically marked invalid" in impact["honesty_note"].lower()

        # Node Detail Inspector (all 5 tabs)
        detail = http.get(f"/api/lineage/nodes/{fc_node['id']}", headers=hdr).json()
        assert set(detail.keys()) >= {"node", "overview", "data_information", "lineage", "execution", "impact"}
        assert detail["overview"]["name"] == fc_node["name"]
        assert len(detail["lineage"]["upstream_nodes"]) >= 1

        # Pipelines -> Runs -> Chronological Events for playback
        pipes = http.get("/api/lineage/pipelines", headers=hdr).json()["items"]
        tab_pipe = next(p for p in pipes if p["pipeline_type"] == "tabular_ingestion")
        runs = http.get(f"/api/lineage/pipelines/{tab_pipe['id']}/runs", headers=hdr).json()["items"]
        assert len(runs) >= 1
        events = http.get(f"/api/lineage/runs/{runs[0]['id']}/events", headers=hdr).json()["items"]
        assert len(events) >= 3
        assert events == sorted(events, key=lambda e: (e["step_order"], e["timestamp"] or ""))
        assert any(e["incoming_edge_ids"] for e in events if e["step_order"] >= 2)


def test_multimodal_processing_state_hitl_rag_and_connector_failure(lineage_env):
    engine, storage, _ = lineage_env
    with TestClient(create_app(engine, storage=storage)) as http:
        comp = http.post("/api/v1/companies", json={"name": "Multimodal Trace Corp"}).json()
        cid = comp["id"]
        hdr = {"X-Company-ID": cid}

        # 1. Multimodal file upload + wait for job completion
        up = http.post(
            "/api/v1/multimodal/upload",
            headers=hdr,
            files={"files": ("store_receipt.png", _png_bytes(), "image/png")},
            data={"dataset_name": "Store Receipt Batch", "consent_external_ai": "false"},
        )
        assert up.status_code == 202
        fid = up.json()["files"][0]["id"]
        _wait_multimodal_jobs(http, hdr, fid)

        # Simulate active queue state briefly -> has_active_processing MUST be True ONLY while queued/running
        with engine.begin() as conn:
            conn.execute(multimodal_files.update().where(multimodal_files.c.id == fid).values(processing_status="processing"))
            conn.execute(ingestion_jobs.update().where(ingestion_jobs.c.file_id == fid).values(status="running"))
        g_active = http.get("/api/lineage/graph", headers=hdr).json()
        assert g_active["has_active_processing"] is True
        mm_proc = next(n for n in g_active["nodes"] if n["sub_type"] == "ocr_parsing")
        assert mm_proc["status"] == "processing"

        # Restore awaiting_approval & check idle + HITL warning state
        with engine.begin() as conn:
            conn.execute(multimodal_files.update().where(multimodal_files.c.id == fid).values(processing_status="awaiting_approval"))
            conn.execute(ingestion_jobs.update().where(ingestion_jobs.c.file_id == fid).values(status="completed"))
        g_wait = http.get("/api/lineage/graph", headers=hdr).json()
        assert g_wait["has_active_processing"] is False

        # Approve multimodal extraction -> insight promoted & traceable
        app_res = http.post(
            f"/api/v1/files/{fid}/approve-import",
            headers=hdr,
            json={"confirmed": True, "approve_below_threshold": True},
        )
        assert app_res.status_code == 200

        # 2. RAG Knowledge note upload -> Vector Store -> Hybrid RAG -> Copilot Report
        rag_up = http.post(
            "/api/v1/rag/ingest",
            headers=hdr,
            files={"file": ("operations_sop.txt", b"Standard Operating Procedure: Maintain 14 days safety stock for top electronics SKUs.", "text/plain")},
            data={"domain": "operations"},
        )
        assert rag_up.status_code == 201

        # 3. Failed connector sync -> failed status & error_details exposed in inspector
        ds_conn = http.post(
            "/api/v1/data-sources",
            headers=hdr,
            json={
                "name": "Blocked ERP Endpoint",
                "source_type": "rest_api",
                "config": {"base_url": "http://127.0.0.1:9999/erp"},
            },
        )
        assert ds_conn.status_code == 201
        src_id = ds_conn.json()["id"]
        sync_fail = http.post(f"/api/v1/data-sources/{src_id}/sync", headers=hdr, json={})
        assert sync_fail.status_code in {400, 422, 502}

        g_full = http.get("/api/lineage/graph", headers=hdr).json()
        node_names = [n["name"] for n in g_full["nodes"]]
        assert "Approved Multimodal Insights Store" in node_names
        assert any("operations_sop.txt" in name for name in node_names)
        assert any(n["node_type"] == "ai_model" and "Hybrid RAG" in n["name"] for n in g_full["nodes"])
        failed_sync = next(n for n in g_full["nodes"] if n["sub_type"] == "connector_sync" and n["status"] == "failed")
        failed_detail = http.get(f"/api/lineage/nodes/{failed_sync['id']}", headers=hdr).json()
        assert failed_detail["execution"]["error_details"]


def test_lineage_filters_auth_rbac_and_sse_stream(lineage_env, monkeypatch):
    engine, storage, _ = lineage_env
    # Provision tenant workspaces in local admin mode first
    with TestClient(create_app(engine, storage=storage)) as setup_http:
        comp_a = setup_http.post("/api/v1/companies", json={"name": "Tenant Alpha Corp"}).json()["id"]
        comp_b = setup_http.post("/api/v1/companies", json={"name": "Tenant Beta Corp"}).json()["id"]

    tok_a = "tenant-a-lineage-secret-token-32bytes"
    tok_b = "tenant-b-lineage-secret-token-32bytes"
    monkeypatch.setenv(
        "WORKSPACE_ACCESS_TOKENS",
        json.dumps({
            tok_a: {"actor": "alice-a", "role": "admin", "company_ids": [comp_a], "default_company_id": comp_a},
            tok_b: {"actor": "bob-b", "role": "analyst", "company_ids": [comp_b], "default_company_id": comp_b},
        }),
    )

    with TestClient(create_app(engine, storage=storage)) as http:
        # Unauthenticated request must return 401
        assert http.get("/api/lineage/graph").status_code == 401
        assert http.get("/api/lineage/stream?once=true").status_code == 401

        hdr_a = {"Authorization": f"Bearer {tok_a}", "X-Company-ID": comp_a}
        hdr_b = {"Authorization": f"Bearer {tok_b}", "X-Company-ID": comp_b}

        # Upload CSV in tenant A and RAG doc in tenant B
        up_a = http.post(
            "/api/v1/datasets/upload",
            headers=hdr_a,
            files={"file": ("tenant_a_orders.csv", _sales_csv(days=15), "text/csv")},
        )
        assert up_a.status_code == 200
        ds_a = up_a.json()["dataset"]["id"]
        sugg_a = up_a.json()["mapping_suggestions"]["suggested_mapping"]
        http.post(f"/api/v1/datasets/{ds_a}/mapping", headers=hdr_a, json={"mappings": sugg_a, "confirmed": True})
        http.post(f"/api/v1/datasets/{ds_a}/validate", headers=hdr_a, json={})
        http.post(f"/api/v1/datasets/{ds_a}/import", headers=hdr_a, json={"confirmed": True, "activate": True})

        http.post(
            "/api/v1/rag/ingest",
            headers=hdr_b,
            files={"file": ("secret_b_policy.txt", b"Tenant B confidential pricing memo.", "text/plain")},
        )

        # Filters on tenant A graph
        g_models = http.get("/api/lineage/graph", headers=hdr_a, params={"node_type": "ai_model"}).json()
        assert g_models["nodes"] and all(n["node_type"] == "ai_model" for n in g_models["nodes"])

        g_search = http.get("/api/lineage/graph", headers=hdr_a, params={"search": "tenant_a_orders"}).json()
        assert len(g_search["matched_node_ids"]) >= 1

        # Cross-tenant isolation (403 on wrong X-Company-ID or wrong tenant node ID)
        assert http.get("/api/lineage/graph", headers={"Authorization": f"Bearer {tok_a}", "X-Company-ID": comp_b}).status_code == 403
        node_a_id = g_search["matched_node_ids"][0]
        assert http.get(f"/api/lineage/nodes/{node_a_id}", headers=hdr_b).status_code == 403
        assert http.get(f"/api/lineage/nodes/{node_a_id}/impact", headers=hdr_b).status_code == 403
        g_b = http.get("/api/lineage/graph", headers=hdr_b).json()
        assert "tenant_a_orders" not in json.dumps(g_b)
        assert any("secret_b_policy.txt" in n["name"] for n in g_b["nodes"])

        # SSE stream one-shot snapshot
        sse = http.get("/api/lineage/stream", headers=hdr_a, params={"once": True})
        assert sse.status_code == 200
        assert "text/event-stream" in sse.headers.get("content-type", "")
        assert "event: lineage_snapshot" in sse.text
        assert '"total_data_sources": 1' in sse.text

        # Delete dataset -> lineage cleans up stale nodes cleanly (zero orphan nodes)
        assert http.delete(f"/api/v1/datasets/{ds_a}", headers=hdr_a).status_code == 200
        g_after_del = http.get("/api/lineage/graph", headers=hdr_a).json()
        assert g_after_del["nodes"] == []
        assert g_after_del["pipelines"] == []
