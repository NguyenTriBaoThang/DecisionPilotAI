# DecisionPilot AI — Project Audit Report

**Document ID:** AUD-01-PROJECT-OVERVIEW  
**Audit Date:** November 10, 2026  
**System:** DecisionPilot AI (`v1.0.0` / Model Bundle `dp-1.1`)  
**Repository:** `https://github.com/NguyenTriBaoThang/DecisionPilotAI`  
**Competition Track:** LIKELION — AI for Business Innovation 2026 (Track 5: Data & Decision Intelligence)

---

## 1. Executive Summary

DecisionPilot AI is an AI-powered business analytics, forecasting, and decision-support platform designed for Small and Medium Enterprises (SMEs). The platform connects validated operational data with deterministic analytics, ML surveillance, demand forecasting, econometric scenario simulation, and audited executive governance across the loop: **Ask → Understand → Predict → Simulate → Decide**.

This audit verifies that the implementation across `frontend/`, `backend/`, `ai_service/`, `docs-site/`, `artifacts/`, and `.github/workflows/` aligns consistently with verified holdout evaluations (`MODEL_EVALUATION.md`), API benchmarks (`query_benchmark.json`), scenario replay (`scenario_backtest.json`), and automated tests.

---

## 2. Audit Scope

- **Backend & Migrations:** `backend/app/`, `backend/alembic/` (`0001_initial`, `0002_decision_integrity`), 16 FastAPI endpoints, SQLAlchemy 2.0 Core queries, Pydantic v2 schemas (`extra="forbid"`).
- **AI / ML Engine:** `ai_service/` (`features.py`, `forecasting.py`, `anomaly.py`, `root_cause.py`, `scenario.py`, `llm_orchestrator.py`).
- **Frontend & 3D Workspace:** `frontend/src/`, React `19.2`, TypeScript `5.9`, Vite `7.3`, Tailwind CSS `4.1`, Three.js `0.186` Simulator, Vitest `5.1`, Playwright `1.65`.
- **Documentation Portal:** `docs-site/`, 16 interactive chapters plus Track 5 *Data & Decision Intelligence* showcase (`src/features/data-decision-intelligence/`).
- **Dataset & Artifacts:** `data/synthetic/` (`f32e87e3a5744333ff98d3bf`, 50,000 transactions across 730 days) and `artifacts/` (`dp-1.1`).
- **CI/CD & Packaging:** `.github/workflows/ci.yml` (5 jobs), `.github/workflows/deploy-pages.yml` (`/` Docs + `/app/` SPA), `docker-compose.yml`, and `Dockerfile`.

---

## 3. High-Level System Architecture

```text
[ SME User / Executive ]
         │
         ▼
[ React 19 + Three.js App (/ & /app/)  |  GitHub Pages Docs Portal (docs-site/) ]
         │
   REST / JSON (/api proxy)
         │
         ▼
[ FastAPI Application Core (Python 3.12+ / 16 Endpoints) ]
 ├── Bearer Token RBAC (viewer / analyst / admin) + Security Headers
 ├── Constrained Intent Router (llm_orchestrator.py -> Pydantic Intent + BLOCKED guard)
 ├── Read-Only Analytical Core (read_connection -> allowlisted SQLAlchemy Core)
 ├── Forecasting Engine (17-feature LightGBM + Moving Avg / Seasonal Naive + 2% gate)
 ├── Hybrid Anomaly Engine (56d shifted Isolation Forest + IQR + Robust Z + 7d drop + stockout rule)
 └── Econometric Simulator & Audit Store (simulation_runs + audit_events)
         │
         ▼
[ Relational Storage Engine (PostgreSQL 16 / SQLite 3) ]
 ├── Business Tables (6): calendar_events, products, customers, marketing_campaigns, sales_transactions, inventory_daily
 └── System Tables (3): dataset_metadata, simulation_runs, audit_events
```

---

## 4. Key Audit Findings Summary

| Dimension | Status | Verified Evidence |
| :--- | :---: | :--- |
| **Data Integrity** | **PASS** | `f32e87e3a5744333ff98d3bf` passes all 7 structural & accounting checks across 730 days (`50,000` txns, `24,820` stock rows, `10,000` customers, `2,920` campaigns, `50` SKUs). |
| **Demand Forecasting** | **PASS** | Strict chronological split & `>2%` val MAE gate: selects `moving_average` on aggregate revenue (`24.14%` 30d / `21.84%` 7d WAPE) and promotes `lightgbm` on `sku:P001` (`2.68` MAE, `41.87%` WAPE, `92.86%` coverage). |
| **Anomaly Detection** | **PASS** | `facebook_spend`: `100.00%` precision, `82.14%` recall, `90.20%` F1 (`0.00%` FPR); `revenue`: `86.67%` precision (`38.24%` recall with 7d sustained check). |
| **NL Copilot Security** | **PASS** | `46/46` (`100%`) query benchmark pass (`1,432.2 ms` median); zero free-form SQL generation; prompt/SQL injection inputs cleanly refused. |
| **Frontend & Docs Build** | **PASS** | TypeScript + Vite builds succeed for both `frontend` and `docs-site`; `8/8` Vitest tests pass; CI workflows validate E2E & Docker. |
| **Track 5 Alignment** | **PASS** | All four LIKELION 2026 capabilities implemented end-to-end with disclosed limitations and human-in-the-loop governance. |
