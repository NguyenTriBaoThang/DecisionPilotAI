# DecisionPilot AI — Operations, Deployment & Troubleshooting Manual

> **Deployment Environments:** Local Development (Windows / macOS / Linux), Docker Compose Stack, and GitHub Pages Showcase  
> **Backend Service:** FastAPI on Uvicorn (Port `8000`)  
> **Frontend Workspace:** Vite SPA (Dev Port `5173`) | **Docs Site:** Vite (Dev Port `5174`, GitHub Pages `/`)

---

## 1. System Prerequisites

| Dependency | Recommended Version | Purpose | Verification |
| :--- | :---: | :--- | :--- |
| **Python** | **3.12** (tested CI/Docker; compatible with 3.11–3.13) | FastAPI backend, Alembic, LightGBM & scikit-learn | `python --version` |
| **Node.js & npm** | **Node 22+** (matching Dockerfile & CI) | React 19 frontend, Vitest, Playwright & Docs Portal | `node --version` |
| **Docker & Compose** | Docker Engine 24+ / Compose v2+ | Optional one-command PostgreSQL 16 + FastAPI + Nginx stack | `docker compose version` |

---

## 2. Quickstart Launch Guide

### 2.1 Option A: One-Click Windows Execution
Double-click [`run.bat`](../run.bat) or execute via npm from repo root:
```powershell
npm run dev
```
[`scripts/dev.ps1`](../scripts/dev.ps1) runs:
1. `python -m alembic upgrade head` (using `.venv\Scripts\python.exe` if present).
2. `python -m scripts.bootstrap` (loads `data/synthetic` if database is empty).
3. Starts FastAPI on `http://127.0.0.1:8000`, `docs-site` on `http://127.0.0.1:5174/DecisionPilotAI/`, and Vite `frontend` on `http://127.0.0.1:5173`.

On macOS / Linux:
```bash
npm run dev:sh   # runs scripts/dev.sh (FastAPI :8000 + Vite frontend :5173)
```

### 2.2 Option B: Manual Multi-Terminal Launch

```powershell
# Terminal 1 — Backend API
.\.venv\Scripts\Activate.ps1
python -m alembic upgrade head
python -m scripts.bootstrap
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — Frontend Dev Server
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173

# Terminal 3 — Documentation Portal (Optional)
npm --prefix docs-site run dev
```

---

## 3. Data Pipeline, Model Training & Verification Commands

All operational CLI scripts accept exact flags defined in `scripts/`:

```bash
# 1. Regenerate 24-month synthetic snapshot (50,000 transactions, seed 42)
python -m scripts.generate --months 24 --transactions 50000 --output data/synthetic

# 2. Validate snapshot integrity without mutating database
python -m scripts.pipeline validate data/synthetic --report artifacts/data_quality.json

# 3. Load verified snapshot into active DATABASE_URL (only when DB empty or matching kind/ID)
python -m scripts.pipeline load data/synthetic

# 4. Retrain forecasting + anomaly bundle (artifacts/<dataset_id>.joblib)
python -m scripts.train --out artifacts

# 5. Regenerate MODEL_EVALUATION.md, CSV reports & 10 evaluation figures
python -m scripts.report

# 6. Run tests & builds
python -m pytest tests/test_decisionpilot.py -v
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix docs-site run build
```

---

## 4. Docker Compose Production Topology ([`docker-compose.yml`](../docker-compose.yml))

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Defined Compose services:
- `postgres`: `postgres:16` database with `pg_isready` health check and persistent volume `decisionpilot_db`.
- `backend`: Built from root [`Dockerfile`](../Dockerfile) (`python:3.12-slim`, non-root user `decisionpilot`), sets `ROOT_PATH=/api`, runs `scripts/start_backend.sh` (`alembic upgrade head`, `scripts.bootstrap`, Uvicorn `:8000`).
- `frontend`: Multi-stage Node 22 build served by Nginx (`127.0.0.1:${WEB_PORT:-8080}:80`), proxying `/api/` to `http://backend:8000/` (`http://localhost:8080/api/health`, `http://localhost:8080/api/docs`).

*(For multi-user or exposed deployments, set `APP_ENV=production` and configure `WORKSPACE_ACCESS_TOKENS` in `.env` as documented in [`IMPROVEMENTS.md`](./IMPROVEMENTS.md)).*

---

## 5. GitHub Actions CI & Pages Deployment

- **[`.github/workflows/ci.yml`](../.github/workflows/ci.yml):** Runs on push/PR to `main`, `master`, `develop`:
  - `frontend-check` (Node 22): `npm ci`, `npm run build`, `npm test`, `npm audit --audit-level=high`.
  - `docs-check` (Node 22): `npm ci`, `npm run build` in `docs-site/`.
  - `backend-check` (Python 3.12, matrix `sqlite` + `postgresql:16`): `alembic upgrade head`, `scripts.bootstrap`, `pytest -q`, `scripts.pipeline validate`.
  - `browser-workflow` (Python 3.12 + Node 22): Playwright Chromium E2E workflow (`npm run test:e2e`).
  - `docker-build-check`: Validates `docker build` of the backend image.
- **[`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml):** On push to `main`, builds `docs-site` at `/` and `frontend` with `--base=/DecisionPilotAI/app/` into `docs-site/dist/app/`, injects root `404.html` SPA redirect handling, and publishes to GitHub Pages (requires **Settings → Pages → Source: GitHub Actions**).

---

## 6. Troubleshooting

1. **Port `8000` or `5173` in use (Windows):**
   `Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object OwningProcess`
2. **Matplotlib cache permissions on restricted environments:**
   `$env:MPLCONFIGDIR = "$pwd\artifacts"`
3. **Frontend shows static offline banner:**
   Confirm `http://127.0.0.1:8000/health` returns `{"status":"ok",...}` and verify `frontend/vite.config.ts` proxies `/api` to `http://127.0.0.1:8000`.
4. **PowerShell App Control blocks `.venv/Scripts/pytest.exe` on Windows:**
   Always run via `.\.venv\Scripts\python.exe -m pytest` (matching CI's `python -m pytest`).
