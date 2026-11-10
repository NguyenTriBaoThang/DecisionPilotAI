# DecisionPilot AI — Relational Data Model Specification

> **Database Engines Supported:** SQLite 3 (Local `data/local.sqlite`) & PostgreSQL 16 (Docker Compose / CI)  
> **ORM & Migrations:** SQLAlchemy 2.0.44 Core & Alembic 1.17.2 (`alembic upgrade head`)  
> **Bundled Snapshot Volume (`f32e87e3a5744333ff98d3bf`):** 50,000 Transactions, 50 SKUs (`34` physical / `16` digital service), 10,000 Customers, 2,920 Campaign-Days, 24,820 Inventory-Days across 730 Calendar Days

---

## 1. Entity-Relationship Diagram (ERD) ([`backend/app/db.py`](../backend/app/db.py))

```mermaid
erDiagram
    CALENDAR_EVENTS ||--o{ SALES_TRANSACTIONS : "date_fk"
    CALENDAR_EVENTS ||--o{ MARKETING_CAMPAIGNS : "date_fk"
    CALENDAR_EVENTS ||--o{ INVENTORY_DAILY : "date_fk"
    PRODUCTS ||--o{ SALES_TRANSACTIONS : "product_id_fk"
    PRODUCTS ||--o{ INVENTORY_DAILY : "product_id_fk"
    CUSTOMERS ||--o{ SALES_TRANSACTIONS : "customer_id_fk"
    MARKETING_CAMPAIGNS ||--o{ SALES_TRANSACTIONS : "campaign_id_date_fk"

    CALENDAR_EVENTS {
        date date PK "Asia/Ho_Chi_Minh ISO YYYY-MM-DD"
        int day_of_week "0=Mon..6=Sun"
        int month "1..12"
        int quarter "1..4"
        boolean is_weekend "Sat/Sun"
        boolean is_holiday "National calendar event"
        string event_name "Nullable event title"
        boolean promotion_flag "Double-days (>=Jun) & final 4d"
    }

    PRODUCTS {
        string product_id PK "P001..P050"
        string product_name "e.g. SmartDesk Mini"
        string category "6 categories"
        string brand "Pilot Essentials / Pilot Select"
        bigint list_price "Integer VND > 0"
        bigint unit_cost "Integer VND >= 0"
        string supplier "Local Supply / In-house"
        boolean is_physical "34 true, 16 false"
        int lead_time_days "Nullable unless is_physical"
        int reorder_point "Nullable unless is_physical"
        int current_stock "Nullable unless is_physical"
        numeric elasticity "NUMERIC(8,4) in [-5, 0]"
    }

    CUSTOMERS {
        string customer_id PK "C000001..C010000"
        string customer_segment "Returning, Individual, Corporate, Price-sensitive"
        string region "HCMC, Hanoi, Da Nang, Can Tho"
        date signup_date "Precedes orders"
        string acquisition_channel "Facebook Ads, Google Ads, TikTok Ads, Email, Organic"
        boolean is_returning "True when orders > 1"
        bigint lifetime_value "Reconciled integer VND >= 0"
        date last_purchase_date "Nullable most recent order date"
    }

    MARKETING_CAMPAIGNS {
        string campaign_id PK "Composite PK (campaign_id, date)"
        date date PK "References calendar_events.date"
        string channel "Facebook Ads, Google Ads, TikTok Ads, Email"
        string campaign_name "Channel + Month Year"
        bigint spend "Integer VND >= 0"
        int impressions "impressions >= clicks"
        int clicks "clicks >= leads"
        int leads "leads >= orders"
        int orders "orders >= 0"
        bigint attributed_revenue "Sum of linked sales revenue"
    }

    SALES_TRANSACTIONS {
        string transaction_id PK "T0000001..T0050000"
        date date "References calendar_events.date"
        string customer_id FK "References customers"
        string product_id FK "References products"
        int quantity "quantity > 0"
        bigint unit_price "Integer VND > 0"
        numeric discount_pct "NUMERIC(8,4) in [0, 1]"
        bigint revenue "Rounded quantity * price * (1 - discount)"
        bigint unit_cost "Integer VND >= 0"
        bigint total_cost "quantity * unit_cost"
        bigint gross_profit "revenue - total_cost"
        string region "HCMC, Hanoi, Da Nang, Can Tho"
        string sales_channel "Online, Retail, B2B"
        string campaign_id FK "Composite FK (campaign_id, date), nullable"
    }

    INVENTORY_DAILY {
        date date PK "Composite PK (date, product_id)"
        string product_id PK "References products"
        int opening_stock "opening >= 0"
        int received_qty "received >= 0"
        int sold_qty "Reconciles to SKU-day sales"
        int closing_stock "opening + received - sold"
        boolean stockout_flag "closing_stock == 0"
    }
```

