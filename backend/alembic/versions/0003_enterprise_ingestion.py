"""Add multi-tenant enterprise data ingestion, quality reporting, templates, and partitioned analytics tables."""
from alembic import op
import sqlalchemy as sa


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("audit_events", sa.Column("company_id", sa.String(length=64), nullable=False, server_default="comp-default"))
    op.create_index("ix_audit_company_id_id", "audit_events", ["company_id", "id"])

    op.add_column("simulation_runs", sa.Column("company_id", sa.String(length=64), nullable=False, server_default="comp-default"))
    op.create_index("ix_simulation_runs_company_dataset", "simulation_runs", ["company_id", "dataset_id"])

    op.create_table(
        "companies",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("active_dataset_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_companies")),
        sa.UniqueConstraint("slug", name="uq_companies_slug"),
    )

    op.create_table(
        "data_sources",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("source_type", sa.String(length=40), nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_data_sources_company_id")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_data_sources")),
    )
    op.create_index(op.f("ix_data_sources_company_id"), "data_sources", ["company_id"])

    op.create_table(
        "datasets",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("data_source_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="uploaded"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="uploaded"),
        sa.Column("storage_mode", sa.String(length=32), nullable=False, server_default="partitioned"),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("file_format", sa.String(length=24), nullable=True),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=True),
        sa.Column("raw_storage_key", sa.String(length=500), nullable=True),
        sa.Column("cleaned_storage_key", sa.String(length=500), nullable=True),
        sa.Column("selected_sheet", sa.String(length=120), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("valid_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("invalid_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duplicate_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("date_start", sa.Date(), nullable=True),
        sa.Column("date_end", sa.Date(), nullable=True),
        sa.Column("mapping_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("quality_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("mapping_json", sa.JSON(), nullable=True),
        sa.Column("cleaning_policy_json", sa.JSON(), nullable=True),
        sa.Column("capabilities_json", sa.JSON(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_datasets_company_id")),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"], name=op.f("fk_datasets_data_source_id")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_datasets")),
    )
    op.create_index(op.f("ix_datasets_company_id"), "datasets", ["company_id"])
    op.create_index(op.f("ix_datasets_data_source_id"), "datasets", ["data_source_id"])
    op.create_index("ix_datasets_company_status", "datasets", ["company_id", "status"])

    op.create_table(
        "mapping_templates",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("source_signature", sa.String(length=64), nullable=False),
        sa.Column("mappings_json", sa.JSON(), nullable=False),
        sa.Column("custom_fields_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_mapping_templates_company_id")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mapping_templates")),
    )
    op.create_index(op.f("ix_mapping_templates_company_id"), "mapping_templates", ["company_id"])
    op.create_index(op.f("ix_mapping_templates_source_signature"), "mapping_templates", ["source_signature"])

    op.create_table(
        "dataset_quality_reports",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("overall_score", sa.Float(), nullable=False),
        sa.Column("completeness_score", sa.Float(), nullable=False),
        sa.Column("validity_score", sa.Float(), nullable=False),
        sa.Column("consistency_score", sa.Float(), nullable=False),
        sa.Column("uniqueness_score", sa.Float(), nullable=False),
        sa.Column("accuracy_score", sa.Float(), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=False),
        sa.Column("valid_rows", sa.Integer(), nullable=False),
        sa.Column("invalid_rows", sa.Integer(), nullable=False),
        sa.Column("missing_values_count", sa.Integer(), nullable=False),
        sa.Column("duplicate_records_count", sa.Integer(), nullable=False),
        sa.Column("column_metrics_json", sa.JSON(), nullable=False),
        sa.Column("warnings_json", sa.JSON(), nullable=False),
        sa.Column("error_summary_json", sa.JSON(), nullable=False),
        sa.Column("error_report_storage_key", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_dataset_quality_reports_company_id")),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], name=op.f("fk_dataset_quality_reports_dataset_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataset_quality_reports")),
    )
    op.create_index(op.f("ix_dataset_quality_reports_company_id"), "dataset_quality_reports", ["company_id"])
    op.create_index(op.f("ix_dataset_quality_reports_dataset_id"), "dataset_quality_reports", ["dataset_id"])

    op.create_table(
        "import_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("data_source_id", sa.String(length=64), nullable=False),
        sa.Column("stage", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("actor", sa.String(length=100), nullable=False),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_import_logs_company_id")),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"], name=op.f("fk_import_logs_data_source_id")),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], name=op.f("fk_import_logs_dataset_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_import_logs")),
    )
    op.create_index(op.f("ix_import_logs_company_id"), "import_logs", ["company_id"])
    op.create_index(op.f("ix_import_logs_dataset_id"), "import_logs", ["dataset_id"])
    op.create_index("ix_import_logs_company_dataset_id", "import_logs", ["company_id", "dataset_id", "id"])

    op.create_table(
        "tenant_products",
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("product_id", sa.String(length=120), nullable=False),
        sa.Column("product_name", sa.String(length=160), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("brand", sa.String(length=120), nullable=False),
        sa.Column("list_price", sa.Float(), nullable=False),
        sa.Column("unit_cost", sa.Float(), nullable=False),
        sa.Column("supplier", sa.String(length=120), nullable=False),
        sa.Column("is_physical", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("lead_time_days", sa.Integer(), nullable=True),
        sa.Column("reorder_point", sa.Integer(), nullable=True),
        sa.Column("current_stock", sa.Integer(), nullable=True),
        sa.Column("elasticity", sa.Float(), nullable=False, server_default="-1.0"),
        sa.PrimaryKeyConstraint("company_id", "dataset_id", "product_id", name=op.f("pk_tenant_products")),
    )

    op.create_table(
        "tenant_transactions",
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("row_num", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.String(length=64), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("product_id", sa.String(length=120), nullable=False),
        sa.Column("product_name", sa.String(length=160), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("customer_id", sa.String(length=120), nullable=False),
        sa.Column("customer_segment", sa.String(length=120), nullable=False),
        sa.Column("region", sa.String(length=120), nullable=False),
        sa.Column("sales_channel", sa.String(length=120), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Float(), nullable=False),
        sa.Column("discount_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("revenue", sa.Float(), nullable=False),
        sa.Column("unit_cost", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_cost", sa.Float(), nullable=False, server_default="0"),
        sa.Column("gross_profit", sa.Float(), nullable=True),
        sa.Column("marketing_channel", sa.String(length=120), nullable=True),
        sa.Column("marketing_spend", sa.Float(), nullable=True),
        sa.Column("inventory_level", sa.Integer(), nullable=True),
        sa.Column("custom_fields_json", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("company_id", "dataset_id", "row_num", name=op.f("pk_tenant_transactions")),
    )
    op.create_index("ix_tenant_tx_company_dataset_date", "tenant_transactions", ["company_id", "dataset_id", "date"])
    op.create_index("ix_tenant_tx_company_dataset_prod", "tenant_transactions", ["company_id", "dataset_id", "product_id"])

    op.create_table(
        "tenant_marketing_daily",
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("channel", sa.String(length=120), nullable=False),
        sa.Column("spend", sa.Float(), nullable=False),
        sa.Column("attributed_revenue", sa.Float(), nullable=False),
        sa.Column("orders", sa.Integer(), nullable=False),
        sa.Column("leads", sa.Integer(), nullable=False),
        sa.Column("clicks", sa.Integer(), nullable=False),
        sa.Column("impressions", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("company_id", "dataset_id", "date", "channel", name=op.f("pk_tenant_marketing_daily")),
    )

    op.create_table(
        "tenant_inventory_daily",
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("product_id", sa.String(length=120), nullable=False),
        sa.Column("opening_stock", sa.Integer(), nullable=False),
        sa.Column("received_qty", sa.Integer(), nullable=False),
        sa.Column("sold_qty", sa.Integer(), nullable=False),
        sa.Column("closing_stock", sa.Integer(), nullable=False),
        sa.Column("stockout_flag", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("company_id", "dataset_id", "date", "product_id", name=op.f("pk_tenant_inventory_daily")),
    )

    # Seed the default company workspace so legacy single-tenant data continues seamlessly
    op.execute(
        "INSERT INTO companies (id, name, slug, status) "
        "VALUES ('comp-default', 'Default Enterprise Workspace', 'default', 'active')"
    )


def downgrade():
    op.drop_table("tenant_inventory_daily")
    op.drop_table("tenant_marketing_daily")
    op.drop_index("ix_tenant_tx_company_dataset_prod", table_name="tenant_transactions")
    op.drop_index("ix_tenant_tx_company_dataset_date", table_name="tenant_transactions")
    op.drop_table("tenant_transactions")
    op.drop_table("tenant_products")
    op.drop_index("ix_import_logs_company_dataset_id", table_name="import_logs")
    op.drop_index(op.f("ix_import_logs_dataset_id"), table_name="import_logs")
    op.drop_index(op.f("ix_import_logs_company_id"), table_name="import_logs")
    op.drop_table("import_logs")
    op.drop_index(op.f("ix_dataset_quality_reports_dataset_id"), table_name="dataset_quality_reports")
    op.drop_index(op.f("ix_dataset_quality_reports_company_id"), table_name="dataset_quality_reports")
    op.drop_table("dataset_quality_reports")
    op.drop_index(op.f("ix_mapping_templates_source_signature"), table_name="mapping_templates")
    op.drop_index(op.f("ix_mapping_templates_company_id"), table_name="mapping_templates")
    op.drop_table("mapping_templates")
    op.drop_index("ix_datasets_company_status", table_name="datasets")
    op.drop_index(op.f("ix_datasets_data_source_id"), table_name="datasets")
    op.drop_index(op.f("ix_datasets_company_id"), table_name="datasets")
    op.drop_table("datasets")
    op.drop_index(op.f("ix_data_sources_company_id"), table_name="data_sources")
    op.drop_table("data_sources")
    op.drop_table("companies")
    op.drop_index("ix_simulation_runs_company_dataset", table_name="simulation_runs")
    op.drop_column("simulation_runs", "company_id")
    op.drop_index("ix_audit_company_id_id", table_name="audit_events")
    op.drop_column("audit_events", "company_id")

