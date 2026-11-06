# DecisionPilot AI model evaluation

Dataset `f32e87e3a5744333ff98d3bf` · synthetic retail and services · model bundle `dp-1.1`

## Chronological split

- Train 2024-10-01 to 2026-02-22
- Validation 2026-02-23 to 2026-06-12
- Test 2026-06-13 to 2026-09-30

## Selected 30-day forecasts

| Target | Scope | Selected model | Test MAE | Test WAPE | Test interval coverage |
|---|---|---|---:|---:|---:|
| revenue | all | moving_average | 34,584,971.67 | 24.14% | 83.81% |
| orders | all | moving_average | 14.98 | 23.22% | 83.81% |
| demand | all | moving_average | 17.74 | 23.46% | 80.00% |
| demand | sku:P001 | lightgbm | 2.68 | 41.87% | 92.86% |

LightGBM is selected per target, scope and horizon only when validation MAE beats the better baseline by more than 2%. Reported test outcomes can favor a different model. Bands have 90% nominal coverage. Selection and interval calibration use separate chronological validation segments when enough history exists; per-series reports disclose the actual ranges and independence status. Point errors and interval coverage can degrade on abrupt shifts, and rolling test origins overlap.

## Labeled anomaly test

| Signal | Method | Precision | Recall | F1 | False-positive rate |
|---|---|---:|---:|---:|---:|
| revenue | hybrid | 86.67% | 38.24% | 53.06% | 2.63% |
| margin | hybrid | 50.00% | 75.00% | 60.00% | 2.83% |
| facebook_spend | hybrid | 100.00% | 82.14% | 90.20% | 0.00% |
| facebook_roas | hybrid | 68.00% | 60.71% | 64.15% | 9.76% |
| facebook_conversion | hybrid | 75.00% | 75.00% | 75.00% | 8.54% |
| stockout_risk | business_rule | 18.75% | 25.00% | 21.43% | 13.27% |

Injection labels identify periods where generator rules changed. A flagged day outside those labels may still be a real deviation in synthetic history. Signals with no positive labels are provided in JSON and cannot establish recall performance.

## Conditional scenario replay

| Replay target | Baseline WAPE | Scenario WAPE |
|---|---:|---:|
| weekly observed P001 units | 24.24% | 23.99% |
| weekly Facebook Ads attributed revenue | 25.44% | 33.00% |

Holdout seven-day conditional replay. Uses realized weekly prices, budgets and receipts as inputs. Interventions were not randomized. Inventory accuracy is uninformative when few weeks deplete.

See evaluation.json, forecast_metrics.csv, scenario_backtest.json and figures/ for evidence.
