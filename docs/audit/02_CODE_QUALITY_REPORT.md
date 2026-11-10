# DecisionPilot AI — Code Quality & Architecture Audit

**Document ID:** AUD-02-CODE-QUALITY  
**Audit Date:** November 8, 2026  
**Auditor:** Senior Software Architect & Full-Stack Staff Reviewer  
**Scope:** `frontend/`, `backend/`, `ai_service/`, `scripts/`, `docs-site/`  

---

## 1. Frontend Architecture & Quality (`frontend/`)

### Tech Stack
- **Framework:** React 19.2 + TypeScript + Vite 7.3
- **Styling:** Tailwind CSS v4 + Lucide React icons
- **State Management:** TanStack React Query v5 (efficient caching, background refetching, query keys)
- **3D Engine:** Three.js 0.186 (interactive 3D scenario landscape with custom wireframe meshes, lighting, dynamic morphing)
- **Testing:** Vitest 5.1 + React Testing Library + JSDOM

### Key Modules Audited
1. **`frontend/src/Dashboard.tsx`:** Primary cockpit with dynamic KPI overview, trend graphs, product performance, marketing channels, and 4-step workflow stepper.
2. **`frontend/src/components/EndToEndStepper.tsx`:** Explicit workflow breadcrumbs guiding SME owners through:
   - *Step 1:* Overview & Diagnostics (`/`)
   - *Step 2:* Investigate Root Causes with AI Copilot (`/ask`)
   - *Step 3:* 3D Scenario Simulator (`/scenarios`)
   - *Step 4:* Actionable Recommendations (`/recommendations`)
3. **`frontend/src/components/ScenarioSimulator3D.tsx`:** Real-time Three.js renderer showing risk elevation, revenue peaks, and profit terrain based on discount/ad-spend parameters.
4. **`frontend/src/preferences.tsx`:** Full bilingual Vietnamese/English localization dictionary with currency selection (`₫ VND` formatted with `Intl.NumberFormat`).
5. **`frontend/src/api.ts` & `frontend/src/mockData.ts`:** Dual-mode network transport. When connected to FastAPI, all operations query the real backend; when executed in a static environment (GitHub Pages), seamless mock fallback ensures 100% demo continuity without console crashes.

### Code Quality Assessment
- **Type Safety:** Zero `any` escapes in core business interfaces (`KPI`, `Scenario`, `Forecast`, `Recommendation`).
- **Resilience:** Defensive accessor pattern implemented in `frontend/src/ui.tsx` for table rendering, preventing undefined property errors when rendering sparse records.
- **Build Verification:** Production bundle compiles cleanly into separate chunks (`three-vendor`, `charts`, `react-runtime`) without dead code.

---

## 2. Backend Architecture & Quality (`backend/`)

### Tech Stack
- **Framework:** FastAPI (Python 3.12 / 3.13) + Uvicorn
- **ORM & Database:** SQLAlchemy 2.0 + Alembic migrations
- **Supported Databases:** PostgreSQL 16 (production) and SQLite 3 (lightweight standalone / testing)
- **Validation:** Pydantic v2 schemas (`Filters`, `ForecastRequest`, `ScenarioRequest`, `Question`)

### Key Architecture Strengths
1. **Separation of Concerns:**
   - `backend/app/main.py`: Declarative route definitions, error translation, audit log emission.
   - `backend/app/services.py`: High-level business facades orchestrating analytics, machine learning, and simulations.
   - `backend/app/analytics.py`: Pure deterministic SQL aggregations. Math is computed strictly in the database engine, eliminating LLM arithmetic hallucination.
   - `backend/app/db.py`: Centralized engine initialization, connection pooling, and connection lifetime management.
2. **Concurrency Control:**
   - PostgreSQL advisory transaction lock (`pg_advisory_xact_lock(177480102)`) and SQLite `BEGIN IMMEDIATE` guarantee atomic dataset loads and conflict-free scenario audits.
3. **Security-First AST Querying:**
   - In `ai_service/llm_orchestrator.py`, user questions translated into SQL pass through a strict AST visitor that enforces `SELECT`-only execution, validates table whitelists, and blocks all DDL/DML keywords (`DROP`, `INSERT`, `UPDATE`, `DELETE`, `ALTER`).

---

## 3. Test Suites & Coverage

| Test File | Framework | Tests | Status | Execution Time |
| :--- | :--- | :---: | :---: | :---: |
| `frontend/src/test/preferences.test.tsx` | Vitest | 2 | **PASS** | 495ms |
| `frontend/src/test/decisions.test.tsx` | Vitest | 3 | **PASS** | 585ms |
| `frontend/src/test/import.test.tsx` | Vitest | 1 | **PASS** | 951ms |
| `frontend/src/test/api.test.ts` | Vitest | 2 | **PASS** | 15ms |
| `tests/test_decisionpilot.py` | Pytest | 16 | **PASS** (CI) | ~1.8 min |

---

## 4. Code Quality Verdict

**Rating:** **A (94/100)**  
The codebase exhibits strong modular architecture, strict typing, clean separation of presentation and business logic, and defense-in-depth security.

