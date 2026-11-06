"""Serve an isolated, disposable business workspace for browser regression tests."""
import json
import os
from io import BytesIO
from zipfile import ZipFile
from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn
from alembic import command
from alembic.config import Config

from backend.app.db import ROOT, make_engine
from scripts.pipeline import load_snapshot, read_directory
from scripts.pipeline import export_bundle
from scripts.generate import generate
from fastapi.responses import Response


if __name__ == "__main__":
    with TemporaryDirectory(prefix="decisionpilot-browser-") as folder:
        os.environ.update(DATABASE_URL="sqlite:///"+str(Path(folder)/"workspace.sqlite"), LLM_PROVIDER="none",
                          APP_ENV="production", DEMO_ALLOW_IMPORT="true", IMPORT_TOKEN="e2e-import-only",
                          WORKSPACE_ACCESS_TOKENS=json.dumps({
                              "e2e-admin-token-for-isolated-tests-only": {"actor": "browser-admin", "role": "admin"}}))
        command.upgrade(Config(str(ROOT/"alembic.ini")), "head")
        engine = make_engine()
        data, manifest = read_directory(ROOT/"data/synthetic")
        load_snapshot(engine, data, manifest)
        from backend.app.main import create_app
        app = create_app(engine)
        imported, imported_manifest = generate(months=8, transactions=800, sku_count=8, customer_count=100)
        bundle_dir = Path(folder)/"bundle"
        bundle_dir.mkdir()
        export_bundle(bundle_dir, imported, imported_manifest)
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            for path in bundle_dir.glob("*.csv"):
                archive.write(path, path.name)

        @app.get("/e2e/snapshot", include_in_schema=False)
        def snapshot():
            return Response(buffer.getvalue(), media_type="application/zip")

        try:
            uvicorn.run(app, host="127.0.0.1", port=8765)
        finally:
            engine.dispose()
