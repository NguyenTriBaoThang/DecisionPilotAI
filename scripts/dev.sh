#!/bin/sh
set -eu
python_bin="${DECISIONPILOT_PYTHON:-.venv/bin/python}"
if [ ! -x "$python_bin" ] && [ -z "${DECISIONPILOT_PYTHON:-}" ]; then
    python_bin=python3
fi
"$python_bin" -m alembic upgrade head
"$python_bin" -m scripts.bootstrap
"$python_bin" -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 &
backend_pid=$!
trap 'kill "$backend_pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [ "$#" -eq 0 ]; then
    set -- --host 127.0.0.1 --port "${PORT:-5173}" --strictPort
fi
npm --prefix frontend run dev -- "$@"
