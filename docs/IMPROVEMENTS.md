# Reliability improvements

## Decisions and audit

`POST /simulate` now persists the exact request and computed outcome. Its response includes `simulation_id`, `dataset_id`, and the latest recorded `decision`. Identical inputs and results on the same dataset have the same ID. `POST /scenarios/feedback` accepts those two IDs plus `decision` (`accepted` or `rejected`). A missing run returns 404; an obsolete dataset returns 409. Repeating the latest decision is idempotent. The UI confirms success only after the server records it.

Scenario and recommendation feedback includes the named actor and reviewed evidence. Alembic revision `0002` creates the scenario store and protects both it and audit history against ordinary UPDATE/DELETE operations (also TRUNCATE in PostgreSQL). Database owners can still alter schema or remove protections; these controls are not cryptographic tamper evidence. Preserve database backups and limit administrative access.

`GET /audit?kind=decisions&limit=25` returns both decision types. Use `next_before` as the next request's `before` cursor. Latest recommendation status is no longer limited to the most recent 100 events.

## Workspace access

Loopback demos default to `APP_ENV=local` with an explicitly named `local-workspace` actor. Shared deployments should set `APP_ENV=production` and configure `WORKSPACE_ACCESS_TOKENS` as a JSON mapping of secrets to identities:

```json
{"<random-secret-at-least-32-characters>":{"actor":"operations-lead","role":"analyst"}}
```

Generate each token using `python -c "import secrets; print(secrets.token_urlsafe(32))"`. Do not commit real credentials. Configure the environment before starting the application. Production startup rejects missing or invalid credentials. Use HTTPS at the deployment boundary and issue a distinct token per person. Rotate/revoke tokens by changing the server configuration and restarting it. These workspace tokens are not an SSO or password-management system.

The frontend sign-in stores the token in session storage and sends `Authorization: Bearer …`. Roles:

| Role | Capabilities |
|---|---|
| viewer | Read business data and execute analytical tools |
| analyst | Viewer capabilities plus recording decisions |
| admin | Analyst capabilities plus replacing datasets |

Unauthenticated `/health` is a minimal database liveness response when access control is configured. Detailed health information requires credentials. Import additionally requires `DEMO_ALLOW_IMPORT=true` and the separate `IMPORT_TOKEN`.

## Data and preferences

Data Sources supports file selection and dropping ZIP/XLSX files, validates size/type, requires explicit replacement acknowledgement, and submits the active dataset ID for conflict detection. Successful imports discard stale query caches. This page also works on an empty database. Forecast and price/inventory simulation remain unavailable until an operator trains an artifact for the new dataset; no model is silently reused from another business.

Preferences are saved in local storage and restored on refresh. Language applies to navigation, supported page/section titles, dates and numbers. Detailed analytical explanations remain English. Financial format controls full-value currency displays; compact dashboard metrics continue using compact values by design. Theme and reduced-motion preferences are supported.

## Model evaluation

Bundle `dp-1.1` adds a past-only seven-day sustained revenue contraction signal. On the bundled synthetic holdout, revenue alert recall rose from 11.76% to 38.24%, while precision fell from 100% to 86.67%. This tradeoff requires validation on independent business data.

Forecast model selection and interval calibration now use separate chronological validation segments when sufficient history exists. Short datasets explicitly disclose shared selection/calibration data. Calendar holidays are passed consistently during backtesting. Holdout revenue interval coverage rose from 78.57% to 83.81%; revenue point WAPE remains 24.14%. The nominal 90% target is still not achieved. Overlapping origins limit interpretation, and daily intervals are not intervals for cumulative totals.

`GET /models/quality` exposes measured anomaly scores and their limitations. The anomaly page displays weak or unverified signals. Forecast results display coverage warnings; marketing simulations explicitly disclose when replay underperforms baseline. Inventory alert scores and marketing causal validity remain limited. Synthetic data and curated language cases cannot establish real-world accuracy.

## Verification

Run `python -m alembic upgrade head`, `python -m pytest -q`, `npm --prefix frontend test`, and `npm --prefix frontend run build`. Frontend tests cover import conflicts, preference persistence, authorization headers, file validation and failed/pending scenario decisions. Backend tests cover exact scenario evidence, idempotence, roles, append-only protections, pagination, long histories and past-only anomaly features. CI runs SQLite/PostgreSQL backend tests, frontend tests, browser workflows and an npm dependency audit.

Browser tests use a disposable SQLite database with test-only identities and never replace the developer's local dataset. Run `npm --prefix frontend run test:e2e` after installing Playwright Chromium. Set `E2E_PYTHON` if the Python executable is outside `.venv`; `PLAYWRIGHT_EDGE_PATH` can point to an installed Edge executable. Tests exercise sign-in, saved preferences, exact scenario approval, audit evidence and a real ZIP import through the browser. The fixture server binds to loopback and is not a production application entry point.

The model report and artifact were regenerated with `python -m scripts.train --skip-features` and `python -m scripts.report`. New real-world datasets must be independently evaluated; no real customer data or live LLM credentials were supplied for this change.
