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
    C("company_id", sa.String(64), nullable=False, server_default="comp-default"),
)
sa.Index("ix_audit_kind_subject_id", audit.c.kind, audit.c.subject, audit.c.id)
sa.Index("ix_audit_company_id_id", audit.c.company_id, audit.c.id)
DATA_TABLES = (calendar, products, customers, marketing, sales, inventory)

simulations = sa.Table(
    "simulation_runs", metadata, C("id", sa.String(64), primary_key=True),
    C("dataset_id", sa.String(24), nullable=False, index=True),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("payload", sa.JSON, nullable=False),
    C("company_id", sa.String(64), nullable=False, server_default="comp-default"),
)
sa.Index("ix_simulation_runs_company_dataset", simulations.c.company_id, simulations.c.dataset_id)

# ---------------------------------------------------------------------------
# Multi-Tenant Enterprise Data Ingestion & Partitioned Analytical Tables
# ---------------------------------------------------------------------------

companies = sa.Table(
    "companies", metadata,
    C("id", sa.String(64), primary_key=True),
    C("name", sa.String(120), nullable=False),
    C("slug", sa.String(80), nullable=False, unique=True),
    C("status", sa.String(32), nullable=False, server_default="active"),
    C("active_dataset_id", sa.String(64), nullable=True),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)

data_sources = sa.Table(
    "data_sources", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("name", sa.String(120), nullable=False),
    C("source_type", sa.String(40), nullable=False),
    C("config_json", sa.JSON, nullable=False),
    C("status", sa.String(32), nullable=False, server_default="active"),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)

enterprise_datasets = sa.Table(
    "datasets", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("data_source_id", sa.ForeignKey("data_sources.id"), nullable=False, index=True),
    C("name", sa.String(160), nullable=False),
    C("kind", sa.String(32), nullable=False, server_default="uploaded"),
    C("status", sa.String(32), nullable=False, server_default="uploaded"),
    C("storage_mode", sa.String(32), nullable=False, server_default="partitioned"),
    C("file_name", sa.String(255), nullable=True),
    C("file_format", sa.String(24), nullable=True),
    C("file_size_bytes", sa.BigInteger, nullable=False, server_default="0"),
    C("checksum_sha256", sa.String(64), nullable=True),
    C("raw_storage_key", sa.String(500), nullable=True),
    C("cleaned_storage_key", sa.String(500), nullable=True),
    C("selected_sheet", sa.String(120), nullable=True),
    C("row_count", sa.Integer, nullable=False, server_default="0"),
    C("valid_rows", sa.Integer, nullable=False, server_default="0"),
    C("invalid_rows", sa.Integer, nullable=False, server_default="0"),
    C("duplicate_rows", sa.Integer, nullable=False, server_default="0"),
    C("date_start", sa.Date, nullable=True),
    C("date_end", sa.Date, nullable=True),
    C("mapping_confirmed", sa.Boolean, nullable=False, server_default=sa.false()),
    C("quality_confirmed", sa.Boolean, nullable=False, server_default=sa.false()),
    C("is_active", sa.Boolean, nullable=False, server_default=sa.false()),
    C("mapping_json", sa.JSON, nullable=True),
    C("cleaning_policy_json", sa.JSON, nullable=True),
    C("capabilities_json", sa.JSON, nullable=True),
    C("metadata_json", sa.JSON, nullable=False),
    C("created_by", sa.String(100), nullable=False),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("imported_at", sa.DateTime(timezone=True), nullable=True),
)
sa.Index("ix_datasets_company_status", enterprise_datasets.c.company_id, enterprise_datasets.c.status)

mapping_templates = sa.Table(
    "mapping_templates", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("name", sa.String(120), nullable=False),
    C("source_signature", sa.String(64), nullable=False, index=True),
    C("mappings_json", sa.JSON, nullable=False),
    C("custom_fields_json", sa.JSON, nullable=False),
    C("created_by", sa.String(100), nullable=False),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)

