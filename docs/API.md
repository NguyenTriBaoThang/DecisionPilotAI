# DecisionPilot AI - HTTP API

Use `/api` through the frontend proxy: `http://127.0.0.1:5173/api` in development or `http://127.0.0.1:8080/api` with Compose. The backend's route names below are relative to that prefix. Local Swagger and OpenAPI are available through `/api/docs` and `/api/openapi.json` on the frontend proxy.

## Authentication and conventions

In a protected workspace, send `Authorization: Bearer <workspace-token>` on API requests, including requests for the API documentation. The web application's session storage does not automatically authenticate a separately opened Swagger tab; use an authorized HTTP client to retrieve the schema. Local demo mode does not require a token. Production configuration, roles and import permissions are documented in [IMPROVEMENTS.md](IMPROVEMENTS.md).

Dates use `YYYY-MM-DD`; audit timestamps use ISO 8601 with a UTC offset. Currency is VND. JSON request schemas reject extra fields and nonfinite numbers. Error responses contain `detail` (a string or a request-validation array); they are not full RFC 7807 problem documents.

| Status | Meaning |
|---|---|
| 401 | Missing or invalid workspace credentials |
| 403 | Role or import policy does not permit the action |
| 404 | Requested alert, recommendation or scenario is unavailable |
| 409 | Dataset changed; reload and review before retrying |
| 413 | Upload exceeds the size limit |
| 422 | Invalid request or inconsistent snapshot |
| 503 | Database, dataset or matching model artifact is unavailable |

## Endpoint catalog

| Method | Path | Contract |
|---|---|---|
| GET | `/session` | Named actor, role, authentication mode and import availability |
| GET | `/health` | Detailed database/dataset/model readiness when authorized; minimal liveness when protected and unauthenticated |
| GET | `/dataset` | Snapshot ID, counts, calendar bounds, provenance and quality checks |
| GET | `/options` | Valid product, category, region, channel and segment options |
| GET | `/models/quality` | Current artifact version, historical anomaly scores, matched scenario replay and limitations |
| GET | `/kpi/summary` | Summary, previous-period comparison, trend, grouped sales and appropriately scoped campaign metrics |
| POST | `/query` | Natural-language question, typed intent, answer, chart, evidence and trace |
| GET | `/anomalies` | Ranked observed alerts with date/severity filters and bounded limit |
| GET | `/anomalies/{alert_id}` | Alert values, source evidence and supported contribution breakdowns |
| POST | `/forecast` | Selected baseline or LightGBM prediction, daily intervals, holdout metrics, warnings and artifact lineage |
| POST | `/simulate` | Persisted price/marketing/inventory scenario with alternatives, sensitivity and review identity |
| POST | `/scenarios/feedback` | Analyst/admin decision against an exact persisted scenario |
| GET | `/recommendations` | Ranked review actions, assumptions, risks and latest decision for the active dataset |
| POST | `/recommendations/feedback` | Analyst/admin decision against a current recommendation |
| GET | `/audit` | Cursor-paginated history; filter by event kind or `decisions` |
| POST | `/import` | Admin-only atomic snapshot replacement with explicit import opt-in and a separate token |

## KPI and natural-language analytics

`GET /kpi/summary` accepts `start`, `end`, `product`, `category`, `region`, `channel`, `segment` and `grain` (`daily`, `weekly`, `monthly`). Obtain valid dimensions from `/options`. The default period is the latest dataset month, not the host's current month.

The response contains `summary`, `previous`, `changes`, `range`, `previous_range`, `trend`, grouped rows and metric definitions. Summary names include `revenue`, `gross_profit`, `margin`, `orders`, `units`, `aov`, `customers`, `new_customers` and `returning_customers`. Marketing and inventory metrics can be unavailable for an incompatible sales scope.

`POST /query` example:

```json
{"question":"Why did revenue decrease this month?","context":{"region":"HCMC"}}
```

The response has `answer` (string), `intent` (object), `chart` (object or null), `evidence` (object) and `trace` (object). Charts use `type`, `x`, `y` and `rows`. The trace identifies the tool, provider, sources, filters and formulas; it is not an arbitrary generated SQL execution log. Contribution drilldowns describe observed changes and do not establish causal effects.

## Anomalies and model evidence

