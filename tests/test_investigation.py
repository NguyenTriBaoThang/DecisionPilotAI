from pathlib import Path

import sqlalchemy as sa
import pytest
from alembic import command
from alembic.config import Config

from backend.app.db import make_engine

ROOT = Path(__file__).resolve().parents[1]


def test_decompose_sums_to_total(inv_env):
    from datetime import date
    from backend.app.investigation.decomposition import decompose_revenue, month_periods
    with inv_env[1].connect() as conn:
        d = decompose_revenue(conn, *month_periods(date(2026, 9, 30)))
    assert abs(sum(c.share for c in d.causes) - 1) < 1e-9
    assert abs(sum(c.delta_daily for c in d.causes) - d.total_delta_daily) < 1


def test_decompose_finds_injected_causes(inv_env):
    from datetime import date
    from backend.app.investigation.decomposition import decompose_revenue, month_periods
    with inv_env[1].connect() as conn:
        d = decompose_revenue(conn, *month_periods(date(2026, 9, 30)))
    keys = {c.key for c in d.causes}
    assert {'demand', 'other'} <= keys
    assert keys & {'marketing:Facebook Ads', 'segment:Returning'}
    assert 'region:HCMC' in d.raw_slice_shares


def test_partial_month_uses_daily_average(inv_env):
    from datetime import date
    from backend.app.investigation.decomposition import decompose_revenue, month_periods
    with inv_env[1].connect() as conn:
        d = decompose_revenue(conn, *month_periods(date(2026, 9, 7)))
    assert abs(d.total_delta_daily / d.prior_daily) < 0.6


def make_case(engine, scope=None):
    from uuid import uuid4
    from backend.app.db import inv_cases
    from backend.app.analytics import dataset_info
    case_id = 'case-' + uuid4().hex
    with engine.begin() as conn:
        info = dataset_info(conn)
        conn.execute(inv_cases.insert().values(id=case_id, company_id='comp-default',
            dataset_id=info['dataset_id'], kind='revenue_drop', title='Doanh thu giảm',
            impact_vnd=0, period_current=['2026-09-01', '2026-09-30'],
            period_prior=['2026-08-01', '2026-08-31'], summary={'scope': scope} if scope else None))
    return case_id, info


@pytest.fixture()
def investigated(inv_env):
    from datetime import date
    from backend.app.investigation.agents import run_investigation
    from backend.app.investigation.trace import read_after
    engine = inv_env[1]
    case_id, info = make_case(engine)
    summary = run_investigation(engine, case_id, info, date(2026, 9, 30))
    with engine.connect() as conn:
        events = read_after(conn, case_id, 0)
    return case_id, summary, events


def test_run_emits_assign_then_findings_then_verdict(investigated):
    events = investigated[2]
    assert [e['seq'] for e in events] == list(range(1, len(events) + 1))
    assert [e['type'] for e in events[:7]] == ['assign'] * 7
    assert sum(e['type'] == 'finding' for e in events) == 7
    assert events[-2]['type'] == 'verdict'
    assert events[-1]['type'] == 'narration'


def test_inventory_hypothesis_eliminated_for_sep_2026(investigated):
    finding = next(e for e in investigated[2] if e['agent'] == 'inventory' and e['type'] == 'finding')
    assert finding['payload']['status'] == 'eliminated'


def test_rebuttal_only_when_raw_overlap(investigated):
    events = investigated[2]
    total = sum(e['payload'].get('raw_share', 0) for e in events if e['type'] == 'finding' and e['payload']['status'] == 'confirmed')
    assert any(e['type'] == 'rebuttal' for e in events) == (total > 1)


def test_sparse_case_refused(inv_env):
    from datetime import date
    from backend.app.db import sales, customers
    from backend.app.investigation.agents import run_investigation
    from backend.app.investigation.evidence import REFUSAL_TEXT
    with inv_env[1].connect() as conn:
        row = conn.execute(sa.select(sales.c.product_id, sales.c.region, customers.c.customer_segment,
            sa.func.count().label('n')).select_from(sales.join(customers))
            .where(sales.c.date.between(date(2026, 9, 1), date(2026, 9, 30)))
            .group_by(sales.c.product_id, sales.c.region, customers.c.customer_segment)
            .order_by('n')).first()
    assert row.n < 30
    case_id, info = make_case(inv_env[1], {'product': row.product_id, 'region': row.region, 'segment': row.customer_segment})
    summary = run_investigation(inv_env[1], case_id, info, date(2026, 9, 30))
    assert summary['sufficiency']['level'] == 'refused'
    assert REFUSAL_TEXT in summary['headline']


