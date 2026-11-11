"""Comprehensive integration tests for Interactive 3D Business Scenario Simulator (Digital Twin APIs & Engine)."""
from __future__ import annotations

from datetime import date, timedelta
import json

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest

from backend.app.db import ROOT, make_engine
from backend.app.ingestion.storage import LocalObjectStorage
from backend.app.main import create_app


VIEWER_TOK = "twin-viewer-token-for-isolated-tests-01"
ANALYST_TOK = "twin-analyst-token-for-isolated-tests-02"
ADMIN_TOK = "twin-admin-token-for-isolated-tests-03"


@pytest.fixture()
def twin_env(tmp_path, monkeypatch):
    db_path = tmp_path / "twin_test.sqlite"
    db_url = f"sqlite:///{db_path}"
    store_dir = tmp_path / "obj_store"
    art_dir = tmp_path / "artifacts"
    art_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("LLM_PROVIDER", "none")
    monkeypatch.setenv("EMBEDDING_PROVIDER", "local")
    monkeypatch.setenv("VECTOR_DB_BACKEND", "sql")
    monkeypatch.setenv("INGESTION_STORAGE_DIR", str(store_dir))
    monkeypatch.setenv(
        "WORKSPACE_ACCESS_TOKENS",
        json.dumps(
            {
                VIEWER_TOK: {"actor": "viewer-a", "role": "viewer", "company_ids": ["comp-default"]},
                ANALYST_TOK: {"actor": "analyst-a", "role": "analyst", "company_ids": ["comp-default"]},
                ADMIN_TOK: {"actor": "admin-all", "role": "admin", "company_ids": ["*"]},
            }
        ),
    )
    monkeypatch.setattr("backend.app.db.ARTIFACTS", art_dir)
    monkeypatch.setattr("backend.app.services.ARTIFACTS", art_dir)
    monkeypatch.setattr("backend.app.ingestion.service.ARTIFACTS", art_dir)

    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    engine = make_engine(db_url)
    storage = LocalObjectStorage(store_dir)
    yield engine, storage, art_dir
    engine.dispose()


def _sales_csv(days: int = 35, start_date: date = date(2026, 4, 1)) -> bytes:
    lines = ["Order Date,SKU Item,Line Category,Qty Sold,Net Sales,COGS,Client,City,Channel Name,Ad Budget,Stock On Hand"]
    for d in range(days):
        cur = (start_date + timedelta(days=d)).isoformat()
        qty = 10 + (d % 4)
        rev = qty * 100.0
        cogs = qty * 50.0
        ad = 60.0 if d % 2 == 0 else 40.0
        ch = "Facebook Ads" if d % 2 == 0 else "Google Ads"
        stock = max(8, 85 - d * 2)
        lines.append(
            f'{cur},SmartDesk Pro,Desks,{qty},"${rev:,.2f}","${cogs:,.2f}",Client-{d % 5},HCMC,{ch},"${ad:,.2f}",{stock}'
        )
    return "\n".join(lines).encode("utf-8")


def _ingest_sales_dataset(http: TestClient, headers: dict[str, str], *, name: str = "Twin Sales Q2", days: int = 35) -> str:
    up = http.post(
        "/api/v1/datasets/upload",
        headers=headers,
        files={"file": ("twin_sales.csv", _sales_csv(days=days), "text/csv")},
        data={"dataset_name": name},
    )
    assert up.status_code == 200, up.text
    ds_id = up.json()["dataset"]["id"]
    sugg = up.json()["mapping_suggestions"]["suggested_mapping"]
    assert (
        http.post(
            f"/api/v1/datasets/{ds_id}/mapping",
            headers=headers,
            json={"mappings": sugg, "currency": "USD", "confirmed": True},
        ).status_code
        == 200
    )
    assert http.post(f"/api/v1/datasets/{ds_id}/validate", headers=headers, json={}).status_code == 200
    imp = http.post(
        f"/api/v1/datasets/{ds_id}/import",
        headers=headers,
        json={"confirmed": True, "activate": True, "currency": "USD"},
    )
    assert imp.status_code == 200, imp.text
    return ds_id


