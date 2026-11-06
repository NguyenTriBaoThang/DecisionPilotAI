# DecisionPilot AI — Operations, Deployment & Troubleshooting Manual

> **Deployment Environments:** Local Development (Windows / macOS / Linux) & Production Docker Containerization  
> **Backend Service:** FastAPI on Uvicorn (Port 8000)  
> **Frontend Workspace:** Vite SPA on Node.js (Port 5173)

---

## 1. System Prerequisites

| Dependency | Minimum Version | Recommended Version | Verification Command |
| :--- | :---: | :---: | :--- |
| **Python** | 3.11+ | 3.13.0 | `python --version` |
| **Node.js** | 20.0+ | 22.0+ | `node --version` |
| **npm** | 10.0+ | 10.8+ | `npm --version` |
| **PowerShell** *(Windows)* | 5.1+ | 7.4+ | `$PSVersionTable.PSVersion` |
| **Docker Engine** *(Optional)* | 24.0+ | 27.0+ | `docker --version` |

---

## 2. Quickstart Launch Guide

### 2.1 Option A: One-Click Execution on Windows (Recommended)
Double-click the [`run.bat`](file:///g:/GITHUB/DecisionPilotAI/run.bat) file in the project root directory.

This script automatically executes:
1. Virtual environment verification (`.venv\Scripts\python.exe`).
2. Database schema migrations via Alembic (`alembic upgrade head`).
3. Bootstrap dataset validation (ensuring 50,000 transactions are populated).
4. Launches the FastAPI backend on `http://127.0.0.1:8000`.
5. Launches the Vite frontend on `http://127.0.0.1:5173`.

### 2.2 Option B: Native PowerShell Launch
Open PowerShell in the workspace root and run:
```powershell
.\scripts\dev.ps1
```

### 2.3 Option C: Manual Multi-Terminal Launch

**Terminal 1 — Backend API:**
```powershell
# Activate Python virtual environment
.\.venv\Scripts\Activate.ps1

# Ensure database schema is at head
python -m alembic upgrade head

# Populate or verify bootstrap seed data
python -m scripts.bootstrap

# Start FastAPI Uvicorn ASGI server
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — Frontend Dev Server:**
```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

---

## 3. Database Administration & Pipeline Commands

All database management and data pipeline routines are packaged as standalone Python modules:

```powershell
# 1. Generate fresh 24-month synthetic retail dataset (50,000 rows)
python -m scripts.generate --rows 50000 --months 24

# 2. Validate data integrity across all 6 tables
python -m scripts.pipeline validate

# 3. Export versioned snapshot bundle to ZIP
python -m scripts.pipeline export --out data/snapshots/dp_seed.zip

# 4. Run automated test suite
python -m pytest tests/
```

---

## 4. Production Docker Containerization

To run the entire system inside isolated production containers:

```powershell
# Build and start all services
docker compose up -d --build

# Verify running containers
docker compose ps
```

### Container Services Topology
- `web`: Nginx web server serving optimized Vite frontend bundle on port `80`.
- `api`: FastAPI ASGI application container running on port `8000`.
- `db`: PostgreSQL 16 container managing relational storage on port `5432`.

---

## 5. Automated CI/CD Pipeline

The GitHub Actions workflow at [`.github/workflows/ci.yml`](file:///g:/GITHUB/DecisionPilotAI/.github/workflows/ci.yml) executes on every push to `main` and pull request:
1. **Frontend Lint & Build:** Verifies TypeScript typing (`tsc --noEmit`) and compiles Vite production chunks (`vite build`).
2. **Backend Tests:** Executes Alembic migrations, loads synthetic dataset, and executes `pytest` integration test suites.
3. **Pipeline Integrity:** Asserts zero unhandled exceptions across `validate` and `generate` scripts.

---

## 6. Troubleshooting & FAQ

### Issue 1: Port `8000` or `5173` is already in use
**Solution:** Check and terminate conflicting processes:
```powershell
# Find process using port 8000
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object OwningProcess

# Terminate process by ID
Stop-Process -Id <PID> -Force
```

### Issue 2: Matplotlib temporary cache warning on startup
**Symptom:** `Matplotlib created a temporary cache directory at ... because there was an issue with the default path.`  
**Explanation:** On restricted or sandboxed environments, Matplotlib cannot write to user home directory.  
**Fix:** Set the environment variable:
```powershell
$env:MPLCONFIGDIR = "$pwd\artifacts"
```

### Issue 3: Vite Dev Server Proxy fails to connect to Backend
**Symptom:** Red error banner on frontend: *Unable to connect to service health.*  
**Verification:**
1. Ensure the FastAPI backend is running: browse to `http://127.0.0.1:8000/health`.
2. Verify `frontend/vite.config.ts` has the `/api` proxy configured to `http://127.0.0.1:8000` with path rewrite `path.replace(/^\/api/, '')`.