dataset_quality_reports = sa.Table(
    "dataset_quality_reports", metadata,
    C("id", sa.String(64), primary_key=True),
    C("dataset_id", sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("overall_score", sa.Float, nullable=False),
    C("completeness_score", sa.Float, nullable=False),
    C("validity_score", sa.Float, nullable=False),
    C("consistency_score", sa.Float, nullable=False),
    C("uniqueness_score", sa.Float, nullable=False),
    C("accuracy_score", sa.Float, nullable=False),
    C("total_rows", sa.Integer, nullable=False),
    C("valid_rows", sa.Integer, nullable=False),
    C("invalid_rows", sa.Integer, nullable=False),
    C("missing_values_count", sa.Integer, nullable=False),
    C("duplicate_records_count", sa.Integer, nullable=False),
    C("column_metrics_json", sa.JSON, nullable=False),
    C("warnings_json", sa.JSON, nullable=False),
    C("error_summary_json", sa.JSON, nullable=False),
    C("error_report_storage_key", sa.String(500), nullable=True),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)

import_logs = sa.Table(
    "import_logs", metadata,
    C("id", sa.Integer, primary_key=True),
    C("dataset_id", sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("data_source_id", sa.ForeignKey("data_sources.id"), nullable=False),
    C("stage", sa.String(40), nullable=False),
    C("status", sa.String(32), nullable=False),
    C("actor", sa.String(100), nullable=False),
    C("details_json", sa.JSON, nullable=False),
    C("error_message", sa.Text, nullable=True),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_import_logs_company_dataset_id", import_logs.c.company_id, import_logs.c.dataset_id, import_logs.c.id)

tenant_products = sa.Table(
    "tenant_products", metadata,
    C("company_id", sa.String(64), primary_key=True),
    C("dataset_id", sa.String(64), primary_key=True),
    C("product_id", sa.String(120), primary_key=True),
    C("product_name", sa.String(160), nullable=False),
    C("category", sa.String(120), nullable=False),
    C("brand", sa.String(120), nullable=False),
    C("list_price", sa.Float, nullable=False),
    C("unit_cost", sa.Float, nullable=False),
    C("supplier", sa.String(120), nullable=False),
    C("is_physical", sa.Boolean, nullable=False, server_default=sa.true()),
    C("lead_time_days", sa.Integer, nullable=True),
    C("reorder_point", sa.Integer, nullable=True),
    C("current_stock", sa.Integer, nullable=True),
    C("elasticity", sa.Float, nullable=False, server_default="-1.0"),
)

tenant_transactions = sa.Table(
    "tenant_transactions", metadata,
    C("company_id", sa.String(64), primary_key=True),
    C("dataset_id", sa.String(64), primary_key=True),
    C("row_num", sa.Integer, primary_key=True),
    C("transaction_id", sa.String(64), nullable=False),
    C("date", sa.Date, nullable=False),
    C("product_id", sa.String(120), nullable=False),
    C("product_name", sa.String(160), nullable=False),
    C("category", sa.String(120), nullable=False),
    C("customer_id", sa.String(120), nullable=False),
    C("customer_segment", sa.String(120), nullable=False),
    C("region", sa.String(120), nullable=False),
    C("sales_channel", sa.String(120), nullable=False),
    C("quantity", sa.Integer, nullable=False),
    C("unit_price", sa.Float, nullable=False),
    C("discount_pct", sa.Float, nullable=False, server_default="0"),
    C("revenue", sa.Float, nullable=False),
    C("unit_cost", sa.Float, nullable=False, server_default="0"),
    C("total_cost", sa.Float, nullable=False, server_default="0"),
    C("gross_profit", sa.Float, nullable=True),
    C("marketing_channel", sa.String(120), nullable=True),
    C("marketing_spend", sa.Float, nullable=True),
    C("inventory_level", sa.Integer, nullable=True),
    C("custom_fields_json", sa.JSON, nullable=True),
)
sa.Index("ix_tenant_tx_company_dataset_date", tenant_transactions.c.company_id, tenant_transactions.c.dataset_id, tenant_transactions.c.date)
sa.Index("ix_tenant_tx_company_dataset_prod", tenant_transactions.c.company_id, tenant_transactions.c.dataset_id, tenant_transactions.c.product_id)

tenant_marketing_daily = sa.Table(
    "tenant_marketing_daily", metadata,
    C("company_id", sa.String(64), primary_key=True),
    C("dataset_id", sa.String(64), primary_key=True),
    C("date", sa.Date, primary_key=True),
    C("channel", sa.String(120), primary_key=True),
    C("spend", sa.Float, nullable=False),
    C("attributed_revenue", sa.Float, nullable=False),
    C("orders", sa.Integer, nullable=False),
    C("leads", sa.Integer, nullable=False),
    C("clicks", sa.Integer, nullable=False),
    C("impressions", sa.Integer, nullable=False),
)

tenant_inventory_daily = sa.Table(
    "tenant_inventory_daily", metadata,
    C("company_id", sa.String(64), primary_key=True),
    C("dataset_id", sa.String(64), primary_key=True),
    C("date", sa.Date, primary_key=True),
    C("product_id", sa.String(120), primary_key=True),
    C("opening_stock", sa.Integer, nullable=False),
    C("received_qty", sa.Integer, nullable=False),
    C("sold_qty", sa.Integer, nullable=False),
    C("closing_stock", sa.Integer, nullable=False),
    C("stockout_flag", sa.Boolean, nullable=False),
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
