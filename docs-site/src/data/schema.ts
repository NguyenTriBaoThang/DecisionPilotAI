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
    name: 'products',
    rowCount: '50 rows',
    description: 'Master catalog of physical products and business services sold across Online, Retail, and B2B channels.',
    columns: [
      { name: 'product_id', type: 'VARCHAR(32)', pk: true, nullable: false, description: 'Unique SKU identifier (e.g. "P001" SmartDesk Mini, "P003" FocusCam Pro)' },
      { name: 'product_name', type: 'VARCHAR(100)', nullable: false, description: 'Display name of SKU or service' },
      { name: 'category', type: 'VARCHAR(100)', nullable: false, description: 'Category (Office Equipment, Home/Office, Electronics, SaaS Service, Business Service, Accessories)' },
      { name: 'brand', type: 'VARCHAR(100)', nullable: false, description: 'Brand label' },
      { name: 'list_price', type: 'BIGINT', nullable: false, description: 'Catalog list price in VND integer' },
      { name: 'unit_cost', type: 'BIGINT', nullable: false, description: 'Unit cost in VND integer' },
      { name: 'supplier', type: 'VARCHAR(100)', nullable: false, description: 'Primary supplier identifier' },
      { name: 'is_physical', type: 'BOOLEAN', nullable: false, description: 'True for physical stock SKUs; false for services' },
      { name: 'lead_time_days', type: 'INTEGER', nullable: true, description: 'Supplier restock lead time in days (physical SKUs only)' },
      { name: 'reorder_point', type: 'INTEGER', nullable: true, description: 'Minimum stock threshold before reorder alert (physical SKUs only)' },
      { name: 'current_stock', type: 'INTEGER', nullable: true, description: 'On-hand closing inventory units as of snapshot end' },
      { name: 'elasticity', type: 'NUMERIC(8,4)', nullable: false, description: 'Price elasticity of demand constrained to [-5, 0] (e.g. -1.1 for P001)' },
    ],
  },
  {
    name: 'customers',
    rowCount: '10,000 rows',
    description: 'Customer profiles spanning segments, geographic regions, acquisition channels, and reconciled lifetime value.',
    columns: [
      { name: 'customer_id', type: 'VARCHAR(32)', pk: true, nullable: false, description: 'Unique customer identifier (e.g. "C00001")' },
      { name: 'customer_segment', type: 'VARCHAR(100)', nullable: false, description: 'Customer segment (Returning, Individual, Corporate, Price-sensitive)' },
      { name: 'region', type: 'VARCHAR(100)', nullable: false, description: 'Geographic market (HCMC, Hanoi, Da Nang, Can Tho)' },
      { name: 'signup_date', type: 'DATE', nullable: false, description: 'Customer acquisition date' },
      { name: 'acquisition_channel', type: 'VARCHAR(100)', nullable: false, description: 'Initial attribution channel' },
      { name: 'is_returning', type: 'BOOLEAN', nullable: false, description: 'Reconciled repeat purchase indicator' },
      { name: 'lifetime_value', type: 'BIGINT', nullable: false, description: 'Sum of reconciled customer transaction revenue in VND' },
      { name: 'last_purchase_date', type: 'DATE', nullable: true, description: 'Most recent verified transaction date' },
    ],
  },
  {
    name: 'calendar_events',
    rowCount: '730 rows',
    description: 'Chronological calendar reference covering 24 months (2024-10-01 to 2026-09-30) with holiday and promo flags.',
    columns: [
      { name: 'date', type: 'DATE', pk: true, nullable: false, description: 'Calendar date' },
      { name: 'day_of_week', type: 'INTEGER', nullable: false, description: '0 (Monday) through 6 (Sunday)' },
      { name: 'month', type: 'INTEGER', nullable: false, description: 'Calendar month (1–12)' },
      { name: 'quarter', type: 'INTEGER', nullable: false, description: 'Calendar quarter (1–4)' },
      { name: 'is_weekend', type: 'BOOLEAN', nullable: false, description: 'True for Saturday and Sunday' },
      { name: 'is_holiday', type: 'BOOLEAN', nullable: false, description: 'Public holiday flag (New Year, 30/4, 1/5, 2/9, Year-end shopping)' },
      { name: 'event_name', type: 'VARCHAR(100)', nullable: true, description: 'Holiday or seasonal event name' },
      { name: 'promotion_flag', type: 'BOOLEAN', nullable: false, description: 'Scheduled storewide promotion indicator' },
    ],
  },
  {
    name: 'sales_transactions',
    rowCount: '50,000 rows',
    description: 'Reconciled transaction line items enforcing revenue = quantity * unit_price * (1 - discount_pct) and gross_profit = revenue - total_cost.',
    columns: [
      { name: 'transaction_id', type: 'VARCHAR(32)', pk: true, nullable: false, description: 'Unique transaction identifier' },
      { name: 'date', type: 'DATE', fk: 'calendar_events.date', nullable: false, description: 'Transaction calendar date' },
      { name: 'customer_id', type: 'VARCHAR(32)', fk: 'customers.customer_id', nullable: false, description: 'Foreign key to customers' },
      { name: 'product_id', type: 'VARCHAR(32)', fk: 'products.product_id', nullable: false, description: 'Foreign key to products' },
      { name: 'quantity', type: 'INTEGER', nullable: false, description: 'Units sold (quantity > 0)' },
      { name: 'unit_price', type: 'BIGINT', nullable: false, description: 'Gross unit price in VND integer' },
      { name: 'discount_pct', type: 'NUMERIC(8,4)', nullable: false, description: 'Fractional discount applied [0, 1]' },
      { name: 'revenue', type: 'BIGINT', nullable: false, description: 'Net realized transaction revenue in VND integer' },
      { name: 'unit_cost', type: 'BIGINT', nullable: false, description: 'Unit cost snapshot in VND integer' },
      { name: 'total_cost', type: 'BIGINT', nullable: false, description: 'quantity * unit_cost in VND integer' },
      { name: 'gross_profit', type: 'BIGINT', nullable: false, description: 'revenue - total_cost in VND integer' },
      { name: 'region', type: 'VARCHAR(100)', nullable: false, description: 'Sales region (HCMC, Hanoi, Da Nang, Can Tho)' },
      { name: 'sales_channel', type: 'VARCHAR(100)', nullable: false, description: 'Sales channel (Online, Retail, B2B)' },
      { name: 'campaign_id', type: 'VARCHAR(32)', fk: 'marketing_campaigns.(campaign_id, date)', nullable: true, description: 'Optional marketing attribution key' },
    ],
  },
  {
    name: 'marketing_campaigns',
    rowCount: '2,920 rows',
    description: 'Daily campaign spend, full funnel counts (impressions >= clicks >= leads >= orders), and attributed revenue.',
    columns: [
      { name: 'campaign_id', type: 'VARCHAR(32)', pk: true, nullable: false, description: 'Campaign identifier (part of composite PK)' },
      { name: 'date', type: 'DATE', pk: true, fk: 'calendar_events.date', nullable: false, description: 'Activity date (part of composite PK)' },
      { name: 'channel', type: 'VARCHAR(100)', nullable: false, description: 'Channel (Facebook Ads, Google Ads, TikTok Ads, Email)' },
      { name: 'campaign_name', type: 'VARCHAR(100)', nullable: false, description: 'Campaign display name' },
      { name: 'spend', type: 'BIGINT', nullable: false, description: 'Daily ad spend in VND integer' },
      { name: 'impressions', type: 'INTEGER', nullable: false, description: 'Total ad impressions' },
      { name: 'clicks', type: 'INTEGER', nullable: false, description: 'Clicks (<= impressions)' },
      { name: 'leads', type: 'INTEGER', nullable: false, description: 'Leads (<= clicks)' },
      { name: 'orders', type: 'INTEGER', nullable: false, description: 'Attributed orders (<= leads)' },
      { name: 'attributed_revenue', type: 'BIGINT', nullable: false, description: 'Attributed revenue in VND integer' },
    ],
  },
  {
    name: 'inventory_daily',
    rowCount: '24,820 rows',
    description: 'Daily physical stock ledger enforcing opening_stock + received_qty - sold_qty = closing_stock.',
    columns: [
      { name: 'date', type: 'DATE', pk: true, fk: 'calendar_events.date', nullable: false, description: 'Inventory date (part of composite PK)' },
      { name: 'product_id', type: 'VARCHAR(32)', pk: true, fk: 'products.product_id', nullable: false, description: 'Physical SKU FK (part of composite PK)' },
      { name: 'opening_stock', type: 'INTEGER', nullable: false, description: 'Units on hand at start of day' },
      { name: 'received_qty', type: 'INTEGER', nullable: false, description: 'Supplier replenishment units received' },
      { name: 'sold_qty', type: 'INTEGER', nullable: false, description: 'Units fulfilled against sales_transactions' },
      { name: 'closing_stock', type: 'INTEGER', nullable: false, description: 'Units remaining at end of day' },
      { name: 'stockout_flag', type: 'BOOLEAN', nullable: false, description: 'True iff closing_stock == 0' },
    ],
  },
]

