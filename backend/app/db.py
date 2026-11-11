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
    C("encrypted_secrets_json", sa.Text, nullable=True),
    C("sync_watermark", sa.String(120), nullable=True),
    C("last_synced_at", sa.DateTime(timezone=True), nullable=True),
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
    C("source_file_id", sa.String(64), nullable=True),
    C("source_location_json", sa.JSON, nullable=True),
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

# ---------------------------------------------------------------------------
# Multimodal Ingestion, Async Queue, Human-in-the-Loop Validation & Unified Layer
# ---------------------------------------------------------------------------

multimodal_files = sa.Table(
    "multimodal_files", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True),
    C("data_source_id", sa.ForeignKey("data_sources.id"), nullable=False, index=True),
    C("file_name", sa.String(255), nullable=False),
    C("mime_type", sa.String(120), nullable=False),
    C("modality", sa.String(32), nullable=False),
    C("file_format", sa.String(24), nullable=False),
    C("file_size_bytes", sa.BigInteger, nullable=False),
    C("checksum_sha256", sa.String(64), nullable=False, index=True),
    C("storage_key", sa.String(500), nullable=False),
    C("upload_timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("processing_status", sa.String(32), nullable=False, server_default="uploaded"),
    C("extraction_status", sa.String(32), nullable=False, server_default="pending"),
    C("validation_status", sa.String(32), nullable=False, server_default="pending"),
    C("confidence_threshold", sa.Float, nullable=False, server_default="0.8"),
    C("consent_external_ai", sa.Boolean, nullable=False, server_default=sa.false()),
    C("privacy_notice_accepted", sa.Boolean, nullable=False, server_default=sa.false()),
    C("retention_days", sa.Integer, nullable=False, server_default="90"),
    C("expires_at", sa.DateTime(timezone=True), nullable=True),
    C("source_metadata_json", sa.JSON, nullable=False),
    C("extraction_summary_json", sa.JSON, nullable=True),
    C("created_by", sa.String(100), nullable=False),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("imported_at", sa.DateTime(timezone=True), nullable=True),
)
sa.Index("ix_mm_files_company_status", multimodal_files.c.company_id, multimodal_files.c.processing_status)
sa.Index("ix_mm_files_company_modality", multimodal_files.c.company_id, multimodal_files.c.modality)

ingestion_jobs = sa.Table(
    "ingestion_jobs", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True),
    C("file_id", sa.ForeignKey("multimodal_files.id", ondelete="CASCADE"), nullable=True, index=True),
    C("data_source_id", sa.ForeignKey("data_sources.id"), nullable=True),
    C("job_type", sa.String(40), nullable=False),
    C("idempotency_key", sa.String(128), nullable=True, index=True),
    C("status", sa.String(32), nullable=False, server_default="queued"),
    C("stage", sa.String(32), nullable=False, server_default="uploaded"),
    C("progress_pct", sa.Integer, nullable=False, server_default="0"),
    C("attempt", sa.Integer, nullable=False, server_default="0"),
    C("max_attempts", sa.Integer, nullable=False, server_default="3"),
    C("timeout_seconds", sa.Integer, nullable=False, server_default="120"),
    C("params_json", sa.JSON, nullable=False),
    C("result_summary_json", sa.JSON, nullable=True),
    C("error_message", sa.Text, nullable=True),
    C("created_by", sa.String(100), nullable=False),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("started_at", sa.DateTime(timezone=True), nullable=True),
    C("finished_at", sa.DateTime(timezone=True), nullable=True),
)

