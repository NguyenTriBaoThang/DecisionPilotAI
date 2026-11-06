"""Integration and regression tests for the public API and imported data boundaries."""
from datetime import timedelta
from io import BytesIO
from zipfile import ZipFile
import os

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from openpyxl import Workbook

from ai_service.features import lag_features
from backend.app.db import ROOT, DATA_TABLES, audit, make_engine, sales
from backend.app.main import create_app
from scripts.benchmark import benchmark
from scripts.generate import generate
from scripts.pipeline import export_bundle, load_snapshot, read_directory, read_upload, validate


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    folder = tmp_path_factory.mktemp("demo")
    database = os.getenv("TEST_DATABASE_URL") or "sqlite:///" + str(folder/"test.sqlite")
    config = Config(str(ROOT/"alembic.ini"))
    with pytest.MonkeyPatch.context() as env:
        env.setenv("DATABASE_URL",database)
        env.setenv("LLM_PROVIDER","none")
        command.upgrade(config,"head")
        engine = make_engine(database)
        data,manifest = read_directory(ROOT/"data/synthetic")
        load_snapshot(engine,data,manifest)
        with TestClient(create_app(engine)) as http:
            yield http,engine
        engine.dispose()


def test_health_kpi_and_filters(client):
    http,engine = client
    info = http.get("/health").json()
    assert info["database"]=="ok" and info["dataset_ready"] and info["model_ready"]
    assert http.get("/dataset").json()["counts"]["sales_transactions"]==50_000
    response = http.get("/kpi/summary",params={"region":"HCMC","product":"P001","grain":"weekly"})
    assert response.status_code==200
    result = response.json()
    with engine.connect() as conn:
        direct = conn.scalar(sa.select(sa.func.sum(sales.c.revenue)).where(
            sales.c.date >= sa.func.date("2026-09-01"),sales.c.region=="HCMC",sales.c.product_id=="P001"))
    assert result["summary"]["revenue"]==direct==sum(row["revenue"] for row in result["trend"])
    assert result["marketing_channels"]==[]
    assert http.get("/kpi/summary",params={"region":"invalid"}).status_code==422
    assert http.get("/kpi/summary",params={"start":"2026-10-01"}).status_code==422
    assert http.get("/openapi.json").status_code==200


def test_anomaly_and_contributions(client):
    http,_ = client
    rows = http.get("/anomalies",params={"limit":100}).json()["rows"]
    assert any(r["metric"]=="facebook_spend" and r["severity"]=="critical" for r in rows)
    assert any(r["metric"]=="stockout_risk" and r["scope"]=="SmartDesk Mini" for r in rows)
    assert any(r["metric"]=="revenue" for r in rows)
    response = http.post("/query",json={"question":"Why did revenue decrease this month?"})
    assert response.status_code==200
    evidence = response.json()["evidence"]
    assert evidence["delta"]==evidence["actual"]-evidence["baseline"]<0
    for rows in evidence["contributions"].values():
        assert sum(row["delta"] for row in rows)==evidence["delta"]
        assert sum(row["share_of_net_change"] for row in rows)==pytest.approx(1)
    assert http.get("/anomalies",params={"severity":"unknown"}).status_code==422


@pytest.mark.parametrize("target,scope,horizon",[
    ("revenue",{},30),("orders",{"category":"Electronics"},7),("demand",{"product":"P001"},30),
])
def test_forecast(client,target,scope,horizon):
    http,_ = client
    response = http.post("/forecast",json={"target":target,"horizon":horizon,**scope})
    assert response.status_code==200
    f = response.json()
    assert f["data_as_of"]=="2026-09-30"
    assert len(f["prediction"])==horizon
    assert f["prediction"][0]["date"]=="2026-10-01"
    assert all(0<=x["lower"]<=x["value"]<=x["upper"] for x in f["prediction"])
    assert f["total"]==pytest.approx(sum(r["value"] for r in f["prediction"]))
    assert {"seasonal_naive","moving_average","lightgbm"}==f["metrics"]["test"].keys()
    assert 0<=f["metrics"]["test_coverage"]<=1


def test_price_scenario_respects_inputs(client):
    http,_ = client
    params = {"product":"P004","discounts":[0,.05,.10],"elasticity":-1.2}
    r = http.post("/simulate",json={"type":"price","objective":"profit","parameters":params})
    assert r.status_code==200
    outcome = r.json()
    assert len({row["demand"] for row in outcome["alternatives"]})==3
    assert outcome["recommended"]["profit"]==max(r["profit"] for r in [outcome["baseline"],*outcome["alternatives"]])
    assert all(row["risk"] is None for row in outcome["alternatives"])
    assert http.post("/simulate",json={"type":"price","parameters":{**params,"discounts":[.9]}}).status_code==422