def test_empty_workspace_readiness_zero_and_no_fabricated_metrics(twin_env):
    engine, storage, _ = twin_env
    admin_hdr = {"Authorization": f"Bearer {ADMIN_TOK}"}
    with TestClient(create_app(engine, storage=storage)) as http:
        comp = http.post("/api/v1/companies", json={"name": "Empty Twin Co"}, headers=admin_hdr).json()
        cid = comp["id"]
        c_hdr = {**admin_hdr, "X-Company-ID": cid}

        ws = http.get("/v1/twin/workspace", headers=c_hdr)
        assert ws.status_code == 200, ws.text
        data = ws.json()
        assert data["company_id"] == cid
        assert data["dataset_ready"] is False
        assert data["dataset"] is None
        assert data["baseline"] is None
        assert data["scenarios"] == []
        assert data["recent_runs"] == []
        assert data["data_readiness"]["score"] == 0
        assert data["data_readiness"]["tier"] == "not_ready"
        assert "not represent forecast accuracy" in data["data_readiness"]["disclaimer"].lower()
        assert len(data["zones"]) == 8


def test_full_digital_twin_lifecycle_validation_failure_retry_and_honesty(twin_env):
    engine, storage, _ = twin_env
    admin_hdr = {"Authorization": f"Bearer {ADMIN_TOK}"}
    with TestClient(create_app(engine, storage=storage)) as http:
        comp = http.post("/api/v1/companies", json={"name": "Nexus Twin Retail"}, headers=admin_hdr).json()
        cid = comp["id"]
        c_hdr = {**admin_hdr, "X-Company-ID": cid}

        ds_id = _ingest_sales_dataset(http, c_hdr, name="=CMD|calc Nexus Q2")

        # 1. Workspace loads readiness, canonical baseline scenario, 8 zones & honest AI inventory
        ws_res = http.get("/v1/twin/workspace", headers=c_hdr)
        assert ws_res.status_code == 200, ws_res.text
        ws = ws_res.json()
        assert ws["dataset_ready"] is True
        assert ws["dataset"]["dataset_id"] == ds_id
        assert ws["data_readiness"]["score"] > 0
        assert ws["baseline"]["zones"]["finance_ops"]["metrics"]["operating_expenses"] is None
        assert len(ws["scenarios"]) >= 1
        baseline_scen = next(s for s in ws["scenarios"] if s["is_baseline"])
        assert baseline_scen["name"] == "Baseline (=CMD|calc Nexus Q2)"

        # Honest AI Model Inventory checks
        models_by_id = {m["id"]: m for m in ws["ai_models"]}
        assert models_by_id["ai_cls"]["status"] == "not_integrated"
        assert models_by_id["ai_opt"]["status"] == "partial"
        # 35 days < 201d -> LightGBM falls back honestly to degraded short-window baseline
        assert models_by_id["ai_lgbm"]["status"] == "degraded"

        # 2. Baseline cannot have variables mutated cleanly (422)
        base_patch = http.patch(
            f"/v1/twin/scenarios/{baseline_scen['id']}/variables",
            headers=c_hdr,
            json={"variables": [{"variable_name": "demand_growth_pct", "scenario_value": 10}]},
        )
        assert base_patch.status_code == 422

        # 3. Create Revenue Growth What-if scenario
        create_res = http.post(
            "/v1/twin/scenarios",
            headers=c_hdr,
            json={
                "name": "Growth +20% Ads & +10% Demand",
                "scenario_type": "revenue_growth",
                "objective": "profit",
                "horizon_days": 30,
                "variables_overrides": {
                    "marketing_budget_change_pct": 20,
                    "demand_growth_pct": 10,
                },
            },
        )
        assert create_res.status_code == 201, create_res.text
        rev_scen = create_res.json()

        # 4. Out-of-bounds variable update strictly rejected (422)
        oob_res = http.patch(
            f"/v1/twin/scenarios/{rev_scen['id']}/variables",
            headers=c_hdr,
            json={"variables": [{"variable_name": "discount_rate_pct", "scenario_value": 95}]},
        )
        assert oob_res.status_code == 422

        # Extra unallowed key in strict Pydantic schema rejected (422)
        extra_res = http.post(
            f"/v1/twin/scenarios/{rev_scen['id']}/runs",
            headers=c_hdr,
            json={"execution_mode": "sync", "evil_extra_field": True},
        )
        assert extra_res.status_code == 422

        # 5. Simulate injected execution failure -> verify 'failed' -> Retry -> verify 'completed'
        fail_run_res = http.post(
            f"/v1/twin/scenarios/{rev_scen['id']}/runs",
            headers=c_hdr,
            json={"execution_mode": "sync", "inject_failure": True},
        )
        assert fail_run_res.status_code == 201
        failed_run = fail_run_res.json()
        assert failed_run["status"] == "failed"
        assert "simulated execution failure" in failed_run["error_details"].lower()

        retry_res = http.post(f"/v1/twin/runs/{failed_run['id']}/retry", headers=c_hdr)
        assert retry_res.status_code == 200, retry_res.text
        retried_run = retry_res.json()
        assert retried_run["status"] == "completed"
        assert len(retried_run["events"]) >= 10
        assert len(retried_run["results"]) >= 8

        # Cancel terminal run returns idempotently without crash
        cancel_res = http.post(f"/v1/twin/runs/{retried_run['id']}/cancel", headers=c_hdr)
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "completed"

        # 6. Upload RAG policy document & generate grounded recommendation (EN & VI)
        rag_up = http.post(
            "/api/v1/rag/ingest",
            headers=c_hdr,
            files={
                "file": (
                    "Growth_Policy.txt",
                    b"Margin Policy: Maintain gross margin above 42% on SmartDesk Pro. Maximum promotional discount cap is 15%.",
                    "text/plain",
                )
            },
        )
        assert rag_up.status_code == 201

        rec_res = http.post(
            f"/v1/twin/runs/{retried_run['id']}/recommend",
            headers=c_hdr,
            json={"language": "vi", "custom_focus": "margin and stockout safety"},
        )
        assert rec_res.status_code == 200, rec_res.text
        rec = rec_res.json()
        assert rec["language"] == "vi"
        assert rec["supporting_metrics"]
        assert len(rec["citations"]) >= 1
        assert rec["citations"][0]["source_file"] == "Growth_Policy.txt"
        assert any("classification" in lim.lower() for lim in rec["limitations"])

        # 7. Export JSON & CSV (verify CSV formula neutralization on dataset title starting with '=')
        exp_json = http.get(f"/v1/twin/runs/{retried_run['id']}/export?format=json", headers=c_hdr)
        assert exp_json.status_code == 200
        assert exp_json.json()["simulation_run"]["id"] == retried_run["id"]

        exp_csv = http.get(f"/v1/twin/runs/{retried_run['id']}/export?format=csv", headers=c_hdr)
        assert exp_csv.status_code == 200
        assert "'=>" not in exp_csv.text
        assert "'=CMD|calc" in exp_csv.text


