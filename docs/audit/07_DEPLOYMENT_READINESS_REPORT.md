# DecisionPilot AI — Deployment Readiness & DevOps Audit

**Document ID:** AUD-07-DEPLOYMENT-READINESS  
**Audit Date:** November 10, 2026  
**Target Environments:** GitHub Pages Dual Showcase (`docs-site` + `/app/`), Local Dev Launchers (`scripts/dev.ps1` / `dev.sh`), Docker Compose Stack (`docker-compose.yml`)

---

## 1. Deployment Topology

1. **GitHub Pages Unified Deployment (`https://nguyentribaothang.github.io/DecisionPilotAI/`):**
   - Serves the interactive technical documentation portal (`docs-site/`) at `/`.
   - Bundles the full React + Three.js application (`frontend/`) with `--base=/DecisionPilotAI/app/` under `/app/`, automatically falling back to offline static demo data (`frontend/src/api.ts` + `mockData.ts`) when no live FastAPI server is present.
   - Deep links inside `/DecisionPilotAI/app/*` are preserved on GitHub Pages via a root `404.html` redirect storing `sessionStorage['dp-spa-redirect']` consumed in `frontend/src/main.tsx`.
2. **Containerized Enterprise Stack (`docker-compose.yml`):**
   - `postgres`: `postgres:16` with health checks and persistent `decisionpilot_db` volume.
   - `backend`: `python:3.12-slim` multi-stage build (`Dockerfile`), non-root user `decisionpilot`, runs `scripts/start_backend.sh` (`alembic upgrade head`, `scripts.bootstrap`, Uvicorn `:8000`, `ROOT_PATH=/api`).
   - `frontend`: Node `22-alpine` build served via Nginx (`127.0.0.1:${WEB_PORT:-8080}:80`), proxying `/api/` -> `http://backend:8000/` (`90s` timeout, security headers).

---

## 2. GitHub Pages Pipeline ([`.github/workflows/deploy-pages.yml`](../../.github/workflows/deploy-pages.yml))

```yaml
jobs:
  build:
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - working-directory: docs-site
        run: |
          npm ci
          npm run build
      - working-directory: frontend
        run: |
          npm ci
          npm run build -- --base=/DecisionPilotAI/app/
      - name: Bundle Documentation & Live App Artifacts
        run: |
          mkdir -p docs-site/dist/app
          cp -r frontend/dist/* docs-site/dist/app/
          python3 -c '... inject dp-spa-redirect handler into docs-site/dist/404.html ...'
          cp docs-site/dist/app/index.html docs-site/dist/app/404.html
```

**Repository Setting Prerequisite:** In GitHub repository settings under **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.

---

## 3. Continuous Integration Pipeline ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml))

Runs automatically on pushes and PRs to `main`, `master`, and `develop` across 5 independent jobs:

1. **`frontend-check` (Node 22):** `npm ci`, `npm run build` (`tsc --noEmit && vite build`), `npm test` (8 Vitest tests), `npm audit --audit-level=high`.
2. **`docs-check` (Node 22):** `npm ci`, `npm run build` (`tsc -b && vite build`) inside `docs-site/`.
3. **`backend-check` (Python 3.12, matrix `sqlite` + `postgresql:16`):** `alembic upgrade head`, `scripts.bootstrap`, `pytest -q`, `scripts.pipeline validate`.
4. **`browser-workflow` (Python 3.12 + Node 22):** Installs Playwright Chromium and runs `npm run test:e2e`.
5. **`docker-build-check`:** Validates `docker build -t decisionpilot-ai:ci .`.

---

## 4. Deployment Readiness Verdict

**Status:** **READY FOR DEPLOYMENT** (all local builds, unit suites, workflow YAML schemas, and container recipes verified).
