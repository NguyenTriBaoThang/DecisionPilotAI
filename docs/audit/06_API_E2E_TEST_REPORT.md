# DecisionPilot AI — API & End-to-End Test Report

**Document ID:** AUD-06-API-TESTING  
**Audit Date:** November 11, 2026  
**Scope:** 16 FastAPI REST Endpoints, Frontend Vitest Suite, Playwright Browser Workflows, Backend Pytest Suite

---

## 1. Backend REST API Matrix ([`backend/app/main.py`](../../backend/app/main.py))

All 16 endpoints are exposed with OpenAPI documentation (`/api/docs` via Nginx/Vite proxy; `/docs` on direct Uvicorn) and enforce strict Pydantic v2 validation (`extra="forbid"`). When `WORKSPACE_ACCESS_TOKENS` is active (`APP_ENV=production`), Bearer tokens map callers to `viewer`, `analyst`, or `admin`:

| Endpoint | Method | Role (`token` mode) | Contract & Functionality |
| :--- | :---: | :---: | :--- |
| `/health` | GET | Public probe / Viewer detail | Minimal liveness when unauthenticated; full DB/dataset/model (`dp-1.1`) readiness when authorized |
| `/session` | GET | `viewer` | Authenticated workspace actor, role, auth mode (`local`/`token`), import policy flag |
| `/dataset` | GET | `viewer` | Active snapshot SHA-256 `dataset_id`, row counts, calendar bounds, quality status |
| `/options` | GET | `viewer` | Filter options (`categories`, `products`, `regions`, `channels`, `marketing_channels`, `segments`) |
| `/models/quality` | GET | `viewer` | Model bundle version, holdout anomaly metrics, scenario replay stats & disclosed limitations |
| `/kpi/summary` | GET | `viewer` | Multi-grain (`daily`/`weekly`/`monthly`) KPIs with prior-period comparison & group tables |
| `/query` | POST | `viewer` | Bilingual VI/EN natural-language question -> Pydantic `Intent` -> read-only analytics + `audit_events` log |
| `/anomalies` | GET | `viewer` | Severity-ranked (`critical`/`high`/`medium`) observed alerts (`limit` 1–100, default 40) |
| `/anomalies/{alert_id}` | GET | `viewer` | Single alert observed vs. 56d shifted baseline curve & additive driver attribution |
| `/forecast` | POST | `viewer` | `7` or `30`-day predictions for `revenue`/`orders`/`demand`, 90% empirical bounds & top feature drivers |
| `/simulate` | POST | `viewer` | `price`, `marketing`, or `inventory` scenario simulation persisted to `simulation_runs` |
| `/scenarios/feedback` | POST | `analyst` | Idempotent `accepted` / `rejected` recording for exact `simulation_id` (optionally linked to `recommendation_id` atomically) |
| `/recommendations` | GET | `viewer` | Ranked review actions, assumptions, risks and latest decision for the active dataset |
| `/recommendations/feedback` | POST | `analyst` | Idempotent `accepted` / `rejected` recommendation approval into `audit_events` |
| `/audit` | GET | `viewer` | Cursor-paginated (`before`/`next_before`, `limit` 1–100) `audit_events` filtered by kind or `decisions` |
| `/import` | POST | `admin` + `X-Import-Token` | Atomic CSV ZIP / XLSX snapshot replacement (`<= 40 MiB`) gated by `DEMO_ALLOW_IMPORT=true` |

---

## 2. Automated Test Suites Summary

1. **Frontend Vitest Unit & Component Tests (`frontend/src/test/`):**
   - `preferences.test.tsx` (2 tests): default `'vi'` storage persistence, VND currency formatting, malformed storage fallback.
   - `decisions.test.tsx` (4 tests): exact `simulation_id`, waiting for server confirmation, atomic recommendation binding, error/duplicate guard.
   - `import.test.tsx` (1 test): snapshot replacement confirmation, `expected_dataset_id` header, `409 Conflict` handling.
   - `api.test.ts` (2 tests): Bearer auth header injection and upload client validation.
   - **Total:** `4` test files, **`9/9` passing tests**.
2. **Backend & AI Integration Suite (`tests/test_decisionpilot.py`):**
   - **Total:** `18` collected & passing test items across `16` test functions (including parametrized 7d/30d forecast slices, `valid_intent` filter guardrails, atomic `recommendation_id` transaction, and `46`-case `benchmark_cases.json` suite).
3. **Browser End-to-End Suites (`frontend/e2e/`):**
   - `workspace.spec.ts` (`2` tests): authenticated preference restoration, exact scenario approval & audit evidence persistence, plus ZIP import & model invalidation against a disposable fixture.
   - `demo-flow.spec.ts` (`1` test): end-to-end connected loop (`dashboard warning -> /ask?q=... -> /recommendations -> Try first in simulator -> Accept scenario with recommendation_id -> settled card & audit_events`).
   - **Total:** **`3` Playwright tests** across `2` spec files.

---

## 3. End-to-End 5-Stage Decision Loop Coverage

- **Ask (`/ask`):** Queries parse into strict `Intent` structs (`46/46` benchmark match, `1,432.2 ms` median); supports direct `?q=` investigation links from Dashboard warnings (`utils/investigate.ts`).
- **Understand (`/anomalies`):** Surfaces injected September/July 2026 shocks & driver deltas without lookahead leakage.
- **Predict (`/forecast`):** Switches seamlessly between `7d` and `30d` horizons with `>2%` gate proof and 90% empirical bounds.
- **Simulate (`/scenarios`):** Interactive Three.js 3D workspace comparing alternatives and saving immutable `simulation_runs`.
- **Decide (`/recommendations`):** Human `Accept`/`Reject` recorded to trigger-protected `audit_events`, atomically settling linked scenarios and recommendations in one transaction.
