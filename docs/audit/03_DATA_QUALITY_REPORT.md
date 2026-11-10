# DecisionPilot AI — Data Quality & Integrity Audit

**Document ID:** AUD-03-DATA-INTEGRITY  
**Audit Date:** November 10, 2026  
**Primary Dataset:** `data/synthetic/` (`dataset_id: f32e87e3a5744333ff98d3bf`)

---

## 1. Dataset Dimensions & Ground Truth

Generated deterministically by [`scripts/generate.py`](../../scripts/generate.py) (`seed=42`, currency `VND`, timezone `Asia/Ho_Chi_Minh`) across **730 contiguous days** (`2024-10-01` to `2026-09-30`), covering `HCMC`, `Hanoi`, `Da Nang`, and `Can Tho`.

| Table Name | Row Count | Granularity & Constraints |
| :--- | :---: | :--- |
| `calendar_events` | **730** | Contiguous business calendar with Vietnam holidays (`1/1`, `4/30`, `5/1`, `9/2`, `12/25`) & double-day/late promo flags |
| `products` | **50** | **34** physical SKUs (`is_physical=true`, lead times `7–14d`, non-null stock/reorder) + **16** digital/service SKUs (`NULL` stock fields) |
| `customers` | **10,000** | 4 segments (`Returning`, `Individual`, `Corporate`, `Price-sensitive`) across 4 regions |
| `marketing_campaigns` | **2,920** | Daily funnel rows (`impressions >= clicks >= leads >= orders`) across `Facebook Ads`, `Google Ads`, `TikTok Ads`, `Email` |
| `sales_transactions` | **50,000** | Channels `Online`, `Retail`, `B2B`; enforces `total_cost = quantity * unit_cost`, `gross_profit = revenue - total_cost` |
| `inventory_daily` | **24,820** | 34 physical SKUs $\times$ 730 days; enforces `opening_stock + received_qty - sold_qty = closing_stock` |

---

## 2. Deterministic Validation Checks (`scripts/pipeline.py validate`)

1. **Primary & Foreign Key Integrity:** Zero orphaned customer, product, calendar, or composite `(campaign_id, date)` links.
2. **Contiguous Business Calendar:** Zero gaps or inconsistent weekday/month/quarter/weekend flags across 730 days.
3. **Accounting Formulas:** `revenue = round(quantity * unit_price * (1 - discount_pct))`, `total_cost = quantity * unit_cost`, `gross_profit = revenue - total_cost`.
4. **Physical Warehouse Conservation:** Across all 34 physical SKUs, opening balances equal prior day closing balances and `stockout_flag = (closing_stock == 0)`.
5. **Campaign Funnel & Attribution:** Strictly monotonic funnel stages and exact reconciliation of `attributed_revenue` and `orders` with `sales_transactions`.
6. **Customer Cohort Reconciliation:** Lifetime value, `last_purchase_date`, `signup_date`, and `is_returning` match observed transaction histories.
7. **Deterministic SHA-256 Digest:** Canonical serialized digest produces `f32e87e3a5744333ff98d3bf`.

---

## 3. Synthesized Evaluation Shocks (`injected_events` in Snapshot Manifest)

To evaluate anomaly detection and replay behavior, `scripts/generate.py` injects dated regime shifts (used strictly for evaluation scoring, never leaked as training features):

1. **July 2026 Early Demand Shock (`early_shock`, 6 days starting `end - 70d`):** Demand traffic scaled `0.75x`.
2. **FocusCam Pro (`P003`) Supply Interruption (`interruption` to `restore_supply - 1d`):** Replenishment paused `10` days before `early_shock` through `early_shock + 27d` (`stockout_event`).
3. **September 2026 Macro Demand & Mix Shift (`shock_start`, last 28 days):** Store traffic `0.59x`, HCMC `P002`/`P003` SKU weights `0.26x`, returning customer share `44% -> 20%`.
4. **September 2026 Facebook Ads Efficiency Drop (last 28 days):** Facebook spend `1.85x`, online attribution share drops `25% -> 5.5%`, plus `+24` non-converting leads/day.
5. **Late Replenishment & Margin Events (`end - 11d..end` & `end - 3d..end`):** SmartDesk Mini (`P001`) replenishment paused for 12 days (`stockout_risk`) and final 4 promotional days apply extra discounting (`margin`).

---

## 4. Data Quality Verdict

**Status:** **PASS (`100%` structural & mathematical validation checks satisfied).**
