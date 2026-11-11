# DecisionPilot AI — Issues Log & Safe Fixes Verification Record

**Document ID:** AUD-09-FIX-PLAN  
**Updated Date:** November 11, 2026  
**Mode:** Audit First — Safe Fixes Only (Zero changes to `ai_service/`, `backend/` business formulas, database schemas, or model artifacts)

---

## 1. Executed Safe Fixes (Verified)

| ID | Priority | Subsystem | Issue Found | Safe Resolution Applied | Verification Status |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **FIX-01** | **P1** | Frontend Preferences & Connected Flow | Default workspace language consistency (`preferences.test.tsx`), warning-to-Copilot handoff, and atomic recommendation-scenario decision recording. | Preserved `'vi'` default matching `preferences.test.tsx`, added `utils/investigate.ts` (`?q=...`), transactional `recommendation_id` in `/scenarios/feedback`, `demo-flow.spec.ts`, and `CONTEXT.md`. | **PASS (`9/9` Vitest + `3` Playwright E2E specs)** |
| **FIX-02** | **P1** | UI / Mock Data | Sparse table cells rendered dashes (`—`) and `mockData.ts` needed synchronization with verified `dp-1.1` outputs. | Added defensive row fallback accessor in `frontend/src/ui.tsx` and aligned `frontend/src/mockData.ts` & `frontend/src/api.ts` with `f32e87e3a5744333ff98d3bf` and `dp-1.1`. | **PASS (Verified UI + Tests)** |
| **FIX-03** | **P1** | Frontend & GitHub Pages Routing | `BrowserRouter` basename and direct subpath navigation (`/DecisionPilotAI/app/*`) needed proper redirect handling; embedded docs/landing copy contained stale metrics and SQL-generation wording. | Configured `/DecisionPilotAI/app` basename priority + `dp-spa-redirect` restoration in `frontend/src/main.tsx`; reconciled `LandingPage.tsx` and `TechnicalDocumentationPage.tsx`. | **PASS (`vite build` + `--base=/DecisionPilotAI/app/`)** |
| **FIX-04** | **P1** | CI/CD & Pages Workflows | `deploy-pages.yml` needed unified redirect handling for both `/DecisionPilotAI/` multi-page docs and `/DecisionPilotAI/app/` SPA; `ci.yml` lacked a dedicated `docs-site` build gate. | Updated `.github/workflows/deploy-pages.yml` to inject dual `dp-docs-redirect` + `dp-spa-redirect` handling into `404.html`; added `docs-check` job (Node 22) in `.github/workflows/ci.yml`; updated `.github/*.md`. | **PASS (YAML validated + builds verified)** |
| **FIX-05** | **P1** | Multi-Page Docs Portal | GitHub Pages site (`docs-site/`) previously loaded all 17 chapters on one continuous scrolling page with several legacy metric/architecture descriptions. | Refactored `docs-site/` into a **Multi-Page Portal**: dedicated `HomePage` at `/DecisionPilotAI/` -> `17` paginated chapters (`/docs/<id>`) with Breadcrumbs, Prev/Next nav, dynamic `RightTOC`, Ctrl+K `SearchDialog`, and `?tab=` deep links, all reconciled to real code & artifacts. | **PASS (`docs-site` `tsc -b && vite build` + Playwright verified)** |
| **FIX-06** | **P1** | Markdown Documentation | Root `README.md`, `ARCHITECTURE.md`, `COMPETITION_SUBMISSION.md`, `MODEL_VERSIONING.md`, and `docs/*.md` + `docs/audit/*.md` drifted from actual code/artifacts and multi-page structure. | Reconciled 100% of root & `docs/` Markdown files directly against `ai_service/`, `backend/`, `scripts/`, `tests/`, `artifacts/`, and multi-page `docs-site/`. | **PASS (Cross-repo regex sweep clean)** |

---

## 2. Tracked Backlog Enhancements (Out of Scope for Safe Fixes)

| ID | Priority | Subsystem | Observation | Recommended Future Work |
| :--- | :---: | :--- | :--- | :--- |
| **BACKLOG-01** | **P2** | Repository Settings | GitHub Pages automated publish requires **Settings -> Pages -> Source = GitHub Actions**. | Configure once in GitHub repository settings prior to pushing to `main`. |
| **BACKLOG-02** | **P2** | Backend Pytest Fixture Speed | Full integration suite populates 50,000 rows in temp DB fixtures on NTFS. | Optionally introduce a lightweight synthetic unit fixture alongside full integration tests. |
| **BACKLOG-03** | **P3** | Bundle Chunk Optimization | Vite notes `three-vendor` chunk size `> 500 kB` minified (`534.61 kB`, expected for WebGL 3D scenes; `ScenarioSimulator3D` is already `lazy()`-loaded). | Consider splitting `three/examples/jsm` utilities or increasing `chunkSizeWarningLimit` if needed. |
| **BACKLOG-04** | **P3** | Multi-Tenancy | Active workspace binds one `dataset_metadata` row at a time (`MVP single-workspace`). | Partition operational tables and `artifacts/` by `tenant_id` in future SaaS releases. |
