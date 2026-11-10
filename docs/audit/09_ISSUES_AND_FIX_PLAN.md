# DecisionPilot AI — Issues Log & Prioritized Fix Plan

**Document ID:** AUD-09-FIX-PLAN  
**Audit Date:** November 8, 2026  
**Auditor:** Staff QA & Lead Software Engineer  
**Classification:** P0 (Critical/Blocker), P1 (High), P2 (Medium), P3 (Low/Enhancement)  

---

## 1. Resolved Issues During Audit (Safe Fixes Executed)

| ID | Priority | Subsystem | Description | Resolution Applied | Verification Status |
| :--- | :---: | :--- | :--- | :--- | :---: |
| **FIX-01** | **P1** | Frontend Test | `preferences.test.tsx` failed due to default language set to `'vi'` instead of test expectation `'en'`. | Restored `defaults: Preferences = { language: 'en', currency: 'vnd' }` in `frontend/src/preferences.tsx` and wrapped Settings heading in `translate`. | **VERIFIED (8/8 tests pass)** |
| **FIX-02** | **P1** | UI / Mock Data | In static demo mode, table columns showed dashes (`—`) because row keys (`product_name`, `profit`) did not match column keys (`name`, `gross_profit`). | Added defensive fallback accessor in `frontend/src/ui.tsx` (`Table`) and aligned `mockKPI` keys in `frontend/src/mockData.ts`. | **VERIFIED (Clean display, zero dashes)** |
| **FIX-03** | **P1** | Documentation / Pages | `docs-site/src/data/site.ts` pointed `APP_DEMO_URL` to root instead of `/app/`, causing confusion between docs site and web application. | Updated `APP_DEMO_URL` to link directly to `/app/` and added a bidirectional link in frontend sidebar back to documentation. | **VERIFIED (Clean navigation)** |
| **FIX-04** | **P1** | DevOps CI/CD | `deploy-pages.yml` only triggered on changes to `docs-site/**`, ignoring frontend changes, and did not package the frontend application into the Pages artifact. | Updated `.github/workflows/deploy-pages.yml` to build both `docs-site` and `frontend`, bundling `frontend/dist` into `docs-site/dist/app`. | **VERIFIED (Clean bundle pipeline)** |

---

## 2. Open Issues Backlog (P2 & P3)

| ID | Priority | Subsystem | Issue Description | Impact | Recommended Solution |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **ISSUE-05** | **P2** | Backend Testing | Full `pytest` integration fixture loads 50,000 synthetic rows into SQLite with individual batch inserts, taking ~3 minutes on Windows NTFS file systems. | Slow CI test feedback loop when testing single unit functions. | Add an in-memory SQLite pragma (`PRAGMA synchronous = OFF; PRAGMA journal_mode = MEMORY;`) or a small 500-row fixture for unit tests. |
| **ISSUE-06** | **P2** | GitHub Pages Config | GitHub Pages repository setting on github.com must have "Source" set to "GitHub Actions" to allow automated deployment. | If user's repo is set to "Deploy from a branch", the action will fail with a configuration error. | Document clear 2-step setup in README and deployment guide. |
| **ISSUE-07** | **P3** | Frontend Bundle | Vite chunk warning: `three-vendor.js` exceeds 500 kB after minification (534 kB). | Slightly longer initial download on slow 3G mobile connections. | Three.js tree-shaking is already active; dynamic `import('./components/ScenarioSimulator3D')` can further optimize initial route loading. |
| **ISSUE-08** | **P3** | Multi-Tenancy | Dataset loading uses global database locks; multiple SME tenants currently require separate database instances. | Limits SaaS multi-tenant self-service without container orchestration. | Planned for v1.1.0: Tenant partition key `tenant_id` on all database tables. |

---

## 3. Safe Execution Protocol

All applied fixes adhere to the **Safe Fixes Only** protocol:
- No database schema alterations.
- No dataset mutations or file deletions.
- No public API signature breaks.
- All changes covered by automated unit and build verification.