extracted_records = sa.Table(
    "extracted_records", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True),
    C("file_id", sa.ForeignKey("multimodal_files.id", ondelete="CASCADE"), nullable=False, index=True),
    C("source_id", sa.String(64), nullable=False),
    C("modality", sa.String(32), nullable=False),
    C("entity_type", sa.String(40), nullable=False),
    C("extraction_timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("source_location_json", sa.JSON, nullable=False),
    C("raw_payload_json", sa.JSON, nullable=False),
    C("extracted_json", sa.JSON, nullable=False),
    C("corrected_json", sa.JSON, nullable=True),
    C("confidence_score", sa.Float, nullable=True),
    C("extraction_method", sa.String(80), nullable=False),
    C("validation_status", sa.String(32), nullable=False, server_default="unverified"),
    C("needs_human_review", sa.Boolean, nullable=False, server_default=sa.true()),
    C("reviewed_by", sa.String(100), nullable=True),
    C("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    C("transformation_history_json", sa.JSON, nullable=False),
    C("promoted", sa.Boolean, nullable=False, server_default=sa.false()),
)
sa.Index("ix_extracted_file_status", extracted_records.c.file_id, extracted_records.c.validation_status)

connector_sync_logs = sa.Table(
    "connector_sync_logs", metadata,
    C("id", sa.Integer, primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("data_source_id", sa.ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=True),
    C("sync_mode", sa.String(32), nullable=False),
    C("status", sa.String(32), nullable=False),
    C("watermark_before", sa.String(120), nullable=True),
    C("watermark_after", sa.String(120), nullable=True),
    C("records_fetched", sa.Integer, nullable=False, server_default="0"),
    C("actor", sa.String(100), nullable=False),
    C("details_json", sa.JSON, nullable=False),
    C("error_message", sa.Text, nullable=True),
    C("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("finished_at", sa.DateTime(timezone=True), nullable=True),
)

tenant_customers = sa.Table(
    "tenant_customers", metadata,
    C("company_id", sa.String(64), primary_key=True),
    C("dataset_id", sa.String(64), primary_key=True),
    C("customer_id", sa.String(120), primary_key=True),
    C("customer_name", sa.String(160), nullable=False),
    C("segment", sa.String(120), nullable=False),
    C("region", sa.String(120), nullable=False),
    C("first_seen_date", sa.Date, nullable=True),
    C("last_seen_date", sa.Date, nullable=True),
    C("total_orders", sa.Integer, nullable=False, server_default="0"),
    C("lifetime_value", sa.Float, nullable=False, server_default="0"),
    C("source_file_id", sa.String(64), nullable=True),
    C("source_location_json", sa.JSON, nullable=True),
)

tenant_orders = sa.Table(
    "tenant_orders", metadata,
    C("company_id", sa.String(64), primary_key=True),
    C("dataset_id", sa.String(64), primary_key=True),
    C("order_id", sa.String(120), primary_key=True),
    C("order_date", sa.Date, nullable=False),
    C("customer_id", sa.String(120), nullable=False),
    C("region", sa.String(120), nullable=False),
    C("sales_channel", sa.String(120), nullable=False),
    C("total_revenue", sa.Float, nullable=False),
    C("total_cost", sa.Float, nullable=False, server_default="0"),
    C("gross_profit", sa.Float, nullable=True),
    C("item_count", sa.Integer, nullable=False, server_default="1"),
    C("source_file_id", sa.String(64), nullable=True),
    C("extraction_id", sa.String(64), nullable=True),
    C("source_location_json", sa.JSON, nullable=True),
    C("validation_status", sa.String(32), nullable=False, server_default="approved"),
)

tenant_multimodal_insights = sa.Table(
    "tenant_multimodal_insights", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.String(64), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=False, index=True),
    C("source_file_id", sa.String(64), nullable=False, index=True),
    C("extraction_id", sa.String(64), nullable=True),
    C("modality", sa.String(32), nullable=False),
    C("entity_type", sa.String(40), nullable=False),
    C("insight_date", sa.Date, nullable=True),
    C("title", sa.String(200), nullable=False),
    C("summary_text", sa.Text, nullable=False),
    C("metrics_json", sa.JSON, nullable=False),
    C("source_location_json", sa.JSON, nullable=False),
    C("confidence_score", sa.Float, nullable=True),
    C("extraction_method", sa.String(80), nullable=False),
    C("validation_status", sa.String(32), nullable=False, server_default="approved"),
    C("approved_by", sa.String(100), nullable=False),
    C("approved_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)

# ---------------------------------------------------------------------------
# Advanced RAG Knowledge Store, Hybrid Vector/Sparse Chunks & AI Copilot Memory
# ---------------------------------------------------------------------------

rag_documents = sa.Table(
    "rag_documents", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=True, index=True),
    C("source_file_id", sa.String(64), nullable=True, index=True),
    C("source_type", sa.String(40), nullable=False, server_default="rag_upload"),
    C("file_name", sa.String(255), nullable=False),
    C("mime_type", sa.String(120), nullable=True),
    C("document_type", sa.String(40), nullable=False),
    C("domain", sa.String(40), nullable=False, server_default="general"),
    C("language", sa.String(16), nullable=False, server_default="auto"),
    C("checksum_sha256", sa.String(64), nullable=False, index=True),
    C("content_hash", sa.String(64), nullable=False, index=True),
    C("status", sa.String(32), nullable=False, server_default="indexed"),
    C("chunk_count", sa.Integer, nullable=False, server_default="0"),
    C("char_count", sa.Integer, nullable=False, server_default="0"),
    C("access_permissions_json", sa.JSON, nullable=False),
    C("metadata_json", sa.JSON, nullable=False),
    C("created_by", sa.String(100), nullable=False),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_rag_docs_company_dataset", rag_documents.c.company_id, rag_documents.c.dataset_id)
sa.Index("ix_rag_docs_company_domain", rag_documents.c.company_id, rag_documents.c.domain)
sa.Index("ix_rag_docs_company_doctype", rag_documents.c.company_id, rag_documents.c.document_type)

rag_chunks = sa.Table(
    "rag_chunks", metadata,
    C("id", sa.String(64), primary_key=True),
    C("document_id", sa.ForeignKey("rag_documents.id", ondelete="CASCADE"), nullable=False, index=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=True, index=True),
    C("chunk_index", sa.Integer, nullable=False),
    C("content", sa.Text, nullable=False),
    C("content_hash", sa.String(64), nullable=False, index=True),
    C("token_count", sa.Integer, nullable=False, server_default="0"),
    C("source_file", sa.String(255), nullable=False),
    C("page_number", sa.Integer, nullable=True),
    C("section", sa.String(200), nullable=True),
    C("document_type", sa.String(40), nullable=False),
    C("domain", sa.String(40), nullable=False, server_default="general"),
    C("chunking_strategy", sa.String(32), nullable=False, server_default="recursive"),
    C("embedding_provider", sa.String(64), nullable=False),
    C("embedding_dim", sa.Integer, nullable=False),
    C("embedding_json", sa.JSON, nullable=False),
    C("sparse_terms_json", sa.JSON, nullable=False),
    C("access_permissions_json", sa.JSON, nullable=False),
    C("metadata_json", sa.JSON, nullable=False),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_rag_chunks_company_dataset", rag_chunks.c.company_id, rag_chunks.c.dataset_id)
sa.Index("ix_rag_chunks_company_domain", rag_chunks.c.company_id, rag_chunks.c.domain)
sa.Index("ix_rag_chunks_company_doctype", rag_chunks.c.company_id, rag_chunks.c.document_type)

chat_conversations = sa.Table(
    "chat_conversations", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=True, index=True),
    C("title", sa.String(200), nullable=False),
    C("is_pinned", sa.Boolean, nullable=False, server_default=sa.false()),
    C("language", sa.String(16), nullable=False, server_default="auto"),
    C("session_context_json", sa.JSON, nullable=False),
    C("memory_summary", sa.Text, nullable=True),
    C("message_count", sa.Integer, nullable=False, server_default="0"),
    C("created_by", sa.String(100), nullable=False),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_chat_conv_company_updated", chat_conversations.c.company_id, chat_conversations.c.updated_at)

chat_messages = sa.Table(
    "chat_messages", metadata,
    C("id", sa.String(64), primary_key=True),
    C("conversation_id", sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("role", sa.String(24), nullable=False),
    C("content", sa.Text, nullable=False),
    C("intent", sa.String(64), nullable=True),
    C("citations_json", sa.JSON, nullable=True),
    C("structured_sections_json", sa.JSON, nullable=True),
    C("chart_json", sa.JSON, nullable=True),
    C("sql_trace_json", sa.JSON, nullable=True),
    C("tool_trace_json", sa.JSON, nullable=True),
    C("followups_json", sa.JSON, nullable=True),
    C("parent_message_id", sa.String(64), nullable=True),
    C("prompt_tokens", sa.Integer, nullable=True),
    C("completion_tokens", sa.Integer, nullable=True),
    C("latency_ms", sa.Float, nullable=True),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_chat_msgs_conv_created", chat_messages.c.conversation_id, chat_messages.c.created_at)

company_memories = sa.Table(
    "company_memories", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("memory_key", sa.String(120), nullable=False),
    C("memory_type", sa.String(40), nullable=False, server_default="business_context"),
    C("content", sa.Text, nullable=False),
    C("source_conversation_id", sa.String(64), nullable=True),
    C("confidence", sa.Float, nullable=False, server_default="1.0"),
    C("created_by", sa.String(100), nullable=False),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_company_memories_comp_key", company_memories.c.company_id, company_memories.c.memory_key)

# ---------------------------------------------------------------------------
# Enterprise Data Lineage, Traceability, Pipeline Runs & Execution Events
# ---------------------------------------------------------------------------

pipelines = sa.Table(
    "pipelines", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("name", sa.String(160), nullable=False),
    C("pipeline_type", sa.String(48), nullable=False),
    C("description", sa.Text, nullable=True),
    C("status", sa.String(32), nullable=False, server_default="completed"),
    C("owner", sa.String(100), nullable=False, server_default="system"),
    C("metadata_json", sa.JSON, nullable=False),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_pipelines_company_type", pipelines.c.company_id, pipelines.c.pipeline_type)

pipeline_runs = sa.Table(
    "pipeline_runs", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("pipeline_id", sa.ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=True, index=True),
    C("status", sa.String(32), nullable=False, server_default="running"),
    C("trigger_type", sa.String(48), nullable=False, server_default="manual"),
    C("actor", sa.String(100), nullable=False, server_default="system"),
    C("input_refs_json", sa.JSON, nullable=False),
    C("output_refs_json", sa.JSON, nullable=False),
    C("model_version", sa.String(120), nullable=True),
    C("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("completed_at", sa.DateTime(timezone=True), nullable=True),
    C("duration_ms", sa.Float, nullable=True),
    C("error_message", sa.Text, nullable=True),
    C("metadata_json", sa.JSON, nullable=False),
)
sa.Index("ix_pipeline_runs_comp_pipe_started", pipeline_runs.c.company_id, pipeline_runs.c.pipeline_id, pipeline_runs.c.started_at)

lineage_nodes = sa.Table(
    "lineage_nodes", metadata,
    C("id", sa.String(80), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("external_id", sa.String(120), nullable=True, index=True),
    C("pipeline_id", sa.ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True, index=True),
    C("dataset_id", sa.String(64), nullable=True, index=True),
    C("name", sa.String(200), nullable=False),
    C("node_type", sa.String(40), nullable=False),
    C("sub_type", sa.String(48), nullable=False),
    C("status", sa.String(32), nullable=False, server_default="completed"),
    C("owner", sa.String(100), nullable=False, server_default="system"),
    C("layer_order", sa.Integer, nullable=False, server_default="0"),
    C("metadata_json", sa.JSON, nullable=False),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_lineage_nodes_comp_type_status", lineage_nodes.c.company_id, lineage_nodes.c.node_type, lineage_nodes.c.status)

lineage_edges = sa.Table(
    "lineage_edges", metadata,
    C("id", sa.String(80), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("pipeline_id", sa.ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True, index=True),
    C("run_id", sa.ForeignKey("pipeline_runs.id", ondelete="SET NULL"), nullable=True, index=True),
    C("source_node_id", sa.ForeignKey("lineage_nodes.id", ondelete="CASCADE"), nullable=False, index=True),
    C("target_node_id", sa.ForeignKey("lineage_nodes.id", ondelete="CASCADE"), nullable=False, index=True),
    C("relationship_type", sa.String(64), nullable=False),
    C("status", sa.String(32), nullable=False, server_default="completed"),
    C("data_transferred", sa.String(160), nullable=True),
    C("record_count", sa.Integer, nullable=True),
    C("transformation", sa.Text, nullable=True),
    C("metadata_json", sa.JSON, nullable=False),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_lineage_edges_comp_src_tgt", lineage_edges.c.company_id, lineage_edges.c.source_node_id, lineage_edges.c.target_node_id)

pipeline_events = sa.Table(
    "pipeline_events", metadata,
    C("id", sa.String(80), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("pipeline_id", sa.ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False, index=True),
    C("pipeline_run_id", sa.ForeignKey("pipeline_runs.id", ondelete="CASCADE"), nullable=False, index=True),
    C("node_id", sa.ForeignKey("lineage_nodes.id", ondelete="SET NULL"), nullable=True, index=True),
    C("event_type", sa.String(80), nullable=False),
    C("step_order", sa.Integer, nullable=False, server_default="0"),
    C("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("duration_ms", sa.Float, nullable=True),
    C("status", sa.String(32), nullable=False, server_default="completed"),
    C("input_summary", sa.String(255), nullable=True),
    C("output_summary", sa.String(255), nullable=True),
    C("error_message", sa.Text, nullable=True),
    C("metadata_json", sa.JSON, nullable=False),
)
sa.Index("ix_pipeline_events_run_ts", pipeline_events.c.pipeline_run_id, pipeline_events.c.step_order, pipeline_events.c.timestamp)

business_insights = sa.Table(
    "business_insights", metadata,
    C("id", sa.String(80), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=True, index=True),
    C("pipeline_run_id", sa.ForeignKey("pipeline_runs.id", ondelete="SET NULL"), nullable=True, index=True),
    C("source_node_id", sa.ForeignKey("lineage_nodes.id", ondelete="SET NULL"), nullable=True, index=True),
    C("insight_type", sa.String(48), nullable=False),
    C("name", sa.String(200), nullable=False),
    C("description", sa.Text, nullable=True),
    C("output_reference", sa.String(200), nullable=False),
    C("owner", sa.String(100), nullable=False, server_default="system"),
    C("metadata_json", sa.JSON, nullable=False),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_business_insights_comp_ds", business_insights.c.company_id, business_insights.c.dataset_id)

# ---------------------------------------------------------------------------
# Interactive 3D Business Scenario Simulator (Enterprise Digital Twin)
# ---------------------------------------------------------------------------

twin_scenarios = sa.Table(
    "twin_scenarios", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=True, index=True),
    C("scenario_type", sa.String(48), nullable=False),
    C("name", sa.String(180), nullable=False),
    C("description", sa.Text, nullable=True),
    C("baseline_reference", sa.String(64), nullable=True),
    C("objective", sa.String(48), nullable=False, server_default="balanced"),
    C("horizon_days", sa.Integer, nullable=False, server_default="30"),
    C("is_baseline", sa.Boolean, nullable=False, server_default=sa.false()),
    C("constraints_json", sa.JSON, nullable=False),
    C("configuration_json", sa.JSON, nullable=False),
    C("data_sources_json", sa.JSON, nullable=False),
    C("models_json", sa.JSON, nullable=False),
    C("created_by", sa.String(100), nullable=False, server_default="system"),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_twin_scenarios_comp_ds", twin_scenarios.c.company_id, twin_scenarios.c.dataset_id)

twin_scenario_variables = sa.Table(
    "twin_scenario_variables", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("scenario_id", sa.ForeignKey("twin_scenarios.id", ondelete="CASCADE"), nullable=False, index=True),
    C("domain", sa.String(40), nullable=False),
    C("variable_name", sa.String(80), nullable=False),
    C("label", sa.String(120), nullable=False),
    C("baseline_value", sa.Float, nullable=True),
    C("scenario_value", sa.Float, nullable=True),
    C("unit", sa.String(32), nullable=False),
    C("min_value", sa.Float, nullable=True),
    C("max_value", sa.Float, nullable=True),
    C("validation_rule", sa.String(200), nullable=False),
    C("source_or_assumption", sa.String(200), nullable=False),
    C("supported", sa.Boolean, nullable=False, server_default=sa.true()),
    C("metadata_json", sa.JSON, nullable=False),
)
sa.Index("ix_twin_vars_scen_domain", twin_scenario_variables.c.scenario_id, twin_scenario_variables.c.domain)

twin_simulation_runs = sa.Table(
    "twin_simulation_runs", metadata,
    C("id", sa.String(64), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("scenario_id", sa.ForeignKey("twin_scenarios.id", ondelete="CASCADE"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=True, index=True),
    C("status", sa.String(32), nullable=False, server_default="preparing"),
    C("legacy_simulation_id", sa.String(64), nullable=True),
    C("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("completed_at", sa.DateTime(timezone=True), nullable=True),
    C("duration_ms", sa.Float, nullable=True),
    C("model_versions_json", sa.JSON, nullable=False),
    C("input_references_json", sa.JSON, nullable=False),
    C("output_references_json", sa.JSON, nullable=False),
    C("data_readiness_json", sa.JSON, nullable=False),
    C("warnings_json", sa.JSON, nullable=False),
    C("assumptions_json", sa.JSON, nullable=False),
    C("recommendation_json", sa.JSON, nullable=True),
    C("error_details", sa.Text, nullable=True),
    C("created_by", sa.String(100), nullable=False, server_default="system"),
)
sa.Index("ix_twin_runs_comp_scen", twin_simulation_runs.c.company_id, twin_simulation_runs.c.scenario_id, twin_simulation_runs.c.started_at)

twin_simulation_events = sa.Table(
    "twin_simulation_events", metadata,
    C("id", sa.String(80), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("simulation_run_id", sa.ForeignKey("twin_simulation_runs.id", ondelete="CASCADE"), nullable=False, index=True),
    C("step_order", sa.Integer, nullable=False, server_default="0"),
    C("event_type", sa.String(80), nullable=False),
    C("zone_id", sa.String(48), nullable=True),
    C("node_id", sa.String(64), nullable=True),
    C("source_node_id", sa.String(64), nullable=True),
    C("target_node_id", sa.String(64), nullable=True),
    C("edge_id", sa.String(80), nullable=True),
    C("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("duration_ms", sa.Float, nullable=True),
    C("status", sa.String(32), nullable=False),
    C("record_count", sa.Integer, nullable=True),
    C("metadata_json", sa.JSON, nullable=False),
)
sa.Index("ix_twin_events_run_step", twin_simulation_events.c.simulation_run_id, twin_simulation_events.c.step_order)

twin_simulation_results = sa.Table(
    "twin_simulation_results", metadata,
    C("id", sa.String(80), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("simulation_run_id", sa.ForeignKey("twin_simulation_runs.id", ondelete="CASCADE"), nullable=False, index=True),
    C("metric_name", sa.String(80), nullable=False),
    C("domain", sa.String(40), nullable=False),
    C("label", sa.String(120), nullable=False),
    C("baseline_value", sa.Float, nullable=True),
    C("scenario_value", sa.Float, nullable=True),
    C("abs_difference", sa.Float, nullable=True),
    C("pct_difference", sa.Float, nullable=True),
    C("unit", sa.String(32), nullable=False),
    C("uncertainty_metadata_json", sa.JSON, nullable=False),
    C("evidence_references_json", sa.JSON, nullable=False),
)
sa.Index("ix_twin_results_run_metric", twin_simulation_results.c.simulation_run_id, twin_simulation_results.c.metric_name)

# ---------------------------------------------------------------------------
# Enterprise Explainable AI (XAI) Recommendations & Tamper-Evident Audit
# ---------------------------------------------------------------------------

xai_recommendations = sa.Table(
    "xai_recommendations", metadata,
    C("id", sa.String(100), primary_key=True),
    C("rec_key", sa.String(100), nullable=False, index=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=False, index=True),
    C("title", sa.String(220), nullable=False),
    C("category_code", sa.String(48), nullable=False, index=True),
    C("category_label", sa.String(100), nullable=False),
    C("priority", sa.String(24), nullable=False, index=True),
    C("status", sa.String(32), nullable=False, server_default="pending", index=True),
    C("problem_statement", sa.Text, nullable=False),
    C("recommended_action", sa.Text, nullable=False),
    C("goal", sa.Text, nullable=False),
    C("creator", sa.String(120), nullable=False),
    C("owner", sa.String(120), nullable=True),
    C("deadline", sa.Date, nullable=True),
    C("resources_needed", sa.Text, nullable=True),
    C("tracking_kpi", sa.String(120), nullable=True),
    C("success_criteria", sa.Text, nullable=True),
    C("stop_criteria", sa.Text, nullable=True),
    C("confidence_level", sa.String(32), nullable=False, index=True),
    C("confidence_score", sa.Float, nullable=True),
    C("confidence_components_json", sa.JSON, nullable=False),
    C("why_json", sa.JSON, nullable=False),
    C("model_performance_json", sa.JSON, nullable=False),
    C("xai_json", sa.JSON, nullable=False),
    C("evidence_json", sa.JSON, nullable=False),
    C("expected_impact_json", sa.JSON, nullable=False),
    C("alternatives_json", sa.JSON, nullable=False),
    C("action_plan_json", sa.JSON, nullable=False),
    C("assumptions_json", sa.JSON, nullable=False),
    C("risks_json", sa.JSON, nullable=False),
    C("data_scope_json", sa.JSON, nullable=False),
    C("legacy_payload_json", sa.JSON, nullable=False),
    C("simulation_id", sa.String(64), nullable=True),
    C("lineage_node_id", sa.String(80), nullable=True),
    C("score", sa.Integer, nullable=False, server_default="50"),
    C("is_new", sa.Boolean, nullable=False, server_default=sa.true()),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("expires_at", sa.DateTime(timezone=True), nullable=True),
)
sa.Index("ix_xai_recs_comp_ds_key", xai_recommendations.c.company_id, xai_recommendations.c.dataset_id, xai_recommendations.c.rec_key, unique=True)
sa.Index("ix_xai_recs_comp_status", xai_recommendations.c.company_id, xai_recommendations.c.status)

recommendation_actions = sa.Table(
    "recommendation_actions", metadata,
    C("id", sa.Integer, primary_key=True),
    C("recommendation_id", sa.ForeignKey("xai_recommendations.id", ondelete="CASCADE"), nullable=False, index=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=False, index=True),
    C("action_type", sa.String(40), nullable=False),
    C("previous_status", sa.String(32), nullable=True),
    C("new_status", sa.String(32), nullable=True),
    C("actor", sa.String(100), nullable=False),
    C("actor_role", sa.String(32), nullable=False, server_default="analyst"),
    C("comment", sa.Text, nullable=True),
    C("details_json", sa.JSON, nullable=False),
    C("audit_event_id", sa.Integer, nullable=True, index=True),
    C("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_rec_actions_rec_time", recommendation_actions.c.recommendation_id, recommendation_actions.c.occurred_at)

recommendation_outcomes = sa.Table(
    "recommendation_outcomes", metadata,
    C("id", sa.String(80), primary_key=True),
    C("recommendation_id", sa.ForeignKey("xai_recommendations.id", ondelete="CASCADE"), nullable=False, index=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=False, index=True),
    C("evaluation_status", sa.String(32), nullable=False, server_default="not_evaluated"),
    C("kpi_name", sa.String(120), nullable=False),
    C("baseline_value", sa.Float, nullable=True),
    C("target_value", sa.Float, nullable=True),
    C("observed_value", sa.Float, nullable=True),
    C("observed_delta_pct", sa.Float, nullable=True),
    C("observation_window_days", sa.Integer, nullable=True),
    C("methodology", sa.Text, nullable=False),
    C("notes", sa.Text, nullable=True),
    C("evidence_json", sa.JSON, nullable=False),
    C("evaluated_by", sa.String(100), nullable=False),
    C("evaluated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_rec_outcomes_comp_status", recommendation_outcomes.c.company_id, recommendation_outcomes.c.evaluation_status)

model_evaluations = sa.Table(
    "model_evaluations", metadata,
    C("id", sa.String(80), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=False, index=True),
    C("model_name", sa.String(120), nullable=False),
    C("model_version", sa.String(80), nullable=False),
    C("task_type", sa.String(48), nullable=False),
    C("training_dataset_ref", sa.String(160), nullable=False),
    C("eval_dataset_ref", sa.String(160), nullable=False),
    C("train_date_start", sa.Date, nullable=True),
    C("train_date_end", sa.Date, nullable=True),
    C("metrics_json", sa.JSON, nullable=False),
    C("baseline_comparison_json", sa.JSON, nullable=False),
    C("feature_schema_json", sa.JSON, nullable=False),
    C("drift_status_json", sa.JSON, nullable=False),
    C("owner", sa.String(100), nullable=False, server_default="ai-pipeline"),
    C("status", sa.String(32), nullable=False, server_default="evaluated"),
    C("evaluated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)
sa.Index("ix_model_evals_comp_ds_time", model_evaluations.c.company_id, model_evaluations.c.dataset_id, model_evaluations.c.evaluated_at)

audit_hash_chain = sa.Table(
    "audit_hash_chain", metadata,
    C("seq_no", sa.Integer, primary_key=True),
    C("audit_event_id", sa.ForeignKey("audit_events.id"), nullable=False, unique=True),
    C("company_id", sa.String(64), nullable=False, index=True),
    C("prev_hash", sa.String(64), nullable=False),
    C("payload_sha256", sa.String(64), nullable=False),
    C("entry_hash", sa.String(64), nullable=False, unique=True),
    C("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
)

audit_risk_alerts = sa.Table(
    "audit_risk_alerts", metadata,
    C("id", sa.String(100), primary_key=True),
    C("company_id", sa.ForeignKey("companies.id"), nullable=False, index=True),
    C("dataset_id", sa.String(64), nullable=True, index=True),
    C("risk_key", sa.String(120), nullable=False, index=True),
    C("severity", sa.String(24), nullable=False, index=True),
    C("category", sa.String(48), nullable=False),
    C("title", sa.String(200), nullable=False),
    C("description", sa.Text, nullable=False),
    C("evidence_json", sa.JSON, nullable=False),
    C("affected_entity_id", sa.String(120), nullable=True),
    C("affected_entity_type", sa.String(48), nullable=True),
    C("remediation", sa.Text, nullable=False),
    C("status", sa.String(32), nullable=False, server_default="open", index=True),
    C("resolved_by", sa.String(100), nullable=True),
    C("resolution_note", sa.Text, nullable=True),
    C("detected_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    C("resolved_at", sa.DateTime(timezone=True), nullable=True),
)
sa.Index("ix_audit_risks_comp_status", audit_risk_alerts.c.company_id, audit_risk_alerts.c.status)


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
