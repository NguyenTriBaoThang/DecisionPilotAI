# DecisionPilot AI — Code Quality & Architecture Audit

**Document ID:** AUD-02-CODE-QUALITY  
**Audit Date:** November 10, 2026  
**Scope:** `frontend/`, `backend/`, `ai_service/`, `scripts/`, `docs-site/`, `tests/`

---

## 1. Frontend Architecture & Quality (`frontend/`)

### Tech Stack
- **Framework:** React `19.2.0` + TypeScript `5.9.3` + Vite `7.3.7`
- **Styling & Charts:** Tailwind CSS `4.1.17`, Recharts `3.4.1`, Lucide React
- **State & Routing:** TanStack React Query `5.90.10`, React Router `7.18.5`, Zod `4.6.7`
- **3D WebGL Engine:** Three.js `0.186.1` (`HolographicAIDataSphere.tsx`, `ScenarioSimulator3D.tsx`, `Scenario3DLandscape.tsx`)
- **Testing:** Vitest `5.1.0` + React Testing Library + JSDOM + Playwright `1.65.0`

### Key Audited Modules
1. `frontend/src/Dashboard.tsx`: Dynamic KPI cockpit with period comparisons, revenue trend charts, product/marketing breakdowns, and workflow navigation.
2. `frontend/src/WorkspacePages.tsx`: Houses `/ask`, `/anomalies`, `/forecast`, `/scenarios`, and `/recommendations` workspaces plus `/audit` history views.
3. `frontend/src/features/scenario-simulator/components/ScenarioSimulator3D.tsx`: Coordinates 5 holographic views (`overview`, `pricing`, `marketing`, `inventory`, `recommendations`), interaction modes (`overview`, `focus`, `compare`), and server-persisted decision actions.
4. `frontend/src/preferences.tsx` & `frontend/src/main.tsx`: EN/VI language persistence, VND currency formatting, basename handling (`/DecisionPilotAI/app` vs `/`), and `dp-spa-redirect` restoration on GitHub Pages.
5. `frontend/src/api.ts` & `frontend/src/mockData.ts`: Automatic fallback to aligned static demo snapshots when deployed statically on GitHub Pages (`/app/`).

### Code Quality Notes
- Strict TypeScript compilation (`tsc --noEmit`) and production bundle chunking (`three-vendor`, `charts`, `react-runtime`).
- Defensive row accessor helpers in `frontend/src/ui.tsx` prevent rendering issues on optional fields.

---

## 2. Backend & AI Service Architecture (`backend/` & `ai_service/`)

### Tech Stack
- **API Framework:** FastAPI `0.121.3` + Uvicorn `0.38.0` + Pydantic v2 (`ConfigDict(extra="forbid")`)
- **ORM & Migrations:** SQLAlchemy `2.0.44` Core + Alembic `1.17.2` (`0001_initial`, `0002_decision_integrity`)
- **Databases:** PostgreSQL `16` (Docker / CI) and SQLite `3` (`data/local.sqlite`)
- **ML Libraries:** LightGBM `4.6.0`, scikit-learn `1.7.2`, Pandas `2.3.3`, NumPy `2.2.6`, Joblib `1.5.2`

### Architectural Controls
1. **Clean Separation:**
   - `backend/app/main.py`: 16 FastAPI endpoints, role-based access middleware (`viewer` / `analyst` / `admin`), error handlers, and advisory locks.
   - `backend/app/services.py`: Orchestrates analytics queries, trained artifact loading (`dp-1.1`), simulations, and rule-grounded recommendations.
   - `backend/app/analytics.py`: Pre-written, parameterized SQLAlchemy Core aggregations inside `read_connection`.
   - `ai_service/llm_orchestrator.py`: Regex guard (`BLOCKED`) + structured Pydantic `Intent` binding + allowlisted SQLAlchemy execution (no free-form LLM SQL execution).
2. **Concurrency & Data Locks:** PostgreSQL `pg_advisory_xact_lock(177480102)` and SQLite `BEGIN IMMEDIATE` serialize dataset imports and decision commits with `dataset_id` conflict checks (`409 Conflict`).

---

## 3. Automated Test Suites

| Test Suite | Framework | Cases | Scope |
| :--- | :--- | :---: | :--- |
| `frontend/src/test/preferences.test.tsx` | Vitest | 2 | Preference persistence, VND formatting, invalid storage recovery |
| `frontend/src/test/decisions.test.tsx` | Vitest | 3 | Exact `simulation_id`, server confirmation wait, duplicate guard |
| `frontend/src/test/import.test.tsx` | Vitest | 1 | Upload confirmation, expected hash check, `409` conflict display |
| `frontend/src/test/api.test.ts` | Vitest | 2 | Bearer token header propagation & offline fallback behavior |
| `tests/test_decisionpilot.py` | Pytest | 16 *(14 functions)* | API contracts, leakage-free features, anomaly/scenario logic, RBAC, append-only audit, 46-case NL benchmark |
| `frontend/e2e/` | Playwright | 2 | End-to-end auth, scenario decision persistence, audit history & ZIP import |
