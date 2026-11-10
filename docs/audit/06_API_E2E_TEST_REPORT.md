# DecisionPilot AI — API & End-to-End Test Report

**Document ID:** AUD-06-API-TESTING  
**Audit Date:** November 8, 2026  
**Auditor:** QA Automation & Integration Lead  
**Scope:** Backend HTTP Endpoints, Frontend Integration Tests, Browser Workflow  

---

## 1. Backend REST API Matrix & Status

All endpoints verified against OpenAPI 3.1 specification (`/openapi.json`):

| Endpoint | Method | Scope / Description | Auth Required | Status |
| :--- | :---: | :--- | :---: | :---: |
| `/health` | GET | System status, database connectivity, model readiness | No | **200 OK** |
| `/dataset` | GET | Active dataset metadata, date range, table record counts | No | **200 OK** |
| `/options` | GET | Dynamic filter values (regions, categories, SKUs, channels) | No | **200 OK** |
| `/kpi/summary` | GET | Aggregated revenue, gross profit, margin, ROAS, trends | No | **200 OK** |
| `/query` | POST | Natural language business question to SQL answering | Yes (Token) | **200 OK** |
| `/anomalies` | GET | Anomaly feed with severity filtering and contribution drill-down | No | **200 OK** |
| `/anomalies/{id}` | GET | Detailed time-series chart and driver analysis for single alert | No | **200 OK** |
| `/forecast` | POST | Multi-horizon demand and revenue predictions with intervals | No | **200 OK** |
| `/simulate` | POST | Multi-scenario simulation (price elasticity, inventory, ad spend) | No | **200 OK** |
| `/recommendations` | GET | Actionable business recommendations ranked by ROI | No | **200 OK** |
| `/recommendations/feedback` | POST | Approve / Reject / Defer recommendation with audit logging | Yes (Token) | **200 OK** |
| `/import` | POST | Upload and validate new dataset snapshot (.zip / .xlsx) | Yes (Admin) | **200 OK** |
| `/audit` | GET | Historical audit log entries for executive governance | Yes (Token) | **200 OK** |

---

## 2. Frontend Vitest Automated Test Results

Executed with Vitest 5.1 and JSDOM:

```
 RUN  v5.1.0 G:/GITHUB/DecisionPilotAI/frontend

 ✓ src/test/preferences.test.tsx (2 tests) 495ms
   ✓ saves preferences, applies formatting, and restores saved selections
   ✓ recovers from malformed or unsupported stored preferences
 ✓ src/test/decisions.test.tsx (3 tests) 585ms
   ✓ records the scenario ID and waits for server confirmation
   ✓ updates decision state on approval
   ✓ prevents duplicate submissions
 ✓ src/test/import.test.tsx (1 test) 951ms
   ✓ requires confirmation, sends expected snapshot ID, and displays conflicts
 ✓ src/test/api.test.ts (2 tests) 15ms
   ✓ handles standard network responses
   ✓ transparently triggers mock fallback in static demo environments

 Test Files  4 passed (4)
      Tests  8 passed (8)
   Duration  9.83s
```

---

## 3. End-to-End Decision Workflow Validation

The 4-stage business loop was verified end-to-end:
1. **Overview Cockpit (`/`):** Total revenue (₫1.45B), Gross margin (43.1%), ROAS (3.42x), top SKUs, and anomaly alert banner display accurately.
2. **AI Copilot (`/ask`):** User submits: *"Why did revenue drop in September?"*. System analyzes sales and marketing channels, attributing drop to Meta Ads saturation and SKU P003 stockout.
3. **Scenario Simulator (`/scenarios`):** Executive models 5% discount vs 10% discount on SmartDesk Mini. Real-time 3D Three.js mesh displays profit surface and stockout risk boundary.
4. **Actionable Recommendations (`/recommendations`):** System generates prioritized cards. Executive clicks **"Approve & Execute"**; decision is immutably committed to audit log.

---

## 4. Test Verification Verdict

**Status:** **100% PASS**  
Zero regressions, zero broken routes, and fully verified end-to-end user journeys.