def test_llm_failure_falls_back_to_template(inv_env, monkeypatch):
    import httpx
    from datetime import date
    from ai_service.llm_orchestrator import PROVIDERS
    from backend.app.investigation.agents import run_investigation
    from backend.app.investigation.trace import read_after
    from backend.app.db import inv_cases
    class Provider:
        def extract(self, prompt, question):
            raise httpx.TimeoutException('test timeout')
    monkeypatch.setitem(PROVIDERS, 'test', (Provider, 'INV_TEST_KEY'))
    monkeypatch.setenv('INV_TEST_KEY', 'test')
    monkeypatch.setenv('LLM_PROVIDER', 'test')
    case_id, info = make_case(inv_env[1])
    run_investigation(inv_env[1], case_id, info, date(2026,9,30))
    with inv_env[1].connect() as conn:
        assert read_after(conn, case_id, 0)[-1]['payload']['source'] == 'template'
        assert conn.scalar(sa.select(inv_cases.c.run_state).where(inv_cases.c.id == case_id)) == 'done'


def test_build_options_returns_three_with_simulation_evidence(inv_env, investigated):
    from datetime import date
    from backend.app.investigation.strategy import build_options
    case_id, summary, _ = investigated
    with inv_env[1].connect() as conn:
        from backend.app.analytics import dataset_info
        info = dataset_info(conn)
        options = build_options(conn, info, summary)
    assert len(options) == 3 and options[0].key == 'hold'
    assert all(o.simulation.get('result_type') == 'scenario estimate' for o in options[1:])


def test_decide_is_idempotent(inv_env, investigated):
    from datetime import date
    from backend.app.db import inv_predictions, audit
    from backend.app.investigation.strategy import decide
    case_id = investigated[0]
    first = decide(inv_env[1], case_id, 'hold', 'analyst-test', date(2026, 9, 30))
    second = decide(inv_env[1], case_id, 'hold', 'analyst-test', date(2026, 9, 30))
    assert first['id'] == second['id']
    with inv_env[1].connect() as conn:
        assert conn.scalar(sa.select(sa.func.count()).select_from(inv_predictions).where(inv_predictions.c.case_id == case_id)) == 1
        assert conn.scalar(sa.select(sa.func.count()).select_from(audit).where(audit.c.kind == 'investigation_decision', audit.c.subject == case_id)) == 1
    with pytest.raises(Exception) as exc:
        decide(inv_env[1], case_id, 'price:P001:0.1', 'analyst-test', date(2026,9,30))
    assert getattr(exc.value, 'status_code', None) == 409


def test_migration_creates_investigation_tables(tmp_path, monkeypatch):
    url = 'sqlite:///' + str(tmp_path / 'investigation.sqlite')
    monkeypatch.setenv('DATABASE_URL', url)
    command.upgrade(Config(str(ROOT / 'alembic.ini')), 'head')
    engine = make_engine(url)
    try:
        inspector = sa.inspect(engine)
        assert {'inv_cases', 'inv_trace', 'inv_predictions', 'inv_clock'} <= set(inspector.get_table_names())
        assert any(c['column_names'] == ['case_id'] for c in inspector.get_unique_constraints('inv_predictions'))
        assert any(c['column_names'] == ['case_id', 'seq'] for c in inspector.get_unique_constraints('inv_trace'))
    finally:
        engine.dispose()


import json
import shutil
import pytest
from fastapi.testclient import TestClient
from backend.app.main import create_app
from backend.app.ingestion.storage import LocalObjectStorage
from scripts.pipeline import load_snapshot, read_directory


@pytest.fixture(scope="module")
def inv_env(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("investigation")
    url = "sqlite:///" + str(tmp / "investigation.sqlite")
    artifacts = tmp / "artifacts"
    artifacts.mkdir()
    for source in (ROOT / "artifacts").glob("*"):
        if source.suffix in {".joblib", ".json"}:
            shutil.copy2(source, artifacts / source.name)
    tokens = {role: "investigation-isolated-test-token-" + role for role in ("viewer", "analyst", "admin")}
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("DATABASE_URL", url)
        mp.setenv("LLM_PROVIDER", "none")
        mp.setenv("EMBEDDING_PROVIDER", "local")
        mp.setenv("VECTOR_DB_BACKEND", "sql")
        mp.setenv("INGESTION_STORAGE_DIR", str(tmp / "storage"))
        mp.setenv("WORKSPACE_ACCESS_TOKENS", json.dumps({token: {"actor": role, "role": role, "company_ids": ["*"] if role == "admin" else ["comp-default"]} for role, token in tokens.items()}))
        for target in ("backend.app.db.ARTIFACTS", "backend.app.services.ARTIFACTS", "backend.app.ingestion.service.ARTIFACTS"):
            mp.setattr(target, artifacts)
        command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
        engine = make_engine(url)
        try:
            data, manifest = read_directory(ROOT / "data/synthetic")
            load_snapshot(engine, data, manifest)
            with TestClient(create_app(engine, storage=LocalObjectStorage(tmp / "storage"))) as client:
                yield client, engine, tokens
        finally:
            engine.dispose()
