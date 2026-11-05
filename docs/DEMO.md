# Competition demo

Use the included synthetic snapshot. Open the Executive dashboard, confirm the data cutoff is **30 September 2026**, and keep the latest-month scope throughout the story.

| Step | What to show | What to say |
|---|---|---|
| 1 · Observe | Executive dashboard and revenue trend | “We see a revenue decline and can compare the same metrics with the prior period.” |
| 2 · Detect | Anomaly Center. Open the Facebook Ads spend alert and compare actual with reference. | “Spend rose while attributed efficiency fell. This gives the manager a specific signal to investigate.” |
| 3 · Explain | Ask “Why did revenue decrease this month?” Switch the contribution table among product, region and segment. | “Each breakdown reconciles to the recorded change. We can identify the largest contributions and separate them from causal claims.” |
| 4 · Forecast | Ask “Forecast demand for SmartDesk Mini for the next 30 days.” Then select the same product and horizon in Forecast Center. | “The model uses observed units. The interval and holdout scores show how much uncertainty the projection carries.” |
| 5 · Compare | In Scenario Simulator, compare 0%, 5% and 10% discounts with contribution profit as the objective. Switch to Inventory reorder and run a comparison. | “The engine recalculates results for each input and can keep the baseline. Limited stock or late receipts can cap fulfillment.” |
| 6 · Decide | Open Recommendations. Review supporting evidence, accept or reject an action, and inspect Decision audit. | “The manager records a decision after reviewing the assumptions. The workflow keeps the evidence and approval together.” |

For a quick demonstration without provider credentials, keep `LLM_PROVIDER=none`. Optional follow-up prompts include “Which marketing channel is becoming less efficient?” and “Which product generated the highest profit?”. Consult the evaluation report before presenting error or coverage metrics.
