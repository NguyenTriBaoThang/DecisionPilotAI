# DecisionPilot AI — LIKELION 2026 Compliance Report

**Document ID:** AUD-08-LIKELION-COMPLIANCE  
**Audit Date:** November 11, 2026  
**Competition:** LIKELION — AI for Business Innovation 2026  
**Track:** 5. Data & Decision Intelligence

---

## 1. Track 5 Four-Pillar Compliance Matrix

| Track 5 Requirement | DecisionPilot AI Implementation | Verified Evidence & Code Modules | Status |
| :--- | :--- | :--- | :---: |
| **1. AI converts natural language questions into data reports** | Bilingual VI/EN orchestrator translates questions (OpenAI `gpt-4.1-mini`, Gemini `gemini-2.5-flash`, or regex fallback) into strict Pydantic `Intent` schemas (`extra="forbid"`) bound to fixed SQLAlchemy Core queries on `read_connection` (`READ ONLY`). Supports one-click investigation links (`/ask?q=...`). | [`ai_service/llm_orchestrator.py`](../../ai_service/llm_orchestrator.py), [`backend/app/analytics.py`](../../backend/app/analytics.py), `/ask`; **46/46 (100%)** benchmark accuracy (`1,432.2 ms` median). | **IMPLEMENTED & VERIFIED** |
| **2. AI analyzes revenue and detects significant business anomalies** | Hybrid surveillance using a **56-day rolling window shifted 7 days (`min_periods=28`)** combining `IsolationForest(n_estimators=120, contamination=0.065)` + IQR + robust Z-score + 7d sustained contraction + lead-time `stockout_risk` check, with additive root-cause decomposition. | [`ai_service/anomaly.py`](../../ai_service/anomaly.py), [`ai_service/root_cause.py`](../../ai_service/root_cause.py), `/anomalies`; **100.00% precision / 90.20% F1** on `facebook_spend`, **86.67% precision** on `revenue`. | **IMPLEMENTED & VERIFIED** |
| **3. AI forecasts demand for products/services based on historical data** | Global scaled `LGBMRegressor` across **17 causal point-in-time features** competing per `(target, scope, horizon)` over `7` and `30` days via strict `>2%` validation MAE gate vs. `moving_average` and `seasonal_naive`, plus empirical 90% interval calibration (`1–7d` / `8–30d`). | [`ai_service/features.py`](../../ai_service/features.py), [`ai_service/forecasting.py`](../../ai_service/forecasting.py), `/forecast`; promotes **LightGBM** on `sku:P001` (`2.68` units MAE, **92.86% coverage**); selects `moving_average` on aggregate revenue (`24.14%` 30d WAPE). | **IMPLEMENTED & VERIFIED** |
| **4. AI compares business scenarios to support strategic decision making** | Counterfactual pricing (linear-% elasticity $1 + e \cdot \Delta P/P_0$ with stock caps), marketing power-law diminishing returns ($(1+\Delta S)^\alpha$, $\alpha = 0.65$), and daily stock ledger balance inside interactive Three.js 3D WebGL control center linked atomically to recommendations (`recommendation_id`). | [`ai_service/scenario.py`](../../ai_service/scenario.py), [`frontend/src/features/scenario-simulator/components/ScenarioSimulator3D.tsx`](../../frontend/src/features/scenario-simulator/components/ScenarioSimulator3D.tsx), `/scenarios`; **23.99% WAPE** P001 conditional replay & `15/15` P003 depletion checks. | **IMPLEMENTED & VERIFIED** |

---

## 2. Architectural & Responsible AI Differentiators

1. **Zero Numerical Hallucination:** Arithmetic, margins, KPIs, and variance attributions execute deterministically inside PostgreSQL/SQLite via SQLAlchemy Core rather than LLM token estimation.
2. **Baseline Gate Discipline & Honest Limitations:** `moving_average` is surfaced openly when LightGBM does not clear the `>2%` validation MAE threshold; `MODEL_EVALUATION.md` and `/models/quality` disclose limited `stockout_risk` precision/recall and marketing replay variance.
3. **Human-in-the-Loop Governance:** Decisions recorded on `/scenarios/feedback` (optionally linked to `recommendation_id`) and `/recommendations/feedback` are persisted atomically into trigger-protected `audit_events` (`accepted` / `rejected`), never issuing unsupervised prices or purchase orders.
4. **Zero-Friction Judging Experience:** Accessible both full-stack (Docker Compose / local scripts) and serverless on GitHub Pages (Multi-Page `HomePage` + 17 paginated `/docs/<chapter>` pages at `/` + Interactive 3D SPA Demo at `/app/`).
