"""Add multimodal ingestion files, async processing jobs, human-in-the-loop extracted records, encrypted connector secrets, sync logs, and unified business entity tables."""
from alembic import op
import sqlalchemy as sa


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("data_sources", sa.Column("encrypted_secrets_json", sa.Text(), nullable=True))
    op.add_column("data_sources", sa.Column("sync_watermark", sa.String(length=120), nullable=True))
    op.add_column("data_sources", sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("tenant_transactions", sa.Column("source_file_id", sa.String(length=64), nullable=True))
    op.add_column("tenant_transactions", sa.Column("source_location_json", sa.JSON(), nullable=True))

    op.create_table(
        "multimodal_files",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("data_source_id", sa.String(length=64), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("modality", sa.String(length=32), nullable=False),
        sa.Column("file_format", sa.String(length=24), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("upload_timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("processing_status", sa.String(length=32), server_default="uploaded", nullable=False),
        sa.Column("extraction_status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("validation_status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("confidence_threshold", sa.Float(), server_default="0.8", nullable=False),
        sa.Column("consent_external_ai", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("privacy_notice_accepted", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("retention_days", sa.Integer(), server_default="90", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_metadata_json", sa.JSON(), nullable=False),
        sa.Column("extraction_summary_json", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.String(length=100), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_multimodal_files_company_id")),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"], name=op.f("fk_multimodal_files_data_source_id")),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], name=op.f("fk_multimodal_files_dataset_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_multimodal_files")),
    )
    op.create_index(op.f("ix_multimodal_files_checksum_sha256"), "multimodal_files", ["checksum_sha256"])
    op.create_index(op.f("ix_multimodal_files_company_id"), "multimodal_files", ["company_id"])
    op.create_index(op.f("ix_multimodal_files_data_source_id"), "multimodal_files", ["data_source_id"])
    op.create_index(op.f("ix_multimodal_files_dataset_id"), "multimodal_files", ["dataset_id"])
    op.create_index("ix_mm_files_company_modality", "multimodal_files", ["company_id", "modality"])
    op.create_index("ix_mm_files_company_status", "multimodal_files", ["company_id", "processing_status"])

    op.create_table(
        "ingestion_jobs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("file_id", sa.String(length=64), nullable=True),
        sa.Column("data_source_id", sa.String(length=64), nullable=True),
        sa.Column("job_type", sa.String(length=40), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="queued", nullable=False),
        sa.Column("stage", sa.String(length=32), server_default="uploaded", nullable=False),
        sa.Column("progress_pct", sa.Integer(), server_default="0", nullable=False),
        sa.Column("attempt", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default="3", nullable=False),
        sa.Column("timeout_seconds", sa.Integer(), server_default="120", nullable=False),
        sa.Column("params_json", sa.JSON(), nullable=False),
        sa.Column("result_summary_json", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_ingestion_jobs_company_id")),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"], name=op.f("fk_ingestion_jobs_data_source_id")),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], name=op.f("fk_ingestion_jobs_dataset_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["file_id"], ["multimodal_files.id"], name=op.f("fk_ingestion_jobs_file_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ingestion_jobs")),
    )
    op.create_index(op.f("ix_ingestion_jobs_company_id"), "ingestion_jobs", ["company_id"])
    op.create_index(op.f("ix_ingestion_jobs_dataset_id"), "ingestion_jobs", ["dataset_id"])
    op.create_index(op.f("ix_ingestion_jobs_file_id"), "ingestion_jobs", ["file_id"])
    op.create_index(op.f("ix_ingestion_jobs_idempotency_key"), "ingestion_jobs", ["idempotency_key"])

    op.create_table(
        "extracted_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("file_id", sa.String(length=64), nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=False),
        sa.Column("modality", sa.String(length=32), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("extraction_timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("source_location_json", sa.JSON(), nullable=False),
        sa.Column("raw_payload_json", sa.JSON(), nullable=False),
        sa.Column("extracted_json", sa.JSON(), nullable=False),
        sa.Column("corrected_json", sa.JSON(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("extraction_method", sa.String(length=80), nullable=False),
        sa.Column("validation_status", sa.String(length=32), server_default="unverified", nullable=False),
        sa.Column("needs_human_review", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("reviewed_by", sa.String(length=100), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("transformation_history_json", sa.JSON(), nullable=False),
        sa.Column("promoted", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_extracted_records_company_id")),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], name=op.f("fk_extracted_records_dataset_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["file_id"], ["multimodal_files.id"], name=op.f("fk_extracted_records_file_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_extracted_records")),
    )
    op.create_index(op.f("ix_extracted_records_company_id"), "extracted_records", ["company_id"])
    op.create_index(op.f("ix_extracted_records_dataset_id"), "extracted_records", ["dataset_id"])
    op.create_index(op.f("ix_extracted_records_file_id"), "extracted_records", ["file_id"])
    op.create_index("ix_extracted_file_status", "extracted_records", ["file_id", "validation_status"])

    op.create_table(
        "connector_sync_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("data_source_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=True),
        sa.Column("sync_mode", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("watermark_before", sa.String(length=120), nullable=True),
        sa.Column("watermark_after", sa.String(length=120), nullable=True),
        sa.Column("records_fetched", sa.Integer(), server_default="0", nullable=False),
        sa.Column("actor", sa.String(length=100), nullable=False),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_connector_sync_logs_company_id")),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"], name=op.f("fk_connector_sync_logs_data_source_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_connector_sync_logs")),
    )
    op.create_index(op.f("ix_connector_sync_logs_company_id"), "connector_sync_logs", ["company_id"])
    op.create_index(op.f("ix_connector_sync_logs_data_source_id"), "connector_sync_logs", ["data_source_id"])

    op.create_table(
        "tenant_customers",
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("customer_id", sa.String(length=120), nullable=False),
        sa.Column("customer_name", sa.String(length=160), nullable=False),
        sa.Column("segment", sa.String(length=120), nullable=False),
        sa.Column("region", sa.String(length=120), nullable=False),
        sa.Column("first_seen_date", sa.Date(), nullable=True),
        sa.Column("last_seen_date", sa.Date(), nullable=True),
        sa.Column("total_orders", sa.Integer(), server_default="0", nullable=False),
        sa.Column("lifetime_value", sa.Float(), server_default="0", nullable=False),
        sa.Column("source_file_id", sa.String(length=64), nullable=True),
        sa.Column("source_location_json", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("company_id", "dataset_id", "customer_id", name=op.f("pk_tenant_customers")),
    )

    op.create_table(
        "tenant_orders",
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("order_id", sa.String(length=120), nullable=False),
        sa.Column("order_date", sa.Date(), nullable=False),
        sa.Column("customer_id", sa.String(length=120), nullable=False),
        sa.Column("region", sa.String(length=120), nullable=False),
        sa.Column("sales_channel", sa.String(length=120), nullable=False),
        sa.Column("total_revenue", sa.Float(), nullable=False),
        sa.Column("total_cost", sa.Float(), server_default="0", nullable=False),
        sa.Column("gross_profit", sa.Float(), nullable=True),
        sa.Column("item_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("source_file_id", sa.String(length=64), nullable=True),
        sa.Column("extraction_id", sa.String(length=64), nullable=True),
        sa.Column("source_location_json", sa.JSON(), nullable=True),
        sa.Column("validation_status", sa.String(length=32), server_default="approved", nullable=False),
        sa.PrimaryKeyConstraint("company_id", "dataset_id", "order_id", name=op.f("pk_tenant_orders")),
    )

    op.create_table(
        "tenant_multimodal_insights",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("source_file_id", sa.String(length=64), nullable=False),
        sa.Column("extraction_id", sa.String(length=64), nullable=True),
        sa.Column("modality", sa.String(length=32), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("insight_date", sa.Date(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary_text", sa.Text(), nullable=False),
        sa.Column("metrics_json", sa.JSON(), nullable=False),
        sa.Column("source_location_json", sa.JSON(), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("extraction_method", sa.String(length=80), nullable=False),
        sa.Column("validation_status", sa.String(length=32), server_default="approved", nullable=False),
        sa.Column("approved_by", sa.String(length=100), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tenant_multimodal_insights")),
    )
    op.create_index(op.f("ix_tenant_multimodal_insights_company_id"), "tenant_multimodal_insights", ["company_id"])
    op.create_index(op.f("ix_tenant_multimodal_insights_dataset_id"), "tenant_multimodal_insights", ["dataset_id"])
    op.create_index(op.f("ix_tenant_multimodal_insights_source_file_id"), "tenant_multimodal_insights", ["source_file_id"])


def downgrade():
    op.drop_index(op.f("ix_tenant_multimodal_insights_source_file_id"), table_name="tenant_multimodal_insights")
    op.drop_index(op.f("ix_tenant_multimodal_insights_dataset_id"), table_name="tenant_multimodal_insights")
    op.drop_index(op.f("ix_tenant_multimodal_insights_company_id"), table_name="tenant_multimodal_insights")
    op.drop_table("tenant_multimodal_insights")
    op.drop_table("tenant_orders")
    op.drop_table("tenant_customers")
    op.drop_index(op.f("ix_connector_sync_logs_data_source_id"), table_name="connector_sync_logs")
    op.drop_index(op.f("ix_connector_sync_logs_company_id"), table_name="connector_sync_logs")
    op.drop_table("connector_sync_logs")
    op.drop_index("ix_extracted_file_status", table_name="extracted_records")
    op.drop_index(op.f("ix_extracted_records_file_id"), table_name="extracted_records")
    op.drop_index(op.f("ix_extracted_records_dataset_id"), table_name="extracted_records")
    op.drop_index(op.f("ix_extracted_records_company_id"), table_name="extracted_records")
    op.drop_table("extracted_records")
    op.drop_index(op.f("ix_ingestion_jobs_idempotency_key"), table_name="ingestion_jobs")
    op.drop_index(op.f("ix_ingestion_jobs_file_id"), table_name="ingestion_jobs")
    op.drop_index(op.f("ix_ingestion_jobs_dataset_id"), table_name="ingestion_jobs")
    op.drop_index(op.f("ix_ingestion_jobs_company_id"), table_name="ingestion_jobs")
    op.drop_table("ingestion_jobs")
    op.drop_index("ix_mm_files_company_status", table_name="multimodal_files")
    op.drop_index("ix_mm_files_company_modality", table_name="multimodal_files")
    op.drop_index(op.f("ix_multimodal_files_dataset_id"), table_name="multimodal_files")
    op.drop_index(op.f("ix_multimodal_files_data_source_id"), table_name="multimodal_files")
    op.drop_index(op.f("ix_multimodal_files_company_id"), table_name="multimodal_files")
    op.drop_index(op.f("ix_multimodal_files_checksum_sha256"), table_name="multimodal_files")
    op.drop_table("multimodal_files")
    op.drop_column("tenant_transactions", "source_location_json")
    op.drop_column("tenant_transactions", "source_file_id")
    op.drop_column("data_sources", "last_synced_at")
    op.drop_column("data_sources", "sync_watermark")
    op.drop_column("data_sources", "encrypted_secrets_json")

