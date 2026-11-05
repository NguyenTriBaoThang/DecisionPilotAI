#!/bin/sh
set -eu
python -m alembic upgrade head
python -m scripts.bootstrap
exec python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