def test_marketing_is_concave_and_inventory_enforces_lead_time(client):
    http,_ = client
    market = http.post("/simulate",json={"type":"marketing","parameters":{"channel":"Facebook Ads","changes":[.5,1]}}).json()
    base,first,second = market["baseline"],*market["alternatives"]
    assert base["demand"] < first["demand"] < second["demand"] < 2*base["demand"]
    assert first["demand"]-base["demand"] > second["demand"]-first["demand"]
    inventory = http.post("/simulate",json={"type":"inventory","horizon":7,
        "parameters":{"product":"P001","order_quantities":[0,1000]}}).json()
    assert inventory["evidence"]["lead_time_days"]>=7
    assert inventory["alternatives"][0]["risk"]==inventory["alternatives"][1]["risk"]
    assert inventory["recommended"]["order_quantity"]==0
    assert http.post("/simulate",json={"type":"inventory","parameters":{"product":"P004"}}).status_code==422


def test_recommendation_feedback_is_audited_and_idempotent(client):
    http,engine = client
    data = http.get("/recommendations").json()
    body = {"recommendation_id":data["rows"][0]["id"],"dataset_id":data["dataset_id"],"decision":"accepted"}
    before = http.get("/kpi/summary").json()["summary"]
    answer = http.post("/recommendations/feedback",json=body)
    assert answer.status_code==200
    assert http.post("/recommendations/feedback",json=body).json()["id"]==answer.json()["id"]
    assert http.get("/recommendations").json()["rows"][0]["decision"]=="accepted"
    assert http.get("/kpi/summary").json()["summary"]==before
    with engine.connect() as conn:
        assert conn.scalar(sa.select(sa.func.count()).select_from(audit).where(audit.c.id==answer.json()["id"]))==1
    assert http.post("/recommendations/feedback",json={**body,"dataset_id":"a"*24}).status_code==409


def test_benchmark(client):
    result = benchmark(client[0])
    assert result["cases"]==46
    assert all(score==1 for score in result["scores"].values()),result


def test_integrity_rejects_wrong_formula_and_stock_movement():
    data,_ = generate(months=6,transactions=500,sku_count=6,customer_count=100)
    assert validate(data)["status"]=="passed"
    data["sales_transactions"][0]["revenue"]+=1
    with pytest.raises(ValueError,match="Invalid sale formula"):
        validate(data)
    data["sales_transactions"][0]["revenue"]-=1
    data["inventory_daily"][0]["closing_stock"]+=1
    with pytest.raises(ValueError,match="inventory movement"):
        validate(data)


def test_import_csv_and_xlsx_are_validated_and_atomic(tmp_path,monkeypatch):
    database = "sqlite:///" + str(tmp_path/"empty.sqlite")
    monkeypatch.setenv("DATABASE_URL",database)
    command.upgrade(Config(str(ROOT/"alembic.ini")),"head")
    small,manifest = generate(months=6,transactions=800,sku_count=8,customer_count=100)
    export_bundle(tmp_path,small,manifest)
    stream = BytesIO()
    with ZipFile(stream,"w") as archive:
        for table in DATA_TABLES:
            archive.write(tmp_path/f"{table.name}.csv",f"{table.name}.csv")
    payload = stream.getvalue()
    book = Workbook(write_only=True)
    for table in DATA_TABLES:
        sheet = book.create_sheet(table.name)
        sheet.append(list(table.c.keys()))
        for row in small[table.name]:
            sheet.append([row[name] for name in table.c.keys()])
    xlsx = BytesIO()
    book.save(xlsx)
    validate(read_upload(xlsx.getvalue(),"business.xlsx"))
    with TestClient(create_app(make_engine(database))) as http:
        url = "/import?filename=business.zip&expected_dataset_id=empty"
        headers = {"X-Import-Token":"test-only"}
        assert http.post(url,content=payload,headers=headers).status_code==403
        monkeypatch.setenv("DEMO_ALLOW_IMPORT","true")
        monkeypatch.setenv("IMPORT_TOKEN","test-only")
        assert http.post(url,content=b"bad",headers=headers).status_code==422
        assert http.get("/dataset").status_code==503
        imported = http.post(url,content=payload,headers=headers)
        assert imported.status_code==200
        assert imported.json()["kind"]=="imported"
        assert http.post(url,content=payload,headers=headers).status_code==409
        assert http.post("/forecast",json={}).status_code==503
        assert http.get("/kpi/summary").status_code==200


def test_features_use_only_previous_days():
    import numpy as np
    from datetime import date
    series = np.arange(50).reshape(1,-1)
    origin = date(2026,1,1)+timedelta(days=28)
    x = lag_features(series[:,:28],origin,np.array([1.]))
    assert tuple(x[0,:4])==(27,21,14,0)
    assert x[0,4]==pytest.approx(np.mean(np.arange(21,28)))


