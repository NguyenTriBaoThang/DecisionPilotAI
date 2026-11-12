from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from backend.app.db import make_engine

ROOT = Path(__file__).resolve().parents[1]


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
    tokens = {role: "investigation-test-token-" + role for role in ("viewer", "analyst", "admin")}
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
