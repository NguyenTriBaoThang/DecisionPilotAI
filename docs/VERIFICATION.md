# Verification of the bundled demo

The verified snapshot is `f32e87e3a5744333ff98d3bf`, through 30 September 2026. It contains 50,000 transactions and eight physical SKU-days with zero closing stock during a controlled supply interruption.

| Check | Observed result |
|---|---|
| Data quality | Passed the key, calendar, financial formula, inventory, attribution and customer reconciliations. |
| Automated integration tests | 16 passed on SQLite. Includes API validation, forecasting, exact scenario decisions, named roles, append-only history, pagination, import and the query benchmark. |
| Conversational benchmark | 46/46 curated cases matched the expected intent, filter, calculation or refusal, and chart type. Expected observed figures are independently computed from CSV. |
| Frontend build | TypeScript validation and production Vite build passed. |
| Frontend regression tests | 8 passed: API authorization, upload validation/conflicts, saved preferences and pending/failed scenario decisions. |
| PostgreSQL | CI now runs the backend suite against PostgreSQL 16. Revision 0002 has not been executed against PostgreSQL locally in this update. |
| Browser workflow | 2 Playwright tests passed using installed Edge and a disposable database: authenticated preferences/scenario/audit workflow, plus ZIP import and model invalidation. Light theme screenshot reviewed. |
| Dependency audit | npm audit reports zero known vulnerabilities. |
| Compose configuration | docker compose config --quiet passed. |

Docker Compose startup still needs a running Docker daemon for verification; Docker Desktop's Linux engine was unavailable locally. The optional Gemini and OpenAI provider integrations need live credentials for end-to-end checks. The [model report](../artifacts/MODEL_EVALUATION.md) reports forecast coverage and anomaly recall alongside aggregate errors. Bundle dp-1.1 improves synthetic revenue recall to 38.24% and revenue interval coverage to 83.81%; both remain limited. Inventory alerts remain weak, and marketing replay still has higher error than its baseline. Benchmark files are explicitly decoded as UTF-8 on Windows. See [IMPROVEMENTS.md](IMPROVEMENTS.md) for contracts and operating instructions.
