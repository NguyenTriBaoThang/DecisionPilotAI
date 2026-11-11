# Verification of the bundled demo

The verified snapshot is `f32e87e3a5744333ff98d3bf`, through 30 September 2026. It contains 50,000 transactions and eight physical SKU-days with zero closing stock during a controlled supply interruption.

| Check | Observed result |
|---|---|
| Data quality | Passed the key, calendar, financial formula, inventory, attribution and customer reconciliations. |
| Automated integration tests | 16 passed on SQLite. Includes API validation, forecasting, exact scenario decisions, named roles, append-only history, pagination, import and the query benchmark. |
| Conversational benchmark | 46/46 curated cases matched the expected intent, filter, calculation or refusal, and chart type. Expected observed figures are independently computed from CSV. |
| Frontend build | TypeScript validation and production Vite build passed. |
| Frontend regression tests | 9 passed across 4 test files (`preferences`, `import`, `decisions` with atomic `recommendation_id` binding, and `api`). |
| PostgreSQL | CI now runs the backend suite against PostgreSQL 16. Revision 0002 has not been executed against PostgreSQL locally in this update. |
| Browser workflow | 3 Playwright tests (`workspace.spec.ts` & `demo-flow.spec.ts`) covering authenticated preferences/scenario/audit persistence, ZIP import & model invalidation, and the connected alert -> Ask -> recommendation -> simulator -> atomic decision loop. |
| Documentation portal | Multi-page `docs-site/` (`tsc -b && vite build`) verified cleanly with `HomePage`, 17 paginated `/docs/<chapter>` pages, Ctrl+K search, and interactive Track 5 showcase. |
| Dependency audit | npm audit reports zero known vulnerabilities. |
| Compose configuration | docker compose config --quiet passed. |

Docker Compose startup still needs a running Docker daemon for verification; Docker Desktop's Linux engine was unavailable locally. The optional Gemini and OpenAI provider integrations need live credentials for end-to-end checks. The [model report](../artifacts/MODEL_EVALUATION.md) reports forecast coverage and anomaly recall alongside aggregate errors. Bundle dp-1.1 improves synthetic revenue recall to 38.24% and revenue interval coverage to 83.81%; both remain limited. Inventory alerts remain weak, and marketing replay still has higher error than its baseline. Benchmark files are explicitly decoded as UTF-8 on Windows. See [IMPROVEMENTS.md](IMPROVEMENTS.md) for contracts and operating instructions.
