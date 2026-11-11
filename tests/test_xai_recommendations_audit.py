"""Comprehensive integration, scientific honesty, XAI, security & governance tests for Recommendations and Audit."""
from __future__ import annotations

import csv
from datetime import date, timedelta
import io
import json
import shutil

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
import sqlalchemy as sa

from backend.app.db import ROOT, audit, audit_hash_chain, make_engine
from backend.app.governance.hash_chain import append_audited_event, verify_audit_hash_chain
from backend.app.ingestion.storage import LocalObjectStorage
from backend.app.main import create_app
from scripts.pipeline import load_snapshot, read_directory


VIEWER_TOK = "xai-viewer-token-isolated-test-01"
ANALYST_TOK = "xai-analyst-token-isolated-test-02"
ADMIN_TOK = "xai-admin-token-isolated-test-03"


def _copy_synthetic_artifacts(art_dir):
    src_art = ROOT / "artifacts"
    for fname in ("f32e87e3a5744333ff98d3bf.joblib", "evaluation.json"):
        src = src_art / fname
        if src.exists():
            shutil.copy2(src, art_dir / fname)


@pytest.fixture(scope="module")
def xai_full_env(tmp_path_factory):
    """Full LightGBM + data/synthetic fixture loaded in ~2s using verified pre-trained synthetic artifact."""
    tmp = tmp_path_factory.mktemp("xai_full")
    db_path = tmp / "xai_full.sqlite"
    db_url = f"sqlite:///{db_path}"
    store_dir = tmp / "obj_store"
    art_dir = tmp / "artifacts"
    art_dir.mkdir(parents=True, exist_ok=True)
    _copy_synthetic_artifacts(art_dir)

    mp = pytest.MonkeyPatch()
    mp.setenv("DATABASE_URL", db_url)
    mp.setenv("LLM_PROVIDER", "none")
    mp.setenv("EMBEDDING_PROVIDER", "local")
    mp.setenv("VECTOR_DB_BACKEND", "sql")
    mp.setenv("INGESTION_STORAGE_DIR", str(store_dir))
    mp.setenv(
        "WORKSPACE_ACCESS_TOKENS",
        json.dumps(
            {
                VIEWER_TOK: {"actor": "viewer-xai", "role": "viewer", "company_ids": ["comp-default"]},
                ANALYST_TOK: {"actor": "analyst-xai", "role": "analyst", "company_ids": ["comp-default"]},
                ADMIN_TOK: {"actor": "admin-xai", "role": "admin", "company_ids": ["*"]},
            }
        ),
    )
    mp.setattr("backend.app.db.ARTIFACTS", art_dir)
    mp.setattr("backend.app.services.ARTIFACTS", art_dir)
    mp.setattr("backend.app.ingestion.service.ARTIFACTS", art_dir)

    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    engine = make_engine(db_url)
    data, manifest = read_directory(ROOT / "data/synthetic")
    load_snapshot(engine, data, manifest)
    storage = LocalObjectStorage(store_dir)
    with TestClient(create_app(engine, storage=storage)) as http:
        yield http, engine, art_dir
    engine.dispose()
    mp.undo()


@pytest.fixture()
def gov_isolated_env(tmp_path, monkeypatch):
    """Fresh SQLite environment for short-window upload (<201d), RBAC, tamper-evidence & isolation tests."""
    db_path = tmp_path / "gov_iso.sqlite"
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
                VIEWER_TOK: {"actor": "viewer-xai", "role": "viewer", "company_ids": ["comp-default"]},
                ANALYST_TOK: {"actor": "analyst-xai", "role": "analyst", "company_ids": ["comp-default"]},
                ADMIN_TOK: {"actor": "admin-xai", "role": "admin", "company_ids": ["*"]},
            }
        ),
    )
    monkeypatch.setattr("backend.app.db.ARTIFACTS", art_dir)
    monkeypatch.setattr("backend.app.services.ARTIFACTS", art_dir)
    monkeypatch.setattr("backend.app.ingestion.service.ARTIFACTS", art_dir)

    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    engine = make_engine(db_url)
    storage = LocalObjectStorage(store_dir)
    yield engine, storage
    engine.dispose()


