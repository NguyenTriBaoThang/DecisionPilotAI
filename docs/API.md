# HTTP API

The container exposes the backend behind `/api`. Swagger is available at `/api/docs` and OpenAPI JSON at `/api/openapi.json`. The Vite local launcher uses the same prefix.

| Method | Path | Contract |
|---|---|---|
| GET | `/health` | Database dialect and readiness, active dataset readiness and model version |
| GET | `/dataset` | Snapshot ID, counts, calendar bounds, provenance and quality checks |
| GET | `/options` | Filter values and product catalog |
| GET | `/kpi/summary` | Summary, equal-length prior comparison, daily/weekly/monthly trend, ranked product and channel rows |
| POST | `/query` | Natural-language question and optional filter context, with intent, answer, chart, evidence and trace |
| GET | `/anomalies` | Ranked alerts with optional date/severity filter and bounded row limit |
| GET | `/anomalies/{alert_id}` | Alert details, source values and supported contribution breakdowns |
| POST | `/forecast` | Target, 7/30-day horizon, and optional product or category, with point forecasts and bands |
| POST | `/simulate` | Typed price, marketing or inventory scenario, baseline and alternatives with sensitivity |
| GET | `/recommendations` | Ranked actions, expected impact when supported, uncertainty and decision status |
| POST | `/recommendations/feedback` | Accepted or rejected decision with recommendation ID and current dataset ID |
| GET | `/audit` | Newest audit events with optional type filter and bounded row limit |
| POST | `/import` | Replace the current snapshot from CSV ZIP or XLSX under explicit local opt-in |

```sh
base=http://localhost:8080/api
curl "$base/kpi/summary?region=HCMC&grain=weekly"
curl "$base/query" -H 'Content-Type: application/json' \
  -d '{"question":"Why did revenue decrease this month?"}'
curl "$base/forecast" -H 'Content-Type: application/json' \
  -d '{"target":"demand","product":"P001","horizon":30}'
curl "$base/simulate" -H 'Content-Type: application/json' \
  -d '{"type":"price","objective":"profit","parameters":{"product":"P001","discounts":[0,0.05,0.10]}}'
```

## Import contract

Use a ZIP with all six CSV files at the archive root, or a workbook with six sheets using the corresponding table names. Headers and fields must match the [data dictionary](DATA_DICTIONARY.md). Import expects a complete, reconciled snapshot, including all historical inventory days for physical SKUs. Save Excel formulas as values. The request body contains the binary file. Import is disabled by default. To test it, configure `DEMO_ALLOW_IMPORT=true` and `IMPORT_TOKEN` as a local secret, then use the current `dataset_id` or `empty`.

```sh
curl -X POST "$base/import?filename=business.zip&expected_dataset_id=$SNAPSHOT_ID" \
  -H "X-Import-Token: $IMPORT_TOKEN" -H 'Content-Type: application/zip' \
  --data-binary @business.zip
```

Imports reject stale snapshot IDs with 409, malformed files or inconsistent rows with 422, and over-limit uploads with 413. New snapshots need their own training run before forecast-dependent tools become available. The server never loads a model from the uploaded file.
