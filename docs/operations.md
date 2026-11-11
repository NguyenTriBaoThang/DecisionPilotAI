# DecisionPilot AI — Operations, Deployment & Troubleshooting Manual

> **Deployment Environments:** Local Development (Windows / macOS / Linux), Docker Compose Stack, & GitHub Pages Static Portal  
> **Local Endpoints:** Frontend `:5173` · Docs Portal `:5174/DecisionPilotAI/` · Backend API `:8000` (Docker Compose on `127.0.0.1:8080`)

---

## 1. System Prerequisites

| Dependency | Minimum Version | Recommended Version | Verification Command |
| :--- | :---: | :---: | :--- |
| **Python** | 3.11+ | 3.12 / 3.13 | `python --version` |
| **Node.js** | 20.0+ | 22.0+ | `node --version` |
| **npm** | 10.0+ | 10.8+ | `npm --version` |
| **PowerShell** *(Windows)* | 5.1+ | 7.4+ | `$PSVersionTable.PSVersion` |
| **Docker Engine** *(Optional)* | 24.0+ | 27.0+ | `docker --version` |

---

## 2. Quickstart Launch Guide

### 2.1 Option A: One-Click Execution on Windows (Recommended)
Run [`run.bat`](../run.bat) in the project root directory (or invoke PowerShell directly):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
```

This launcher automatically:
1. Selects `.venv\Scripts\python.exe` if present.
2. Applies Alembic migrations (`python -m alembic upgrade head`).
3. Verifies or populates the bootstrap snapshot (`python -m scripts.bootstrap`).
4. Starts FastAPI Uvicorn on `http://127.0.0.1:8000`, Docs Portal on `http://127.0.0.1:5174/DecisionPilotAI/`, and Vite SPA on `http://127.0.0.1:5173`.

### 2.2 Option B: Manual Multi-Terminal Launch

**Terminal 1 — Backend API:**
```powershell
.\.venv\Scripts\Activate.ps1
python -m alembic upgrade head
python -m scripts.bootstrap
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — Frontend Workspace & Multi-Page Docs Portal:**
```powershell
# Workspace SPA (http://127.0.0.1:5173)
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173

# Multi-Page Technical Documentation Portal (http://127.0.0.1:5174/DecisionPilotAI/)
npm --prefix docs-site run dev
```

---

## 3. Data Pipeline, Model Training & Benchmark Commands

Exact CLI flags verified against `scripts/`:

```powershell
# 1. Regenerate 24-month synthetic snapshot (50,000 transactions, seed=42)
python -m scripts.generate --months 24 --transactions 50000 --output data/synthetic

# 2. Validate structural & accounting checks on a snapshot bundle
python -m scripts.pipeline validate data/synthetic --report artifacts/data_quality.json

# 3. Retrain LightGBM + IsolationForest bundles for the active DB snapshot
python -m scripts.train --out artifacts

# 4. Run 46-case offline conversational benchmark (local rules)
python -m scripts.benchmark --out artifacts/query_benchmark.json

# 5. Execute automated test suites
python -m pytest tests/test_decisionpilot.py -q
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix docs-site run build
```

---

## 4. Production Docker Containerization (`docker-compose.yml`)

```powershell
cp .env.example .env
docker compose up -d --build
docker compose ps
```

### Container Services Topology
- **`frontend`:** Multi-stage Node `22-alpine` + `nginx:1.27-alpine` bound to `127.0.0.1:${WEB_PORT:-8080}:80`; proxies `/api/*` -> `http://backend:8000/`. Verify health via `http://localhost:8080/api/health`.
- **`backend`:** `python:3.12-slim` non-root container (`decisionpilot`) running `scripts/start_backend.sh` (`alembic upgrade head`, `scripts.bootstrap`, Uvicorn `:8000`, `ROOT_PATH=/api`).
- **`postgres`:** `postgres:16` database service with persistent `decisionpilot_db` volume and readiness health check.

---

## 5. Automated CI/CD & GitHub Pages Workflows

1. **CI Pipeline ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)):** Runs 5 parallel/matrix jobs on pushes & PRs to `main`, `master`, and `develop`:
   - `frontend-check`: Node `22`, `npm ci`, `npm run build`, `npm test` (`9/9` Vitest), `npm audit --audit-level=high`.
   - `docs-check`: Node `22`, `npm ci`, `npm run build` (`docs-site`).
   - `backend-check`: Python `3.12` across `sqlite` and `postgresql:16`, Alembic migrations, `scripts.bootstrap`, `pytest`, and `scripts.pipeline validate`.
   - `browser-workflow`: Installs Playwright Chromium and runs `frontend/e2e/` (`3` tests across `workspace.spec.ts` & `demo-flow.spec.ts`).
   - `docker-build-check`: Validates `docker build -t decisionpilot-ai:ci .`.
2. **GitHub Pages Deploy ([`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)):** Builds `docs-site` (multi-page portal at `/DecisionPilotAI/`) and `frontend --base=/DecisionPilotAI/app/` (live demo SPA at `/DecisionPilotAI/app/`), injecting unified `404.html` redirect support (`dp-docs-redirect` & `dp-spa-redirect`). Requires **Settings -> Pages -> Source = GitHub Actions**.

---

## 6. Troubleshooting & FAQ

### Issue 1: Port `8000`, `5173`, or `5174` is already in use
```powershell
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

### Issue 2: Matplotlib temporary cache warning
```powershell
$env:MPLCONFIGDIR = "$pwd\artifacts"
```

### Issue 3: Frontend shows *Unable to connect to service health*
1. Confirm Uvicorn is listening: check `http://127.0.0.1:8000/health`.
2. In Vite dev mode (`frontend/vite.config.ts`), `/api` proxies to `http://127.0.0.1:8000` (rewriting `/api` -> `""`), matching `ROOT_PATH=/api` and `API_BASE` fallback behavior.
