# Verification of the bundled demo

The verified snapshot is `f32e87e3a5744333ff98d3bf`, through 30 September 2026. It contains 50,000 transactions and eight physical SKU-days with zero closing stock during a controlled supply interruption.

| Check | Observed result |
|---|---|
| Data quality | Passed the key, calendar, financial formula, inventory, attribution and customer reconciliations. |
| Automated integration tests | 12 passed. Coverage includes API validation, forecasting, scenarios, audit idempotency, import and the query benchmark. |
| Conversational benchmark | 46/46 curated cases matched the expected intent, filter, calculation or refusal, and chart type. Expected observed figures are independently computed from CSV. |
| Frontend build | TypeScript validation and production Vite build passed. |
| PostgreSQL protocol | Applied the Alembic migration, loaded the bundled data and passed the HTTP smoke workflow using PGlite and the psycopg dialect. |
| Browser workflow | Opened the six screens, executed contribution and forecast requests, inspected an alert, compared price alternatives, and verified an accepted decision in audit. |

Docker Compose startup still needs a Docker host for verification. The optional Gemini and OpenAI provider integrations need live credentials for end-to-end checks. The [model report](../artifacts/MODEL_EVALUATION.md) reports forecast coverage and anomaly recall alongside aggregate errors. The synthetic revenue detector missed many labeled days, and the marketing scenario replay produced higher error than its baseline.