`GET /anomalies` accepts `start`, `end`, `severity` (`critical`, `high`, `medium`) and `limit` (1-100, default 40). Each row includes `id`, `metric`, `start`, `end`, `actual`, `baseline`, `deviation`, `severity`, `score`, `action`, `scope`, `evidence` and `chart`. Severity is a prioritization heuristic, not a probability of business harm.

Inspect `/models/quality` before relying on alerts. Historical scores can be limited or unverified; absence of alerts is not proof of healthy business performance.

## Forecasts

```json
{"target":"demand","product":"P001","horizon":30}
```

`target` is `revenue`, `orders` or `demand`; `horizon` is 7 or 30. Specify either `product` or `category`, or omit both for the full business. Fields such as `product_id` and `horizon_days` are not accepted by this endpoint.

The response contains `target`, `scope`, `horizon`, `total`, `history`, `prediction`, `metrics`, `drivers`, `data_as_of`, `dataset_id`, `model_version`, `interval_method`, `stockout_note` and `warnings`. Each prediction has `date`, `value`, `lower` and `upper`. `metrics` contains the selected model, comparison errors and measured interval coverage. Nominal 90% intervals can have lower observed coverage; daily bands do not define an interval for the cumulative total.

## Scenario simulation and review

Price example:

```json
{"type":"price","horizon":30,"objective":"profit","parameters":{"product":"P001","discounts":[0,0.05,0.10],"elasticity":-1.1}}
```

Marketing example:

```json
{"type":"marketing","horizon":30,"objective":"profit","parameters":{"channel":"Facebook Ads","changes":[-0.15,0.15],"response_exponent":0.65}}
```

Inventory example:

```json
{"type":"inventory","horizon":30,"objective":"stockout","parameters":{"product":"P001","incoming_stock":0,"arrival_day":1,"order_quantities":[0,100,200]}}
```

Objectives are `profit`, `revenue`, `stockout` or `balanced`, subject to scenario compatibility. Responses contain `baseline`, `alternatives`, `recommended`, `sensitivity`, `assumptions`, `evidence`, `simulation_id`, `dataset_id` and `decision`. Effects depend on assumptions; catalog elasticity is not an estimated causal effect. Inventory risk may be null when it was not estimated.

Copy the exact IDs returned by `/simulate` into `/scenarios/feedback`:

```json
{"simulation_id":"<64 lowercase hexadecimal characters>","dataset_id":"<24 lowercase hexadecimal characters>","decision":"accepted"}
```

For recommendation feedback, use `recommendation_id` from `/recommendations`, the active `dataset_id`, and `decision` (`accepted` or `rejected`). `approved` is not accepted.

Both feedback endpoints return `id`, `decision` and `status: "recorded"`. Repeating the latest identical decision returns the existing event. Recording a decision does not execute a purchase, price change or advertising action.

## Audit history

Request `/audit?kind=decisions&limit=25` to include scenario and recommendation decisions. `limit` is 1-100. The response contains `rows` and `next_before`; when the latter is non-null, pass it as `before` to retrieve older rows. Other kinds are `query`, `dataset_loaded`, `recommendation_feedback` and `scenario_feedback`.

Each row includes `id`, `occurred_at`, `kind`, `subject` and `payload`. Decision payloads retain actor, dataset and reviewed evidence. Legacy records may lack named actors. Database triggers protect ordinary modifications; database administrators still control schema and backups.

## Snapshot import

`POST /import?filename=business.zip&expected_dataset_id=<active-id>` accepts raw file bytes, not JSON or multipart form data. Set `Content-Type: application/octet-stream` and `X-Import-Token`. Use `expected_dataset_id=empty` only when no dataset exists.

Enable server policy with `DEMO_ALLOW_IMPORT=true` and a nonempty `IMPORT_TOKEN`. Protected workspaces also require an admin workspace token. Files must be a ZIP of the six named CSV tables or an XLSX workbook containing the six named sheets. Maximum uploaded size is 40 MiB. Validation and loading are atomic; stale snapshot IDs return 409. A successful response is the new dataset metadata.

A different dataset requires a matching trained artifact before forecasts or price/inventory simulations become available. See [DATA_DICTIONARY.md](DATA_DICTIONARY.md) and [IMPROVEMENTS.md](IMPROVEMENTS.md).
