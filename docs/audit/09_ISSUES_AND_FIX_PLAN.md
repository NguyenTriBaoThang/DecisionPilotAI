# DecisionPilot AI — Issues Log & Safe Fixes Verification Record

**Document ID:** AUD-09-FIX-PLAN  
**Updated Date:** November 10, 2026  
**Mode:** Audit First — Safe Fixes Only (Zero changes to `ai_service/`, `backend/` business formulas, database schemas, or model artifacts)

---

## 1. Executed Safe Fixes (Verified)

| ID | Priority | Subsystem | Issue Found | Safe Resolution Applied | Verification Status |
| :--- | :---: | :--- | :--- | :--- | :---: |
| **FIX-01** | **P1** | Frontend Test | `preferences.test.tsx` expected default `'vi'` language preference with matching Vietnamese labels. | Preserved default `{ language: 'vi', currency: 'vnd' }` in `frontend/src/preferences.tsx` matching `preferences.test.tsx`. | **PASS (`8/8` Vitest)** |
| **FIX-02** | **P1** | UI / Mock Data | Sparse table cells rendered dashes (`—`) and `mockData.ts` used stale non-matching forecast/anomaly numbers. | Added defensive row fallback accessor in `frontend/src/ui.tsx` and aligned `frontend/src/mockData.ts` & `frontend/src/api.ts` with `f32e87e3a5744333ff98d3bf` and `dp-1.1`. | **PASS (Verified UI + Tests)** |
| **FIX-03** | **P1** | Frontend / GitHub Pages Routing | `BrowserRouter` basename and direct subpath navigation (`/DecisionPilotAI/app/*`) risked broken deep links on GitHub Pages; static documentation page inside app needed updated technical links. | Configured dynamic `/DecisionPilotAI/app` basename + `dp-spa-redirect` handler in `frontend/src/main.tsx` and aligned `TechnicalDocumentationPage.tsx`, `LandingPage.tsx`, `WorkspacePages.tsx`. | **PASS (`vite build` + `--base=/DecisionPilotAI/app/`)** |
| **FIX-04** | **P1** | CI/CD & Pages Workflows | `deploy-pages.yml` lacked `--base=/DecisionPilotAI/app/` and root `404.html` redirect script; `ci.yml` lacked `docs-site` build verification. | Updated `.github/workflows/deploy-pages.yml` to inject `dp-spa-redirect` and bundle `/app/`; added `docs-check` job (Node 22) in `.github/workflows/ci.yml`. | **PASS (YAML validated + builds verified)** |
| **FIX-05** | **P1** | Docs Portal UI & Data | `docs-site/` sections, interactive showcase tabs (`TabDemandForecasting`, `TabScenarioSimulation`, `TabRevenueAnalysis`, `TabAskData`), `InteractiveSimulatorDemo`, and `Section01..Section16` contained fabricated metrics (`11.24%`, `92.4%`, AST SQL, log-log/Hill curves, stale CLI flags) and a chart Y-axis scaling bug when toggling to `SKU P001 Units` view. | Rewrote data modules & sections cleanly to reflect 17 features, `>2%` gate, `7d/30d` horizons, `56d` shifted baseline, linear-% elasticity, power `0.65`, P001 catalog/scenario math, verified CLI flags, and fixed SKU chart normalization in `TabDemandForecasting.tsx`. | **PASS (`docs-site` `tsc -b && vite build` exit 0)** |
| **FIX-06** | **P1** | Markdown Documentation | Root `README.md`, `ARCHITECTURE.md`, `COMPETITION_SUBMISSION.md`, `MODEL_VERSIONING.md`, and `docs/*.md` + `docs/audit/*.md` drifted from actual code/artifacts. | Audited every file directly against `ai_service/`, `backend/`, `scripts/`, `tests/`, and `artifacts/` and synchronized 100% of figures, routes, formulas, file paths, and workflows. | **PASS (Cross-repo regex sweep clean)** |

---

## 2. Tracked Backlog Enhancements (Out of Scope for Safe Fixes)

| ID | Priority | Subsystem | Observation | Recommended Future Work |
| :--- | :---: | :--- | :--- | :--- |
| **BACKLOG-01** | **P2** | Repository Settings | GitHub Pages automated publish requires **Settings → Pages → Source = GitHub Actions**. | Configure once in GitHub repository settings prior to pushing to `main`. |
| **BACKLOG-02** | **P2** | Backend Pytest Fixture Speed | Full integration suite populates 50,000 rows in temp DB fixtures on NTFS. | Optionally introduce a lightweight synthetic unit fixture alongside full integration tests. |
| **BACKLOG-03** | **P3** | Bundle Chunk Optimization | Vite notes `three-vendor` chunk size `> 500 kB` minified (`534.61 kB`, expected for WebGL 3D scenes; `ScenarioSimulator3D` is already `lazy()`-loaded). | Consider splitting `three/examples/jsm` utilities or increasing `chunkSizeWarningLimit` if needed. |
| **BACKLOG-04** | **P3** | Multi-Tenancy | Active workspace binds one `dataset_metadata` row at a time (`MVP single-workspace`). | Partition operational tables and `artifacts/` by `tenant_id` in future SaaS releases. |