def _short_sales_csv(days: int = 35, start_date: date = date(2026, 4, 1)) -> bytes:
    lines = ["Order Date,SKU Item,Line Category,Qty Sold,Net Sales,COGS,Client,City,Channel Name,Ad Budget,Stock On Hand"]
    for d in range(days):
        cur = (start_date + timedelta(days=d)).isoformat()
        qty = 8 + (d % 4)
        rev = qty * 95.0
        cogs = qty * 70.0  # low ~26% margin triggers cost optimization alert honestly
        ad = 55.0 if d % 2 == 0 else 35.0
        ch = "Facebook Ads" if d % 2 == 0 else "Google Ads"
        stock = max(2, 50 - d * 2)
        lines.append(
            f'{cur},ErgoChair Lite,Chairs,{qty},"${rev:,.2f}","${cogs:,.2f}",Client-{d % 6},HCMC,{ch},"${ad:,.2f}",{stock}'
        )
    return "\n".join(lines).encode("utf-8")


def _ingest_short_dataset(http: TestClient, headers: dict[str, str], *, name: str = "Short 35d Sales") -> str:
    up = http.post(
        "/api/v1/datasets/upload",
        headers=headers,
        files={"file": ("short_sales.csv", _short_sales_csv(), "text/csv")},
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


def test_xai_recommendations_overview_and_real_treeshap(xai_full_env):
    http, _, _ = xai_full_env
    hdr = {"Authorization": f"Bearer {ANALYST_TOK}"}

    # 1. Overview: 8 KPIs, 4 Donuts, multiple categories, honest post_impl_effective_pct = None
    ov_res = http.get("/api/v1/recommendations", headers=hdr)
    assert ov_res.status_code == 200, ov_res.text
    ov = ov_res.json()
    assert ov["empty_workspace"] is False
    kpis = ov["kpis"]
    assert kpis["total_recommendations"] >= 5
    assert kpis["post_impl_effective_pct"] is None
    assert kpis["evaluated_implemented_count"] == 0
    assert kpis["sufficient_evidence_pct"] is not None

    charts = ov["charts"]
    for key in ("by_category", "by_status", "by_priority", "by_confidence"):
        assert sum(bucket["count"] for bucket in charts[key]) == kpis["total_recommendations"]

    categories_present = {r["category_code"] for r in ov["rows"]}
    assert {"inventory", "marketing", "revenue_growth"}.issubset(categories_present)
    for row in ov["rows"]:
        assert row["confidence_is_calibrated"] is False
        assert row["confidence_score"] is None or (0.0 <= row["confidence_score"] <= 100.0)

    # 2. Detail (Sections A-I) on Inventory P001 with real LightGBM Native TreeSHAP & Counterfactuals
    det_res = http.get("/api/v1/recommendations/inventory:P001", headers=hdr)
    assert det_res.status_code == 200, det_res.text
    det = det_res.json()
    for sec in (
        "section_a_summary",
        "section_b_why",
        "section_c_evidence",
        "section_d_xai",
        "section_e_model_and_confidence",
        "section_f_g_impact",
        "section_h_alternatives",
        "section_i_action_plan_and_workflow",
    ):
        assert sec in det

    sec_d = det["section_d_xai"]
    assert "causality" in sec_d["causal_disclaimer"].lower() or "causal" in sec_d["causal_disclaimer"].lower()
    assert sec_d["shap_available"] is True
    shap_block = sec_d["shap"]
    assert shap_block["available"] is True
    assert shap_block["method"] == "lightgbm_pred_contrib_exact_treeshap"
    assert shap_block["additivity_error"] < 1e-2
    assert len(shap_block["waterfall_local"]) >= 3
    assert "cumulative_after" in shap_block["waterfall_local"][0]
    assert len(shap_block["global_summary"]) >= 3
    assert len(shap_block["global_summary"][0]["beeswarm_points"]) >= 1
    assert len(shap_block["dependence"]) >= 1
    dep_pt = shap_block["dependence"][0]["points"][0]
    assert "feature_value" in dep_pt and "shap_value" in dep_pt

    fi = sec_d["feature_importance"]
    assert len(fi["gain"]) >= 3 and "normalized_pct" in fi["gain"][0]
    assert len(fi["permutation"]) >= 3 and "normalized_pct" in fi["permutation"][0]

    cfs = sec_d["counterfactuals"]
    assert len(cfs) >= 2
    assert any(cf["is_recommended"] for cf in cfs)
    assert "parameter" in cfs[0] and "scenario_label" in cfs[0]

    # Strict separation: Model Performance vs Uncalibrated Confidence
    sec_e = det["section_e_model_and_confidence"]
    assert sec_e["recommendation_confidence"]["is_calibrated"] is False
    assert "data_quality_0_100" in sec_e["recommendation_confidence"]["components"]
    assert sec_e["model_performance"]["forecast"]["available"] is True
    assert "r2_pseudo" in sec_e["model_performance"]["forecast"]
    assert sec_e["model_performance"]["forecast"]["model_version"]

    # 3. Customer Retention must honestly disclose missing Churn ML model (zero fabricated accuracy/SHAP)
    cust_res = http.get("/api/v1/recommendations/customer:retention", headers=hdr)
    if cust_res.status_code == 200:
        cust = cust_res.json()
        assert cust["section_d_xai"]["shap_available"] is False
        assert cust["section_e_model_and_confidence"]["model_performance"]["available"] is False
        assert "chưa đủ dữ liệu" in cust["section_e_model_and_confidence"]["model_performance"]["status_label"].lower()


def test_workflow_state_machine_outcome_decoupling_and_legacy_sync(xai_full_env):
    http, _, _ = xai_full_env
    hdr = {"Authorization": f"Bearer {ANALYST_TOK}"}

    # Cannot jump directly from pending -> implemented
    bad_jump = http.post(
        "/api/v1/recommendations/marketing:facebook/action",
        headers=hdr,
        json={"action": "mark_implemented", "comment": "Skipping approval"},
    )
    assert bad_jump.status_code == 422

    # pending -> review_requested -> approved -> implemented
    r1 = http.post(
        "/api/v1/recommendations/marketing:facebook/action",
        headers=hdr,
        json={"action": "request_review", "comment": "Need holdout design check"},
    )
    assert r1.status_code == 200 and r1.json()["status"] == "review_requested"

    r2 = http.post(
        "/api/v1/recommendations/marketing:facebook/action",
        headers=hdr,
        json={
            "action": "approve",
            "owner": "Performance Lead",
            "tracking_kpi": "Incremental Contribution Profit",
            "comment": "Approved with 15% geo holdout",
        },
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "approved"
    assert r2.json()["legacy_decision"] == "accepted"

    r3 = http.post(
        "/api/v1/recommendations/marketing:facebook/action",
        headers=hdr,
        json={"action": "mark_implemented", "comment": "Budget split deployed in Meta Ads Manager"},
    )
    assert r3.status_code == 200
    assert r3.json()["status"] == "implemented"

    # Implemented != Evaluated Successful yet!
    mid_ov = http.get("/api/v1/recommendations", headers=hdr).json()
    assert mid_ov["kpis"]["implemented_count"] == 1
    assert mid_ov["kpis"]["evaluated_implemented_count"] == 0
    assert mid_ov["kpis"]["post_impl_effective_pct"] is None

    # Cannot reject or revert once implemented -> 409 Conflict
    assert (
        http.post(
            "/api/v1/recommendations/marketing:facebook/action",
            headers=hdr,
            json={"action": "reject"},
        ).status_code
        == 409
    )

    # Record post-implementation outcome separately
    out_res = http.post(
        "/api/v1/recommendations/marketing:facebook/outcome",
        headers=hdr,
        json={
            "evaluation_status": "successful",
            "kpi_name": "Contribution Profit",
            "baseline_value": 10000.0,
            "target_value": 12000.0,
            "observed_value": 12500.0,
            "observation_window_days": 14,
            "methodology": "15% Geo-holdout lift test",
            "notes": "Verified net lift exceeded target threshold",
        },
    )
    assert out_res.status_code == 200, out_res.text
    assert out_res.json()["observed_delta_pct"] == pytest.approx(25.0)

    after_ov = http.get("/api/v1/recommendations", headers=hdr).json()
    assert after_ov["kpis"]["evaluated_implemented_count"] == 1
    assert after_ov["kpis"]["post_impl_effective_pct"] == pytest.approx(100.0)

    # Verify full 14-step Decision Trace
    trace_res = http.get("/api/v1/recommendations/marketing:facebook/trace", headers=hdr)
    assert trace_res.status_code == 200, trace_res.text
    trace = trace_res.json()
    assert len(trace["steps"]) == 14
    assert trace["steps"][10]["value"] == "analyst-xai"
    assert "SUCCESSFUL" in trace["steps"][13]["value"]

    # Bidirectional compatibility with legacy /recommendations/feedback
    fb_res = http.post(
        "/recommendations/feedback",
        headers=hdr,
        json={"recommendation_id": "sales:decline", "dataset_id": after_ov["dataset_id"], "decision": "rejected"},
    )
    assert fb_res.status_code == 200
    dec_det = http.get("/api/v1/recommendations/sales:decline", headers=hdr).json()
    assert dec_det["section_a_summary"]["status"] == "rejected"


def test_audit_overview_models_risks_integrity_and_export(xai_full_env):
    http, _, _ = xai_full_env
    hdr = {"Authorization": f"Bearer {ANALYST_TOK}"}

    ov_res = http.get("/api/v1/audit/overview", headers=hdr)
    assert ov_res.status_code == 200, ov_res.text
    ov = ov_res.json()
    assert ov["empty_workspace"] is False
    assert ov["integrity"]["chain_valid"] is True
    assert ov["integrity"]["append_only_protection"] is True

    dq = ov["charts"]["data_quality"]
    assert {s["key"] for s in dq["slices"]} == {"valid", "invalid", "missing", "duplicate"}
    assert sum(s["count"] for s in dq["slices"]) == dq["total"]

    stages = {c["stage"] for c in ov["charts"]["outcome_comparison"]}
    assert {"Implemented", "Successful", "Unsuccessful", "Not Evaluated"}.issubset(stages)
    assert ov["charts"]["model_performance_trend"]["forecast_available"] is True

    # Model Governance & 17-feature schema + PSI drift
    models_res = http.get("/api/v1/audit/models", headers=hdr)
    assert models_res.status_code == 200, models_res.text
    models_data = models_res.json()
    assert len(models_data["feature_schema"]) == 17
    assert len(models_data["models"]) >= 2

    # Risk alerts + resolution
    risks_res = http.get("/api/v1/audit/risks", headers=hdr)
    assert risks_res.status_code == 200, risks_res.text
    items = risks_res.json()["items"]
    if items:
        rid = items[0]["id"]
        res_resp = http.post(
            f"/api/v1/audit/risks/{rid}/resolve",
            headers=hdr,
            json={"status": "acknowledged", "note": "Risk reviewed in governance meeting"},
        )
        assert res_resp.status_code == 200
        assert res_resp.json()["status"] == "acknowledged"


def test_short_window_honest_shap_unavailable_tamper_evidence_security_and_isolation(gov_isolated_env):
    engine, storage = gov_isolated_env
    admin_hdr = {"Authorization": f"Bearer {ADMIN_TOK}"}
    analyst_hdr = {"Authorization": f"Bearer {ANALYST_TOK}"}
    viewer_hdr = {"Authorization": f"Bearer {VIEWER_TOK}"}

    with TestClient(create_app(engine, storage=storage)) as http:
        # 1. Ingest <201d dataset (35 days) into comp-default -> TreeSHAP MUST honestly report unavailable
        _ingest_short_dataset(http, admin_hdr, name="Short Window Co")

        ov = http.get("/api/v1/recommendations", headers=viewer_hdr).json()
        assert ov["empty_workspace"] is False
        assert len(ov["rows"]) >= 1
        first_key = ov["rows"][0]["rec_key"]
        assert ov["rows"][0]["shap_available"] is False

        det = http.get(f"/api/v1/recommendations/{first_key}", headers=viewer_hdr).json()
        assert det["section_d_xai"]["shap_available"] is False
        reason_txt = (det["section_d_xai"]["shap_unavailable_reason"] or "").lower()
        assert (
            "201 days" in reason_txt
            or "without a tree model" in reason_txt
            or "chưa khả dụng" in reason_txt
            or "no lightgbm" in reason_txt
            or "rule" in reason_txt
            or "equation" in reason_txt
        )

        # 2. RBAC enforcement: viewer cannot mutate workflow, record outcomes, or resolve risks
        assert (
            http.post(
                f"/api/v1/recommendations/{first_key}/action",
                headers=viewer_hdr,
                json={"action": "approve"},
            ).status_code
            == 403
        )
        assert (
            http.post(
                f"/api/v1/recommendations/{first_key}/outcome",
                headers=viewer_hdr,
                json={"evaluation_status": "successful", "kpi_name": "Margin", "methodology": "test"},
            ).status_code
            == 403
        )

        # 3. Secret redaction + CSV formula injection defense in Audit Hash Chain & Export
        with engine.begin() as conn:
            append_audited_event(
                conn,
                company_id="comp-default",
                kind="configuration_changed",
                subject="=cmd|' /C calc'!A0",
                payload={
                    "actor": "sec-tester",
                    "Authorization": "Bearer sk-live-secret1234567890abcd",
                    "api_key": "plaintext-secret-should-never-persist",
                    "formula_note": "+SUM(1,2)",
                },
            )

        events = http.get("/api/v1/audit/events", headers=viewer_hdr).json()["rows"]
        sec_ev = next(e for e in events if e["actor"] == "sec-tester")
        assert sec_ev["payload"]["Authorization"] == "***REDACTED***"
        assert sec_ev["payload"]["api_key"] == "***REDACTED***"
        assert "plaintext-secret" not in json.dumps(sec_ev)

        csv_res = http.get("/api/v1/audit/export?format=csv", headers=viewer_hdr)
        assert csv_res.status_code == 200
        parsed = list(csv.DictReader(io.StringIO(csv_res.text)))
        csv_sec = next(r for r in parsed if r["actor"] == "sec-tester")
        assert csv_sec["subject"].startswith("'=cmd")

        # 4. Append-only SQL trigger blocks UPDATE and DELETE on audit_hash_chain and audit_events
        with pytest.raises(sa.exc.DatabaseError):
            with engine.begin() as conn:
                conn.execute(sa.text("UPDATE audit_hash_chain SET entry_hash = 'tampered'"))
        with pytest.raises(sa.exc.DatabaseError):
            with engine.begin() as conn:
                conn.execute(sa.text("DELETE FROM audit_hash_chain"))
        with pytest.raises(sa.exc.DatabaseError):
            with engine.begin() as conn:
                conn.execute(sa.text("UPDATE audit_events SET subject = 'tampered'"))

        # Verify chain integrity passes before tamper simulation
        integ_ok = http.get("/api/v1/audit/integrity", headers=viewer_hdr).json()
        assert integ_ok["chain_valid"] is True

        # 5. Simulate offline raw DB tamper (drop trigger in isolated disposable test DB, mutate payload, recheck hash chain)
        with engine.begin() as conn:
            conn.execute(sa.text("DROP TRIGGER IF EXISTS protect_audit_events_update"))
            conn.execute(
                audit.update()
                .where(audit.c.id == sec_ev["id"])
                .values(subject="tampered-subject")
            )
        with engine.connect() as conn:
            broken = verify_audit_hash_chain(conn, "comp-default")
            assert broken["chain_valid"] is False
            assert len(broken["payload_mismatches"]) >= 1

        # 6. Strict multi-tenant isolation: brand-new empty company has zero leaked recommendations or audit rows
        comp = http.post("/api/v1/companies", headers=admin_hdr, json={"name": "Zero Leak Governance Corp"}).json()
        cid = comp["id"]
        c_hdr = {**admin_hdr, "X-Company-ID": cid}

        assert http.get("/api/v1/recommendations", headers=c_hdr).json()["empty_workspace"] is True
        assert http.get("/api/v1/audit/overview", headers=c_hdr).json()["empty_workspace"] is True
        c_events = http.get("/api/v1/audit/events", headers=c_hdr).json()["rows"]
        assert all(ev["kind"] == "company_created" and ev["subject"] == cid for ev in c_events)
        # Cross-tenant token (ANALYST_TOK bound to comp-default only) blocked with 403
        assert http.get("/api/v1/recommendations", headers={**analyst_hdr, "X-Company-ID": cid}).status_code == 403