def test_scenario_decision_uses_exact_run_and_retains_evidence(client):
    http, engine = client
    first = http.post('/simulate', json={'type': 'marketing', 'parameters': {'channel': 'Facebook Ads', 'changes': [.1]}}).json()
    second = http.post('/simulate', json={'type': 'marketing', 'parameters': {'channel': 'Facebook Ads', 'changes': [.2]}}).json()
    assert first['simulation_id'] != second['simulation_id']
    body = {'simulation_id': first['simulation_id'], 'dataset_id': first['dataset_id'], 'decision': 'accepted'}
    response = http.post('/scenarios/feedback', json=body)
    assert response.status_code == 200
    assert http.post('/scenarios/feedback', json=body).json()['id'] == response.json()['id']
    event = http.get('/audit', params={'kind': 'scenario_feedback'}).json()['rows'][0]
    assert event['subject'] == first['simulation_id']
    assert event['payload']['request']['parameters']['changes'] == [.1]
    assert event['payload']['recommended'] == first['recommended']
    assert event['payload']['actor'] == 'local-workspace'
    repeat = http.post('/simulate', json={'type': 'marketing', 'parameters': {'channel': 'Facebook Ads', 'changes': [.1]}}).json()
    assert repeat['decision'] == 'accepted'
    assert http.post('/scenarios/feedback', json={**body, 'dataset_id': 'c'*24}).status_code == 409
    assert http.post('/scenarios/feedback', json={**body, 'simulation_id': '0'*64}).status_code == 404
    with engine.begin() as conn:
        with pytest.raises(sa.exc.DatabaseError, match='append-only'):
            conn.execute(audit.update().where(audit.c.id == event['id']).values(subject='tampered'))
    with engine.begin() as conn:
        with pytest.raises(sa.exc.DatabaseError, match='append-only'):
            conn.execute(audit.delete().where(audit.c.id == event['id']))


def test_named_access_roles_and_production_configuration(client, monkeypatch):
    import json
    access = {'v'*32: {'actor': 'reader', 'role': 'viewer'}, 'a'*32: {'actor': 'analyst', 'role': 'analyst'}}
    monkeypatch.setenv('APP_ENV', 'production')
    monkeypatch.setenv('WORKSPACE_ACCESS_TOKENS', json.dumps(access))
    with TestClient(create_app(client[1])) as http:
        assert http.get('/health').json() == {'status': 'ok'}
        assert http.get('/dataset').status_code == 401
        viewer = {'Authorization': 'Bearer '+'v'*32}
        analyst = {'Authorization': 'Bearer '+'a'*32}
        assert http.get('/dataset', headers=viewer).status_code == 200
        assert http.get('/session', headers=viewer).json()['actor'] == 'reader'
        assert http.post('/scenarios/feedback', json={}, headers=viewer).status_code == 403
        assert http.post('/import', headers=analyst).status_code == 403
        run = http.post('/simulate', headers=analyst, json={'type': 'marketing', 'parameters': {'channel': 'Facebook Ads'}}).json()
        body = {'simulation_id': run['simulation_id'], 'dataset_id': run['dataset_id'], 'decision': 'rejected'}
        assert http.post('/scenarios/feedback', json=body, headers=analyst).status_code == 200
        event = http.get('/audit?kind=scenario_feedback', headers=analyst).json()['rows'][0]
        assert event['payload']['actor'] == 'analyst'
    monkeypatch.setenv('WORKSPACE_ACCESS_TOKENS', '{}')
    with pytest.raises(ValueError, match='Production requires'):
        create_app(client[1])


def test_latest_recommendation_survives_more_than_100_other_decisions(client):
    http, engine = client
    data = http.get('/recommendations').json()
    subject = data['rows'][0]['id']
    body = {'recommendation_id': subject, 'dataset_id': data['dataset_id'], 'decision': 'accepted'}
    assert http.post('/recommendations/feedback', json=body).status_code == 200
    with engine.begin() as conn:
        conn.execute(audit.insert(), [{'kind': 'recommendation_feedback', 'subject': f'other:{i}',
            'payload': {'dataset_id': data['dataset_id'], 'decision': 'rejected'}} for i in range(105)])
    rows = http.get('/recommendations').json()['rows']
    assert next(row for row in rows if row['id'] == subject)['decision'] == 'accepted'
    page = http.get('/audit?limit=10&kind=decisions').json()
    older = http.get('/audit', params={'limit': 10, 'kind': 'decisions', 'before': page['next_before']}).json()
    assert len(page['rows']) == len(older['rows']) == 10
    assert {row['id'] for row in page['rows']}.isdisjoint(row['id'] for row in older['rows'])


def test_quality_discloses_limitations_and_sustained_detector_is_causal(client):
    import numpy as np
    import pandas as pd
    from ai_service.anomaly import detect
    quality = client[0].get('/models/quality').json()
    assert quality['dataset_kind'] == 'synthetic'
    assert quality['limitations']
    assert any(row['metric'] == 'stockout_risk' and row['status'] == 'limited' for row in quality['anomaly'])
    values = pd.Series(np.tile([95., 100., 105., 98., 102., 101., 99.], 20))
    values.iloc[100:] *= .7
    full = detect('revenue', values, None)
    prefix = detect('revenue', values.iloc[:110], None)
    assert full.flag.iloc[:110].equals(prefix.flag)
    assert full.sustained_flag.iloc[106:110].any()
