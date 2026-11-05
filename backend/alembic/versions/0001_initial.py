"""Initial DecisionPilot business schema and daily views."""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('audit_events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('occurred_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('kind', sa.String(length=100), nullable=False),
    sa.Column('subject', sa.String(length=100), nullable=False),
    sa.Column('payload', sa.JSON(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audit_events'))
    )
    op.create_table('calendar_events',
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('day_of_week', sa.Integer(), nullable=False),
    sa.Column('month', sa.Integer(), nullable=False),
    sa.Column('quarter', sa.Integer(), nullable=False),
    sa.Column('is_weekend', sa.Boolean(), nullable=False),
    sa.Column('is_holiday', sa.Boolean(), nullable=False),
    sa.Column('event_name', sa.String(length=100), nullable=True),
    sa.Column('promotion_flag', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('date', name=op.f('pk_calendar_events'))
    )
    op.create_table('customers',
    sa.Column('customer_id', sa.String(length=32), nullable=False),
    sa.Column('customer_segment', sa.String(length=100), nullable=False),
    sa.Column('region', sa.String(length=100), nullable=False),
    sa.Column('signup_date', sa.Date(), nullable=False),
    sa.Column('acquisition_channel', sa.String(length=100), nullable=False),
    sa.Column('is_returning', sa.Boolean(), nullable=False),
    sa.Column('lifetime_value', sa.BigInteger(), nullable=False),
    sa.Column('last_purchase_date', sa.Date(), nullable=True),
    sa.CheckConstraint('lifetime_value >= 0', name='nonnegative_lifetime_value'),
    sa.PrimaryKeyConstraint('customer_id', name=op.f('pk_customers'))
    )
    op.create_table('dataset_metadata',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('payload', sa.JSON(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_dataset_metadata'))
    )
    op.create_table('products',
    sa.Column('product_id', sa.String(length=32), nullable=False),
    sa.Column('product_name', sa.String(length=100), nullable=False),
    sa.Column('category', sa.String(length=100), nullable=False),
    sa.Column('brand', sa.String(length=100), nullable=False),
    sa.Column('list_price', sa.BigInteger(), nullable=False),
    sa.Column('unit_cost', sa.BigInteger(), nullable=False),
    sa.Column('supplier', sa.String(length=100), nullable=False),
    sa.Column('is_physical', sa.Boolean(), nullable=False),
    sa.Column('lead_time_days', sa.Integer(), nullable=True),
    sa.Column('reorder_point', sa.Integer(), nullable=True),
    sa.Column('current_stock', sa.Integer(), nullable=True),
    sa.Column('elasticity', sa.Numeric(precision=8, scale=4, asdecimal=False), nullable=False),
    sa.CheckConstraint('(is_physical AND lead_time_days >= 1 AND reorder_point >= 0 AND current_stock >= 0 AND lead_time_days IS NOT NULL AND reorder_point IS NOT NULL AND current_stock IS NOT NULL) OR (NOT is_physical AND lead_time_days IS NULL AND reorder_point IS NULL AND current_stock IS NULL)', name='valid_product_inventory'),
    sa.CheckConstraint('list_price > 0 AND unit_cost >= 0 AND elasticity BETWEEN -5 AND 0', name='valid_product_price'),
    sa.PrimaryKeyConstraint('product_id', name=op.f('pk_products'))
    )
    op.create_index(op.f('ix_products_category'), 'products', ['category'], unique=False)
    op.create_table('inventory_daily',
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('product_id', sa.String(length=32), nullable=False),
    sa.Column('opening_stock', sa.Integer(), nullable=False),
    sa.Column('received_qty', sa.Integer(), nullable=False),
    sa.Column('sold_qty', sa.Integer(), nullable=False),
    sa.Column('closing_stock', sa.Integer(), nullable=False),
    sa.Column('stockout_flag', sa.Boolean(), nullable=False),
    sa.CheckConstraint('opening_stock >= 0 AND received_qty >= 0 AND sold_qty >= 0 AND closing_stock >= 0 AND opening_stock + received_qty - sold_qty = closing_stock AND stockout_flag = (closing_stock = 0)', name='valid_inventory_movement'),
    sa.ForeignKeyConstraint(['date'], ['calendar_events.date'], name=op.f('fk_inventory_daily_date')),
    sa.ForeignKeyConstraint(['product_id'], ['products.product_id'], name=op.f('fk_inventory_daily_product_id')),
    sa.PrimaryKeyConstraint('date', 'product_id', name=op.f('pk_inventory_daily'))
    )
    op.create_index(op.f('ix_inventory_daily_product_id'), 'inventory_daily', ['product_id'], unique=False)
    op.create_table('marketing_campaigns',
    sa.Column('campaign_id', sa.String(length=32), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('channel', sa.String(length=100), nullable=False),
    sa.Column('campaign_name', sa.String(length=100), nullable=False),
    sa.Column('spend', sa.BigInteger(), nullable=False),
    sa.Column('impressions', sa.Integer(), nullable=False),
    sa.Column('clicks', sa.Integer(), nullable=False),
    sa.Column('leads', sa.Integer(), nullable=False),
    sa.Column('orders', sa.Integer(), nullable=False),
    sa.Column('attributed_revenue', sa.BigInteger(), nullable=False),
    sa.CheckConstraint('impressions >= clicks AND clicks >= leads AND leads >= orders AND orders >= 0 AND spend >= 0 AND attributed_revenue >= 0', name='valid_funnel'),
    sa.ForeignKeyConstraint(['date'], ['calendar_events.date'], name=op.f('fk_marketing_campaigns_date')),
    sa.PrimaryKeyConstraint('campaign_id', 'date', name=op.f('pk_marketing_campaigns'))
    )
    op.create_index(op.f('ix_marketing_campaigns_channel'), 'marketing_campaigns', ['channel'], unique=False)
    op.create_table('sales_transactions',
    sa.Column('transaction_id', sa.String(length=32), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('customer_id', sa.String(length=32), nullable=False),
    sa.Column('product_id', sa.String(length=32), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('unit_price', sa.BigInteger(), nullable=False),
    sa.Column('discount_pct', sa.Numeric(precision=8, scale=4, asdecimal=False), nullable=False),
    sa.Column('revenue', sa.BigInteger(), nullable=False),
    sa.Column('unit_cost', sa.BigInteger(), nullable=False),
    sa.Column('total_cost', sa.BigInteger(), nullable=False),
    sa.Column('gross_profit', sa.BigInteger(), nullable=False),
    sa.Column('region', sa.String(length=100), nullable=False),
    sa.Column('sales_channel', sa.String(length=100), nullable=False),
    sa.Column('campaign_id', sa.String(length=32), nullable=True),
    sa.CheckConstraint('quantity > 0 AND unit_price > 0 AND unit_cost >= 0 AND discount_pct BETWEEN 0 AND 1 AND revenue >= 0 AND total_cost = quantity * unit_cost AND gross_profit = revenue - total_cost', name='valid_transaction'),
    sa.ForeignKeyConstraint(['campaign_id', 'date'], ['marketing_campaigns.campaign_id', 'marketing_campaigns.date'], name=op.f('fk_sales_transactions_campaign_id')),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.customer_id'], name=op.f('fk_sales_transactions_customer_id')),
    sa.ForeignKeyConstraint(['date'], ['calendar_events.date'], name=op.f('fk_sales_transactions_date')),
    sa.ForeignKeyConstraint(['product_id'], ['products.product_id'], name=op.f('fk_sales_transactions_product_id')),
    sa.PrimaryKeyConstraint('transaction_id', name=op.f('pk_sales_transactions'))
    )
    op.create_index('ix_sales_date_region_channel', 'sales_transactions', ['date', 'region', 'sales_channel'], unique=False)
    op.create_index(op.f('ix_sales_transactions_customer_id'), 'sales_transactions', ['customer_id'], unique=False)
    op.create_index(op.f('ix_sales_transactions_product_id'), 'sales_transactions', ['product_id'], unique=False)
    op.execute('CREATE VIEW daily_sales AS SELECT date, SUM(revenue) AS revenue, SUM(gross_profit) AS gross_profit,\n                  COUNT(*) AS orders, SUM(quantity) AS units FROM sales_transactions GROUP BY date')
    op.execute('CREATE VIEW daily_marketing AS SELECT date, SUM(spend) AS spend, SUM(attributed_revenue) AS attributed_revenue,\n                      SUM(leads) AS leads, SUM(orders) AS orders FROM marketing_campaigns GROUP BY date')


def downgrade():
    op.execute('DROP VIEW daily_marketing')
    op.execute('DROP VIEW daily_sales')
    op.drop_index(op.f('ix_sales_transactions_product_id'), table_name='sales_transactions')
    op.drop_index(op.f('ix_sales_transactions_customer_id'), table_name='sales_transactions')
    op.drop_index('ix_sales_date_region_channel', table_name='sales_transactions')
    op.drop_table('sales_transactions')
    op.drop_index(op.f('ix_marketing_campaigns_channel'), table_name='marketing_campaigns')
    op.drop_table('marketing_campaigns')
    op.drop_index(op.f('ix_inventory_daily_product_id'), table_name='inventory_daily')
    op.drop_table('inventory_daily')
    op.drop_index(op.f('ix_products_category'), table_name='products')
    op.drop_table('products')
    op.drop_table('dataset_metadata')
    op.drop_table('customers')
    op.drop_table('calendar_events')
    op.drop_table('audit_events')