### Runtime System & Governance Tables
In addition to the 6 business tables above, `backend/app/db.py` persists three system tables:
- `dataset_metadata` (`id`, `payload` JSON): stores active snapshot SHA-256 `dataset_id`, row counts, date range, and validation/injection manifest.
- `simulation_runs` (`id` SHA-256 `64`-char hex PK, `dataset_id`, `created_at`, `payload` JSON): stores immutable request + computed outcome bundles so `/scenarios/feedback` cites exact verified outputs.
- `audit_events` (`id`, `occurred_at`, `kind`, `subject`, `payload` JSON): append-protected history covering `query`, `dataset_loaded`, `recommendation_feedback`, and `scenario_feedback` (guarded by database triggers created in Alembic revision `0002_decision_integrity`).

---

## 2. Schema Constraints & Integrity Invariants (`backend/app/db.py`)

All integer currency columns use `BIGINT` (`VND`), and database `CheckConstraint` rules enforce accounting consistency:

- **`products` (`valid_product_price`, `valid_product_inventory`):** Enforces `list_price > 0`, `unit_cost >= 0`, `elasticity BETWEEN -5 AND 0`; physical SKUs require non-null `lead_time_days >= 1`, `reorder_point >= 0`, `current_stock >= 0`, whereas non-physical service SKUs enforce `NULL` for all three inventory fields.
- **`sales_transactions` (`valid_transaction`):** Enforces `quantity > 0`, `unit_price > 0`, `discount_pct BETWEEN 0 AND 1`, `total_cost = quantity * unit_cost`, `gross_profit = revenue - total_cost`, plus composite foreign key `["campaign_id", "date"] -> marketing_campaigns`.
- **`marketing_campaigns` (`valid_funnel`):** Enforces monotonic daily funnel counts `impressions >= clicks >= leads >= orders >= 0`, `spend >= 0`, `attributed_revenue >= 0`.
- **`inventory_daily` (`valid_inventory_movement`):** Composite PK `(date, product_id)`; enforces `opening_stock + received_qty - sold_qty = closing_stock` and `stockout_flag = (closing_stock = 0)`.

---

## 3. Synthetic Data Generation & Injected Events ([`scripts/generate.py`](../scripts/generate.py))

Using `seed=42`, `months=24`, `transactions=50_000`, `sku_count=50`, `customer_count=10_000`, ending `2026-09-30` (`start = 2024-10-01`):

1. **Statutory Holidays & Commercial Calendar:**
   - **5 Vietnam Holidays:** `1/1` (`New Year`), `4/30` (`Reunification Day`), `5/1` (`Labour Day`), `9/2` (`National Day`), and `12/25` (`Year-end shopping`) receive a `1.24x` demand multiplier.
   - **Promotions:** Double-day promos (`month == day` for months `6`–`12`, i.e., `6.6`..`12.12`) plus the final 4 days of history (`2026-09-27`–`2026-09-30`).
   - **Seasonality & Weekends:** Cosine annual curve plus weekend `1.20x` vs weekday `0.96x` weights.
2. **Dated Evaluation Shocks Recorded in Snapshot Manifest (`injected_events`):**
   - **Early Demand Shock (`early_shock`, 6 days starting `end - 70d`, July 2026):** Overall demand traffic `0.75x`.
   - **Macro Revenue & Channel Shock (`shock_start`, last 28 days `end - 27d..end`, Sept 2026):** Traffic `0.59x`, HCMC SKU `P002`/`P003` weights `0.26x`, returning customer probability `44% -> 20%`.
   - **Facebook Spend / ROAS / Conversion Shock (last 28 days, Sept 2026):** Facebook Ads spend `1.85x`, online FB attribution share drops `25% -> 5.5%`, with `+24` additional non-converting daily leads.
   - **FocusCam Pro (`P003`) Supply Interruption:** Replenishment suspended between `early_shock - 10d` and `early_shock + 27d` (`stockout_event`).
   - **SmartDesk Mini (`P001`) Replenishment Pause (last 12 days, `end - 11d..end`):** Tests `stockout_risk` forward warning rules.
   - **Late Promotion Margin Shift (final 4 days `end - 3d..end`):** Extra promotional discounting compressing daily margin (`margin`).

For column-by-column business definitions and KPI formulas, see [`DATA_DICTIONARY.md`](./DATA_DICTIONARY.md).