def test_constraint_enforced_comparison_ranks_feasible_above_infeasible_extreme(twin_env):
    engine, storage, _ = twin_env
    admin_hdr = {"Authorization": f"Bearer {ADMIN_TOK}"}
    with TestClient(create_app(engine, storage=storage)) as http:
        comp = http.post("/api/v1/companies", json={"name": "Constraint Guardrail Co"}, headers=admin_hdr).json()
        c_hdr = {**admin_hdr, "X-Company-ID": comp["id"]}
        _ingest_sales_dataset(http, c_hdr, name="Guardrail Sales", days=32)

        ws = http.get("/v1/twin/workspace", headers=c_hdr).json()
        baseline_id = ws["baseline_scenario_id"]

        # High revenue but deep discount -> compresses gross margin well below 45% guardrail
        extreme_discount = http.post(
            "/v1/twin/scenarios",
            headers=c_hdr,
            json={
                "name": "Aggressive 25% Discount",
                "scenario_type": "pricing_strategy",
                "objective": "revenue",
                "horizon_days": 30,
                "variables_overrides": {"discount_rate_pct": 25.0, "price_elasticity": -1.8},
            },
        ).json()

        # Moderate healthy growth + inventory buffer -> preserves >=48% margin & avoids stockout
        healthy_growth = http.post(
            "/v1/twin/scenarios",
            headers=c_hdr,
            json={
                "name": "Disciplined Replenished Growth",
                "scenario_type": "inventory_optimization",
                "objective": "balanced",
                "horizon_days": 30,
                "variables_overrides": {"replenishment_qty_units": 300, "supplier_lead_time_days": 5},
            },
        ).json()

        cmp_res = http.post(
            "/v1/twin/compare",
            headers=c_hdr,
            json={
                "scenario_ids": [baseline_id, extreme_discount["id"], healthy_growth["id"]],
                "objective": "revenue",
                "constraints": {"min_margin": 0.45, "max_stockout_risk_units": 100},
            },
        )
        assert cmp_res.status_code == 200, cmp_res.text
        body = cmp_res.json()
        rows = body["comparison"]
        by_id = {r["scenario_id"]: r for r in rows}

        assert by_id[extreme_discount["id"]]["feasible"] is False
        assert any("margin" in v.lower() for v in by_id[extreme_discount["id"]]["violations"])
        assert by_id[healthy_growth["id"]]["feasible"] is True
        # Even under 'revenue' objective, infeasible scenario MUST rank below feasible winner!
        assert by_id[healthy_growth["id"]]["rank"] < by_id[extreme_discount["id"]]["rank"]
        assert body["recommended_scenario_id"] != extreme_discount["id"]
        assert len(body["sensitivity"]["points"]) == 5


