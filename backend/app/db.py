"""Relational schema and transaction boundaries for the single-workspace MVP."""

import os
from contextlib import contextmanager
from pathlib import Path

import sqlalchemy as sa

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = Path(os.getenv("ARTIFACT_DIR", ROOT / "artifacts"))
metadata = sa.MetaData(naming_convention={"pk": "pk_%(table_name)s", "fk": "fk_%(table_name)s_%(column_0_name)s",
                                          "ix": "ix_%(table_name)s_%(column_0_name)s"})
C = sa.Column


def label(name, **kwargs):
    return C(name, sa.String(100), nullable=False, **kwargs)


def amount(name):
    return C(name, sa.BigInteger, nullable=False)


def count(name):
    return C(name, sa.Integer, nullable=False)


def rate(name):
    return C(name, sa.Numeric(8, 4, asdecimal=False), nullable=False)


def dated(*, key=False, ref=False):
    constraints = [sa.ForeignKey("calendar_events.date")] if ref else []
    return C("date", sa.Date, *constraints, primary_key=key, nullable=False)


calendar = sa.Table(
    "calendar_events", metadata, dated(key=True), count("day_of_week"), count("month"), count("quarter"),
    C("is_weekend", sa.Boolean, nullable=False), C("is_holiday", sa.Boolean, nullable=False),
    C("event_name", sa.String(100)), C("promotion_flag", sa.Boolean, nullable=False),
)
products = sa.Table(
    "products", metadata, C("product_id", sa.String(32), primary_key=True), label("product_name"),
    label("category", index=True), label("brand"), amount("list_price"), amount("unit_cost"), label("supplier"),
    C("is_physical", sa.Boolean, nullable=False), C("lead_time_days", sa.Integer),
    C("reorder_point", sa.Integer), C("current_stock", sa.Integer), rate("elasticity"),
    sa.CheckConstraint("list_price > 0 AND unit_cost >= 0 AND elasticity BETWEEN -5 AND 0", name="valid_product_price"),
    sa.CheckConstraint(
        "(is_physical AND lead_time_days >= 1 AND reorder_point >= 0 AND current_stock >= 0 "
        "AND lead_time_days IS NOT NULL AND reorder_point IS NOT NULL AND current_stock IS NOT NULL) "
        "OR (NOT is_physical AND lead_time_days IS NULL AND reorder_point IS NULL AND current_stock IS NULL)",
        name="valid_product_inventory",
    ),
)
customers = sa.Table(
    "customers", metadata, C("customer_id", sa.String(32), primary_key=True), label("customer_segment"),
    label("region"), C("signup_date", sa.Date, nullable=False), label("acquisition_channel"),
    C("is_returning", sa.Boolean, nullable=False), amount("lifetime_value"), C("last_purchase_date", sa.Date),
    sa.CheckConstraint("lifetime_value >= 0", name="nonnegative_lifetime_value"),
)
marketing = sa.Table(
    "marketing_campaigns", metadata, C("campaign_id", sa.String(32), primary_key=True),
    dated(key=True, ref=True), label("channel", index=True), label("campaign_name"), amount("spend"),
    count("impressions"), count("clicks"), count("leads"), count("orders"), amount("attributed_revenue"),
    sa.CheckConstraint(
        "impressions >= clicks AND clicks >= leads AND leads >= orders AND orders >= 0 "
        "AND spend >= 0 AND attributed_revenue >= 0", name="valid_funnel",
    ),
)
sales = sa.Table(
    "sales_transactions", metadata, C("transaction_id", sa.String(32), primary_key=True),
    dated(ref=True), C("customer_id", sa.ForeignKey("customers.customer_id"), nullable=False, index=True),
    C("product_id", sa.ForeignKey("products.product_id"), nullable=False, index=True),
    count("quantity"), amount("unit_price"), rate("discount_pct"), amount("revenue"),
    amount("unit_cost"), amount("total_cost"), amount("gross_profit"), label("region"), label("sales_channel"),
    C("campaign_id", sa.String(32)),
    sa.ForeignKeyConstraint(["campaign_id", "date"], ["marketing_campaigns.campaign_id", "marketing_campaigns.date"]),
    sa.CheckConstraint(
        "quantity > 0 AND unit_price > 0 AND unit_cost >= 0 AND discount_pct BETWEEN 0 AND 1 "
        "AND revenue >= 0 AND total_cost = quantity * unit_cost AND gross_profit = revenue - total_cost",
        name="valid_transaction",
    ),
    sa.Index("ix_sales_date_region_channel", "date", "region", "sales_channel"),
)
inventory = sa.Table(
    "inventory_daily", metadata, dated(key=True, ref=True),
    C("product_id", sa.ForeignKey("products.product_id"), primary_key=True, index=True),
    count("opening_stock"), count("received_qty"), count("sold_qty"), count("closing_stock"),
    C("stockout_flag", sa.Boolean, nullable=False),
    sa.CheckConstraint(
        "opening_stock >= 0 AND received_qty >= 0 AND sold_qty >= 0 AND closing_stock >= 0 "
        "AND opening_stock + received_qty - sold_qty = closing_stock "
        "AND stockout_flag = (closing_stock = 0)", name="valid_inventory_movement",
    ),
)
datasets = sa.Table(
    "dataset_metadata", metadata, C("id", sa.Integer, primary_key=True),
    C("payload", sa.JSON, nullable=False),
)
audit = sa.Table(
    "audit_events", metadata, C("id", sa.Integer, primary_key=True),
    C("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    label("kind"), C("subject", sa.String(100), nullable=False), C("payload", sa.JSON, nullable=False),
)
sa.Index("ix_audit_kind_subject_id", audit.c.kind, audit.c.subject, audit.c.id)
DATA_TABLES = (calendar, products, customers, marketing, sales, inventory)

simulations = sa.Table(
    "simulation_runs", metadata, C("id", sa.String(64), primary_key=True),
    C("dataset_id", sa.String(24), nullable=False, index=True),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("payload", sa.JSON, nullable=False),
)


def make_engine(url=None):
    url = url or os.getenv("DATABASE_URL")
    if not url and os.getenv("POSTGRES_HOST"):
        url = sa.URL.create("postgresql+psycopg", username=os.getenv("POSTGRES_USER"),
                            password=os.getenv("POSTGRES_PASSWORD"), host=os.environ["POSTGRES_HOST"],
                            database=os.getenv("POSTGRES_DB"))
    if not url:
        url = "sqlite:///" + str(ROOT / "data" / "local.sqlite")
    engine = sa.create_engine(url, pool_pre_ping=True)
    if engine.dialect.name == "sqlite":
        @sa.event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys = ON")
    return engine


@contextmanager
def read_connection(engine):
    with engine.connect() as conn:
        if conn.dialect.name == "postgresql":
            conn.exec_driver_sql("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            conn.exec_driver_sql("SET LOCAL statement_timeout = '8s'")
            yield conn
        else:
            conn.exec_driver_sql("PRAGMA query_only = ON")
            try:
                conn.exec_driver_sql("BEGIN")
                yield conn
            finally:
                conn.rollback()
                conn.exec_driver_sql("PRAGMA query_only = OFF")
