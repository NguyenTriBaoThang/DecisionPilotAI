export interface TableColumn {
  name: string
  type: string
  pk?: boolean
  fk?: string
  nullable: boolean
  description: string
}

export interface TableDef {
  name: string
  rowCount: string
  description: string
  columns: TableColumn[]
}

export const RELATIONAL_TABLES: TableDef[] = [
  {
    name: 'calendar_events',
    rowCount: '730 rows',
    description: 'Chronological calendar dimension spanning 2 full fiscal years (2024-10-01 to 2026-09-30) with weekend, holiday, and promotion flags.',
    columns: [
      { name: 'date', type: 'DATE', pk: true, nullable: false, description: 'Calendar date (2024-10-01 to 2026-09-30)' },
      { name: 'day_of_week', type: 'INTEGER', nullable: false, description: '0 (Monday) through 6 (Sunday)' },
      { name: 'month', type: 'INTEGER', nullable: false, description: 'Calendar month (1..12)' },
      { name: 'quarter', type: 'INTEGER', nullable: false, description: 'Calendar quarter (1..4)' },
      { name: 'is_weekend', type: 'BOOLEAN', nullable: false, description: 'True for Saturday and Sunday' },
      { name: 'is_holiday', type: 'BOOLEAN', nullable: false, description: 'Vietnamese statutory holidays (Tết Nguyên Đán, 30/4, 2/9, etc.)' },
      { name: 'event_name', type: 'VARCHAR(100)', nullable: true, description: 'Name of the holiday or retail promotional event' },
      { name: 'promotion_flag', type: 'BOOLEAN', nullable: false, description: 'Seasonal campaign / double-day promotion active flag' },
    ],
  },
  {
    name: 'products',
    rowCount: '50 rows',
    description: 'Master catalog of 34 physical SKUs and 16 services across 6 categories with price, cost, stock, and price-elasticity constraints.',
    columns: [
      { name: 'product_id', type: 'VARCHAR(32)', pk: true, nullable: false, description: 'Unique product identifier (e.g. "P001", "P003")' },
      { name: 'product_name', type: 'VARCHAR(100)', nullable: false, description: 'Display name (e.g. "Ergonomic Standing Desk Pro")' },
      { name: 'category', type: 'VARCHAR(100)', nullable: false, description: 'Product/service category (6 categories, indexed)' },
      { name: 'brand', type: 'VARCHAR(100)', nullable: false, description: 'Brand or house line identifier' },
      { name: 'list_price', type: 'BIGINT', nullable: false, description: 'Catalog list price in integer VND (> 0)' },
      { name: 'unit_cost', type: 'BIGINT', nullable: false, description: 'COGS per unit in integer VND (>= 0)' },
      { name: 'supplier', type: 'VARCHAR(100)', nullable: false, description: 'Vendor / supplier name' },
      { name: 'is_physical', type: 'BOOLEAN', nullable: false, description: 'True for physical SKUs (34), False for services (16)' },
      { name: 'lead_time_days', type: 'INTEGER', nullable: true, description: 'Restock lead time in days (>= 1 for physical SKUs, NULL for services)' },
      { name: 'reorder_point', type: 'INTEGER', nullable: true, description: 'Reorder safety threshold (>= 0 for physical SKUs, NULL for services)' },
      { name: 'current_stock', type: 'INTEGER', nullable: true, description: 'Latest closing stock level (CHECK constraint validated)' },
      { name: 'elasticity', type: 'NUMERIC(8,4)', nullable: false, description: 'Price elasticity coefficient clamped in [-5, 0]' },
    ],
  },
  {
    name: 'customers',
    rowCount: '10,000 rows',
    description: 'Customer directory segmented across 4 regions (HCMC, Hanoi, Da Nang, Can Tho), acquisition channels, and lifetime value.',
    columns: [
      { name: 'customer_id', type: 'VARCHAR(32)', pk: true, nullable: false, description: 'Unique customer identifier (e.g. "C00001")' },
      { name: 'customer_segment', type: 'VARCHAR(100)', nullable: false, description: 'Customer segment (Retail, VIP, SME, Enterprise)' },
      { name: 'region', type: 'VARCHAR(100)', nullable: false, description: 'Market region (HCMC, Hanoi, Da Nang, Can Tho)' },
      { name: 'signup_date', type: 'DATE', nullable: false, description: 'First acquisition date' },
      { name: 'acquisition_channel', type: 'VARCHAR(100)', nullable: false, description: 'Channel (Facebook Ads, Google Ads, TikTok Ads, Email, Organic)' },
      { name: 'is_returning', type: 'BOOLEAN', nullable: false, description: 'Repeat customer flag' },
      { name: 'lifetime_value', type: 'BIGINT', nullable: false, description: 'Cumulative revenue in integer VND (>= 0)' },
      { name: 'last_purchase_date', type: 'DATE', nullable: true, description: 'Most recent transaction date' },
    ],
  },
  {
    name: 'marketing_campaigns',
    rowCount: '2,920 rows',
    description: 'Daily advertising funnel and attribution table across 4 paid channels with strict monotonicity CHECK (impressions >= clicks >= leads >= orders).',
    columns: [
      { name: 'campaign_id', type: 'VARCHAR(32)', pk: true, nullable: false, description: 'Composite PK part 1: campaign identifier' },
      { name: 'date', type: 'DATE', pk: true, fk: 'calendar_events.date', nullable: false, description: 'Composite PK part 2: campaign date' },
      { name: 'channel', type: 'VARCHAR(100)', nullable: false, description: 'Channel (Facebook Ads, Google Ads, TikTok Ads, Email)' },
      { name: 'campaign_name', type: 'VARCHAR(100)', nullable: false, description: 'Campaign display title' },
      { name: 'spend', type: 'BIGINT', nullable: false, description: 'Daily ad spend in integer VND (>= 0)' },
      { name: 'impressions', type: 'INTEGER', nullable: false, description: 'Ad impressions served (>= clicks)' },
      { name: 'clicks', type: 'INTEGER', nullable: false, description: 'Ad clicks recorded (>= leads)' },
      { name: 'leads', type: 'INTEGER', nullable: false, description: 'Captured leads (>= orders)' },
      { name: 'orders', type: 'INTEGER', nullable: false, description: 'Attributed orders (>= 0)' },
      { name: 'attributed_revenue', type: 'BIGINT', nullable: false, description: 'Channel-attributed revenue in integer VND' },
    ],
  },
  {
    name: 'sales_transactions',
    rowCount: '50,000 rows',
    description: 'Fact table of transactional line items enforcing exact integer arithmetic CHECK (total_cost = quantity * unit_cost, gross_profit = revenue - total_cost).',
    columns: [
      { name: 'transaction_id', type: 'VARCHAR(32)', pk: true, nullable: false, description: 'Unique transaction identifier' },
      { name: 'date', type: 'DATE', fk: 'calendar_events.date', nullable: false, description: 'Transaction date (indexed with region, sales_channel)' },
      { name: 'customer_id', type: 'VARCHAR(32)', fk: 'customers.customer_id', nullable: false, description: 'Foreign key to customers (indexed)' },
      { name: 'product_id', type: 'VARCHAR(32)', fk: 'products.product_id', nullable: false, description: 'Foreign key to products (indexed)' },
      { name: 'quantity', type: 'INTEGER', nullable: false, description: 'Units sold (> 0)' },
      { name: 'unit_price', type: 'BIGINT', nullable: false, description: 'List price per unit in integer VND (> 0)' },
      { name: 'discount_pct', type: 'NUMERIC(8,4)', nullable: false, description: 'Applied discount ratio in [0, 1]' },
      { name: 'revenue', type: 'BIGINT', nullable: false, description: 'Realized revenue in integer VND (>= 0)' },
      { name: 'unit_cost', type: 'BIGINT', nullable: false, description: 'Unit COGS at transaction time (>= 0)' },
      { name: 'total_cost', type: 'BIGINT', nullable: false, description: 'CHECK: quantity * unit_cost' },
      { name: 'gross_profit', type: 'BIGINT', nullable: false, description: 'CHECK: revenue - total_cost' },
      { name: 'region', type: 'VARCHAR(100)', nullable: false, description: 'Order region (HCMC, Hanoi, Da Nang, Can Tho)' },
      { name: 'sales_channel', type: 'VARCHAR(100)', nullable: false, description: 'Sales channel (Online, Retail, B2B)' },
      { name: 'campaign_id', type: 'VARCHAR(32)', fk: 'marketing_campaigns.(campaign_id, date)', nullable: true, description: 'Optional composite FK to marketing_campaigns' },
    ],
  },
  {
    name: 'inventory_daily',
    rowCount: '24,820 rows',
    description: 'Daily inventory ledger (34 physical SKUs x 730 days) enforcing exact conservation law: closing_stock = opening_stock + received_qty - sold_qty.',
    columns: [
      { name: 'date', type: 'DATE', pk: true, fk: 'calendar_events.date', nullable: false, description: 'Composite PK part 1: stock snapshot date' },
      { name: 'product_id', type: 'VARCHAR(32)', pk: true, fk: 'products.product_id', nullable: false, description: 'Composite PK part 2: physical SKU ID' },
      { name: 'opening_stock', type: 'INTEGER', nullable: false, description: 'Beginning on-hand units (>= 0)' },
      { name: 'received_qty', type: 'INTEGER', nullable: false, description: 'Inbound restock units received (>= 0)' },
      { name: 'sold_qty', type: 'INTEGER', nullable: false, description: 'Units sold on this date (>= 0)' },
      { name: 'closing_stock', type: 'INTEGER', nullable: false, description: 'CHECK: opening_stock + received_qty - sold_qty (>= 0)' },
      { name: 'stockout_flag', type: 'BOOLEAN', nullable: false, description: 'CHECK: stockout_flag = (closing_stock = 0)' },
    ],
  },
]

export const SYSTEM_TABLES = [
  {
    name: 'dataset_metadata',
    purpose: 'Stores active dataset snapshot manifest, 24-hex SHA ID, date range, and row counts.',
  },
  {
    name: 'audit_events',
    purpose: 'Append-only ledger logging query, dataset_loaded, recommendation_feedback, and scenario_feedback events.',
  },
  {
    name: 'simulation_runs',
    purpose: 'Persists deterministic SHA-256 simulation runs keyed by (id, dataset_id) for scenario feedback.',
  },
]
