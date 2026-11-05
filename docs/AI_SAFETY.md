# AI behavior and limits

| Output | Evidence and interpretation |
|---|---|
| Recorded KPI | Snapshot identifier, date bounds, fixed formula and source tables |
| Unusual signal | Observed value versus a trailing baseline or stock requirement. Event labels score synthetic holdout detections only. |
| Contribution | Observed change reconciles across each dimension. Any causal claim would require an intervention or a causal design. |
| Forecast | Versioned model, measured error and observed interval coverage. Short historical windows and shifts such as stockouts can reduce accuracy. |
| Scenario | Conditional estimate from explicit elasticity, attribution or receipt assumptions. Results depend on the input range and are not experimentally measured effects. |
| Recommendation | Rule-prioritized suggestion linked to observed or simulated evidence. Expected impact can be unavailable. Acceptance records a decision for review. |

## Guardrails

Intent schemas allow specific tools, metrics, dimensions, horizons and filters. The backend rejects unsafe request patterns and unsupported intents, validates provider JSON, and constructs all queries in code. Free-form SQL, arbitrary code and general-purpose mutations are unavailable from chat. Query history stores the validated trace rather than raw questions. Provider errors use local rules and omit secrets from logs.

When an optional provider is enabled, it receives the question, allowed catalog labels, dates and selected scope for intent extraction. It does not receive transaction or customer rows. Provider use should be assessed before sending confidential business questions. Live provider calls require credentials and can change with the service configuration.

The MVP serves a single local workspace with a private-by-default loopback binding. Multi-tenant isolation, authentication and role-based access, HTTPS, rate limits, backup/restore policy and production monitoring are deployment work. The synthetic catalog avoids real customer identifiers. Imported data remains in the workspace database and must be managed under the operator's own data policies.

## Pilot measures

Evaluate time to answer recurring questions, quality of the recorded actions, ability to catch validated events, and forecast performance on unseen real periods. Establish a baseline before measuring savings or incremental revenue. The bundled numbers describe the synthetic test. Evaluate the same workflow on an unseen real dataset before using it for operational decisions.