def test_rbac_viewer_blocked_and_cross_tenant_isolation(twin_env):
    engine, storage, _ = twin_env
    admin_hdr = {"Authorization": f"Bearer {ADMIN_TOK}"}
    analyst_hdr = {"Authorization": f"Bearer {ANALYST_TOK}"}
    viewer_hdr = {"Authorization": f"Bearer {VIEWER_TOK}"}

    with TestClient(create_app(engine, storage=storage)) as http:
        comp_a = http.post("/api/v1/companies", json={"name": "Tenant Alpha"}, headers=admin_hdr).json()
        cid_a = comp_a["id"]
        hdr_a = {**admin_hdr, "X-Company-ID": cid_a}
        _ingest_sales_dataset(http, hdr_a, name="Alpha Sales", days=30)

        scen_a = http.post(
            "/v1/twin/scenarios",
            headers=hdr_a,
            json={"name": "Alpha Private Scenario", "scenario_type": "supply_chain_disruption", "horizon_days": 30},
        ).json()

        # Analyst scoped strictly to comp-default cannot read or mutate Tenant Alpha scenarios
        assert http.get(f"/v1/twin/scenarios/{scen_a['id']}", headers=analyst_hdr).status_code == 403
        assert (
            http.post(
                f"/v1/twin/scenarios/{scen_a['id']}/runs",
                headers=analyst_hdr,
                json={"execution_mode": "sync"},
            ).status_code
            == 403
        )
        assert http.delete(f"/v1/twin/scenarios/{scen_a['id']}", headers=analyst_hdr).status_code == 403

        # Viewer in comp-default can read workspace, CANNOT create/mutate scenarios
        assert http.get("/v1/twin/workspace", headers=viewer_hdr).status_code == 200
        assert (
            http.post(
                "/v1/twin/scenarios",
                headers=viewer_hdr,
                json={"name": "Viewer Attempt", "scenario_type": "revenue_growth"},
            ).status_code
            == 403
        )

