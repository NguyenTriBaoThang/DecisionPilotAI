# Business data dictionary

The six CSV filenames and Excel sheet names match the table names below. Dates use the local Vietnam business calendar. Whole currency amounts are integer VND. Rates are fractions and are displayed as percentages where appropriate. Physical inventory fields are blank for service SKUs. Missing optional values are blank in CSV and empty in Excel.

## calendar_events

Grain is one row per contiguous business date. Primary key is date.

| Column | Database type | Nullable | Business definition |
|---|---|---|---|
| date | DATE | No | Business date in Asia/Ho_Chi_Minh, stored as ISO YYYY-MM-DD. |
| day_of_week | INTEGER | No | Monday = 0 through Sunday = 6. |
| month | INTEGER | No | Calendar month from 1 to 12. |
| quarter | INTEGER | No | Calendar quarter from 1 to 4. |
| is_weekend | BOOLEAN | No | True for Saturday or Sunday. |
| is_holiday | BOOLEAN | No | Known calendar event flag. |
| event_name | VARCHAR(100) | Yes | Event name where applicable. |
| promotion_flag | BOOLEAN | No | Business-wide promotion indicator for historical analysis. |

## products

Grain is one row per SKU. Primary key is product_id.

| Column | Database type | Nullable | Business definition |
|---|---|---|---|
| product_id | VARCHAR(32) | No | Stable SKU identifier. |
| product_name | VARCHAR(100) | No | Display name. Product IDs are the unique keys. |
| category | VARCHAR(100) | No | Category name for reporting and forecasts. |
| brand | VARCHAR(100) | No | Product brand or service label. |
| list_price | BIGINT | No | Current list price per unit, in VND. |
| unit_cost | BIGINT | No | Unit direct cost in VND. Transaction value is recorded at sale time; catalog value is current. |
| supplier | VARCHAR(100) | No | Catalog supplier or in-house service. |
| is_physical | BOOLEAN | No | Whether this SKU has a physical stock ledger. |
| lead_time_days | INTEGER | Yes | Full calendar days to receive a replenishment, for physical products. |
| reorder_point | INTEGER | Yes | Catalog reorder threshold in units. Used as the default safety stock assumption. |
| current_stock | INTEGER | Yes | Closing physical stock at the last dataset date, in units. |
| elasticity | NUMERIC(8, 4) | No | Catalog price elasticity assumption in [−5, 0]. |

## customers

Grain is one row per customer. Primary key is customer_id.

| Column | Database type | Nullable | Business definition |
|---|---|---|---|
| customer_id | VARCHAR(32) | No | Anonymized customer identifier. |
| customer_segment | VARCHAR(100) | No | Stable customer segment assigned in source data. Separate from first-purchase KPI. |
| region | VARCHAR(100) | No | Sales or customer region, based on the table grain. |
| signup_date | DATE | No | Known customer registration date. Precedes or equals all linked orders. |
| acquisition_channel | VARCHAR(100) | No | Customer’s declared acquisition channel. Campaign CAC uses the first order’s actual attribution. |
| is_returning | BOOLEAN | No | True when at least two transactions exist over the entire dataset. |
| lifetime_value | BIGINT | No | Sum of recorded customer revenue in this snapshot, in VND. |
| last_purchase_date | DATE | Yes | Most recent recorded transaction date or null for an inactive customer. |

## marketing_campaigns

Grain is one row per campaign and business date. Primary key is campaign_id, date.

| Column | Database type | Nullable | Business definition |
|---|---|---|---|
| campaign_id | VARCHAR(32) | No | Campaign identifier. A sale is linked by campaign ID and business date. Null means unattributed. |
| date | DATE | No | Business date in Asia/Ho_Chi_Minh, stored as ISO YYYY-MM-DD. |
| channel | VARCHAR(100) | No | Marketing channel for a campaign-day. |
| campaign_name | VARCHAR(100) | No | Campaign display name. |
| spend | BIGINT | No | Campaign-day spend in VND. |
| impressions | INTEGER | No | Campaign-day impression count. |
| clicks | INTEGER | No | Campaign-day click count. |
| leads | INTEGER | No | Campaign-day lead count. |
| orders | INTEGER | No | Number of transactions attributed to this campaign and date. |
| attributed_revenue | BIGINT | No | Sum of revenue from linked transactions in VND. |

## sales_transactions

Grain is one row per recorded order. Primary key is transaction_id.

| Column | Database type | Nullable | Business definition |
|---|---|---|---|
| transaction_id | VARCHAR(32) | No | Stable order ID. Each row is one order for the demo. |
| date | DATE | No | Business date in Asia/Ho_Chi_Minh, stored as ISO YYYY-MM-DD. |
| customer_id | VARCHAR(32) | No | Anonymized customer identifier. |
| product_id | VARCHAR(32) | No | Stable SKU identifier. |
| quantity | INTEGER | No | Positive number of units purchased. |
| unit_price | BIGINT | No | Transaction price per unit before discount, in VND. |
| discount_pct | NUMERIC(8, 4) | No | Discount fraction from 0 to 1, up to four decimal places. |
| revenue | BIGINT | No | Quantity × unit price × (1 − discount fraction), rounded half up to integer VND per transaction. |
| unit_cost | BIGINT | No | Unit direct cost in VND. Transaction value is recorded at sale time; catalog value is current. |
| total_cost | BIGINT | No | Quantity × transaction unit cost, in VND. |
| gross_profit | BIGINT | No | Revenue − total direct cost, in VND. |
| region | VARCHAR(100) | No | Sales or customer region, based on the table grain. |
| sales_channel | VARCHAR(100) | No | Transaction channel, for example Online, Retail or B2B. |
| campaign_id | VARCHAR(32) | Yes | Campaign identifier. A sale is linked by campaign ID and business date. Null means unattributed. |

## inventory_daily

Grain is one row per physical SKU and business date. Primary key is date, product_id.

| Column | Database type | Nullable | Business definition |
|---|---|---|---|
| date | DATE | No | Business date in Asia/Ho_Chi_Minh, stored as ISO YYYY-MM-DD. |
| product_id | VARCHAR(32) | No | Stable SKU identifier. |
| opening_stock | INTEGER | No | Physical stock at the start of the day, in units. |
| received_qty | INTEGER | No | Units received during the business day. |
| sold_qty | INTEGER | No | Units sold. Must reconcile to SKU-day sales. |
| closing_stock | INTEGER | No | Opening stock + received quantity − sold quantity, in units. |
| stockout_flag | BOOLEAN | No | True when closing stock equals zero. |

## Computed measures

| Measure | Definition |
|---|---|
| Gross margin | Gross profit ÷ revenue. |
| Average order value | Revenue ÷ recorded orders. |
| Active customer | Distinct customer with an order in the selected period. |
| New or returning customer | First observed order on or after the period start is new. An earlier first order means returning. |
| ROAS | Attributed revenue ÷ campaign spend. |
| CAC | Campaign spend ÷ customers whose first recorded order was attributed within the same campaign scope. |
| Lead-to-order conversion | Attributed orders ÷ campaign leads. |
| Inventory availability | Physical SKU-days ending with stock ÷ observed physical SKU-days. |

Ratios with a zero denominator are unavailable. Campaigns and physical inventory are reported only at grains supported by the source.
The synthetic injection manifest records rule changes and date ranges. Its labels are kept outside training features.
