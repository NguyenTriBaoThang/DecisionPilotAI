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
    description: 'Master catalog of physical products and business services sold across retail branches and online channels.',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', pk: true, nullable: false, description: 'Unique product identifier (e.g. "prod_001")' },
      { name: 'sku', type: 'VARCHAR(32)', nullable: false, description: 'Stock Keeping Unit code (e.g. "P001", "P003")' },
      { name: 'name', type: 'VARCHAR(128)', nullable: false, description: 'Display name (e.g. "SmartDesk Mini", "FocusCam Pro")' },
      { name: 'category', type: 'VARCHAR(64)', nullable: false, description: 'Category (Electronics, Furniture, Accessories, Services)' },
      { name: 'unit_price', type: 'INTEGER', nullable: false, description: 'Base retail sales price in VND integer' },
      { name: 'unit_cost', type: 'INTEGER', nullable: false, description: 'COGS base unit production/procurement cost in VND' },
      { name: 'lead_time_days', type: 'INTEGER', nullable: false, description: 'Procurement restock lead time in days (e.g. 7-14)' },
    ],
  },
  {
    name: 'customers',
    rowCount: '10,000 rows',
    description: 'Customer profiles with regional demographic segments, acquisition channels, and RFM scores.',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', pk: true, nullable: false, description: 'Unique customer identifier (UUID)' },
      { name: 'customer_code', type: 'VARCHAR(32)', nullable: false, description: 'Human-readable customer ID' },
      { name: 'region', type: 'VARCHAR(64)', nullable: false, description: 'Geographic market (Hồ Chí Minh, Hà Nội, Đà Nẵng, Cần Thơ)' },
      { name: 'segment', type: 'VARCHAR(64)', nullable: false, description: 'Customer segment (Retail New, Retail VIP, SME Wholesale)' },
      { name: 'created_at', type: 'TIMESTAMP', nullable: false, description: 'Customer registration timestamp' },
    ],
  },
  {
    name: 'calendar_events',
    rowCount: '730 rows',
    description: 'Chronological calendar reference covering 2 full fiscal years (2024-10-01 to 2026-09-30) with holiday flags.',
    columns: [
      { name: 'calendar_date', type: 'DATE', pk: true, nullable: false, description: 'Calendar date' },
      { name: 'day_of_week', type: 'INTEGER', nullable: false, description: '0 (Monday) through 6 (Sunday)' },
      { name: 'is_weekend', type: 'BOOLEAN', nullable: false, description: 'True for Saturday and Sunday' },
      { name: 'is_holiday', type: 'BOOLEAN', nullable: false, description: 'Vietnamese statutory holidays (Tết Nguyên Đán, 30/4, 2/9)' },
      { name: 'holiday_name', type: 'VARCHAR(128)', nullable: true, description: 'Name of the festival or holiday' },
      { name: 'is_major_sale_day', type: 'BOOLEAN', nullable: false, description: 'E-commerce double-day sale flag (11.11, 12.12, Black Friday)' },
    ],
  },
  {
    name: 'sales_transactions',
    rowCount: '50,000 rows',
    description: 'Individual verified transaction line items recording units, discounts, gross/net revenue, and delivery region.',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', pk: true, nullable: false, description: 'Transaction line UUID' },
      { name: 'transaction_date', type: 'DATE', fk: 'calendar_events.calendar_date', nullable: false, description: 'Date order was placed' },
      { name: 'product_id', type: 'VARCHAR(64)', fk: 'products.id', nullable: false, description: 'Foreign key to products' },
      { name: 'customer_id', type: 'VARCHAR(64)', fk: 'customers.id', nullable: false, description: 'Foreign key to customers' },
      { name: 'channel', type: 'VARCHAR(64)', nullable: false, description: 'Sales channel (Shopee Mall, TikTok Shop, Direct Store)' },
      { name: 'region', type: 'VARCHAR(64)', nullable: false, description: 'Delivery destination region' },
      { name: 'units', type: 'INTEGER', nullable: false, description: 'Quantity of items ordered' },
      { name: 'unit_price', type: 'INTEGER', nullable: false, description: 'Realized price per unit in VND' },
      { name: 'discount_amount', type: 'INTEGER', nullable: false, description: 'Total discount deducted in VND' },
      { name: 'gross_revenue', type: 'INTEGER', nullable: false, description: 'Total revenue collected in VND integer' },
      { name: 'cogs', type: 'INTEGER', nullable: false, description: 'Total Cost of Goods Sold in VND' },
    ],
  },
  {
    name: 'marketing_campaigns',
    rowCount: '2,920 rows',
    description: 'Daily marketing spend, impressions, clicks, leads, and channel-attributed sales across ad networks.',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', pk: true, nullable: false, description: 'Daily campaign record identifier' },
      { name: 'campaign_date', type: 'DATE', fk: 'calendar_events.calendar_date', nullable: false, description: 'Date of advertising activity' },
      { name: 'channel', type: 'VARCHAR(64)', nullable: false, description: 'Channel (Facebook Ads, Google Search, TikTok Ads, Zalo)' },
      { name: 'spend_vnd', type: 'INTEGER', nullable: false, description: 'Actual daily ad spend in VND integer' },
      { name: 'impressions', type: 'INTEGER', nullable: false, description: 'Total ad impressions served' },
      { name: 'clicks', type: 'INTEGER', nullable: false, description: 'Link clicks recorded' },
      { name: 'attributed_revenue_vnd', type: 'INTEGER', nullable: false, description: 'Revenue attributed to campaign by channel' },
      { name: 'roas', type: 'FLOAT', nullable: false, description: 'Return on Ad Spend ratio (revenue / spend)' },
    ],
  },
  {
    name: 'inventory_daily',
    rowCount: '24,820 rows',
    description: 'Daily stock snapshot per product SKU tracking starting inventory, receipts, outbound shipments, and closing stock.',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', pk: true, nullable: false, description: 'Daily inventory snapshot record ID' },
      { name: 'inventory_date', type: 'DATE', fk: 'calendar_events.calendar_date', nullable: false, description: 'Stock record date' },
      { name: 'product_id', type: 'VARCHAR(64)', fk: 'products.id', nullable: false, description: 'Foreign key to products' },
      { name: 'opening_stock', type: 'INTEGER', nullable: false, description: 'Stock level at start of day' },
      { name: 'received_stock', type: 'INTEGER', nullable: false, description: 'Units received from suppliers' },
      { name: 'shipped_units', type: 'INTEGER', nullable: false, description: 'Units fulfilled to customers' },
      { name: 'closing_stock', type: 'INTEGER', nullable: false, description: 'Stock level at end of business day' },
      { name: 'safety_stock_threshold', type: 'INTEGER', nullable: false, description: 'Safety threshold triggering reorder alert' },
    ],
  },
]

