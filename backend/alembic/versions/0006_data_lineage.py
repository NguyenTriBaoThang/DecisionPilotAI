"""Add Enterprise Data Lineage Infrastructure (pipelines, pipeline_runs, lineage_nodes, lineage_edges, pipeline_events, business_insights)."""
from alembic import op
import sqlalchemy as sa


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "pipelines",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("pipeline_type", sa.String(length=48), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="completed", nullable=False),
        sa.Column("owner", sa.String(length=100), server_default="system", nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_pipelines_company_id")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pipelines")),
    )
    op.create_index(op.f("ix_pipelines_company_id"), "pipelines", ["company_id"])
    op.create_index("ix_pipelines_company_type", "pipelines", ["company_id", "pipeline_type"])

    op.create_table(
        "pipeline_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("pipeline_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="running", nullable=False),
        sa.Column("trigger_type", sa.String(length=48), server_default="manual", nullable=False),
        sa.Column("actor", sa.String(length=100), server_default="system", nullable=False),
        sa.Column("input_refs_json", sa.JSON(), nullable=False),
        sa.Column("output_refs_json", sa.JSON(), nullable=False),
        sa.Column("model_version", sa.String(length=120), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_pipeline_runs_company_id")),
        sa.ForeignKeyConstraint(["pipeline_id"], ["pipelines.id"], name=op.f("fk_pipeline_runs_pipeline_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pipeline_runs")),
    )
    op.create_index(op.f("ix_pipeline_runs_company_id"), "pipeline_runs", ["company_id"])
    op.create_index(op.f("ix_pipeline_runs_dataset_id"), "pipeline_runs", ["dataset_id"])
    op.create_index(op.f("ix_pipeline_runs_pipeline_id"), "pipeline_runs", ["pipeline_id"])
    op.create_index("ix_pipeline_runs_comp_pipe_started", "pipeline_runs", ["company_id", "pipeline_id", "started_at"])

    op.create_table(
        "lineage_nodes",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("external_id", sa.String(length=120), nullable=True),
        sa.Column("pipeline_id", sa.String(length=64), nullable=True),
        sa.Column("dataset_id", sa.String(length=64), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("node_type", sa.String(length=40), nullable=False),
        sa.Column("sub_type", sa.String(length=48), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="completed", nullable=False),
        sa.Column("owner", sa.String(length=100), server_default="system", nullable=False),
        sa.Column("layer_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_lineage_nodes_company_id")),
        sa.ForeignKeyConstraint(["pipeline_id"], ["pipelines.id"], name=op.f("fk_lineage_nodes_pipeline_id"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lineage_nodes")),
    )
    op.create_index(op.f("ix_lineage_nodes_company_id"), "lineage_nodes", ["company_id"])
    op.create_index(op.f("ix_lineage_nodes_dataset_id"), "lineage_nodes", ["dataset_id"])
    op.create_index(op.f("ix_lineage_nodes_external_id"), "lineage_nodes", ["external_id"])
    op.create_index(op.f("ix_lineage_nodes_pipeline_id"), "lineage_nodes", ["pipeline_id"])
    op.create_index("ix_lineage_nodes_comp_type_status", "lineage_nodes", ["company_id", "node_type", "status"])

    op.create_table(
        "lineage_edges",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("pipeline_id", sa.String(length=64), nullable=True),
        sa.Column("run_id", sa.String(length=64), nullable=True),
        sa.Column("source_node_id", sa.String(length=80), nullable=False),
        sa.Column("target_node_id", sa.String(length=80), nullable=False),
        sa.Column("relationship_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="completed", nullable=False),
        sa.Column("data_transferred", sa.String(length=160), nullable=True),
        sa.Column("record_count", sa.Integer(), nullable=True),
        sa.Column("transformation", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_lineage_edges_company_id")),
        sa.ForeignKeyConstraint(["pipeline_id"], ["pipelines.id"], name=op.f("fk_lineage_edges_pipeline_id"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["run_id"], ["pipeline_runs.id"], name=op.f("fk_lineage_edges_run_id"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_node_id"], ["lineage_nodes.id"], name=op.f("fk_lineage_edges_source_node_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_node_id"], ["lineage_nodes.id"], name=op.f("fk_lineage_edges_target_node_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lineage_edges")),
    )
    op.create_index(op.f("ix_lineage_edges_company_id"), "lineage_edges", ["company_id"])
    op.create_index(op.f("ix_lineage_edges_pipeline_id"), "lineage_edges", ["pipeline_id"])
    op.create_index(op.f("ix_lineage_edges_run_id"), "lineage_edges", ["run_id"])
    op.create_index(op.f("ix_lineage_edges_source_node_id"), "lineage_edges", ["source_node_id"])
    op.create_index(op.f("ix_lineage_edges_target_node_id"), "lineage_edges", ["target_node_id"])
    op.create_index("ix_lineage_edges_comp_src_tgt", "lineage_edges", ["company_id", "source_node_id", "target_node_id"])

    op.create_table(
        "pipeline_events",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("pipeline_id", sa.String(length=64), nullable=False),
        sa.Column("pipeline_run_id", sa.String(length=64), nullable=False),
        sa.Column("node_id", sa.String(length=80), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("step_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="completed", nullable=False),
        sa.Column("input_summary", sa.String(length=255), nullable=True),
        sa.Column("output_summary", sa.String(length=255), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_pipeline_events_company_id")),
        sa.ForeignKeyConstraint(["node_id"], ["lineage_nodes.id"], name=op.f("fk_pipeline_events_node_id"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pipeline_id"], ["pipelines.id"], name=op.f("fk_pipeline_events_pipeline_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pipeline_run_id"], ["pipeline_runs.id"], name=op.f("fk_pipeline_events_pipeline_run_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pipeline_events")),
    )
    op.create_index(op.f("ix_pipeline_events_company_id"), "pipeline_events", ["company_id"])
    op.create_index(op.f("ix_pipeline_events_node_id"), "pipeline_events", ["node_id"])
    op.create_index(op.f("ix_pipeline_events_pipeline_id"), "pipeline_events", ["pipeline_id"])
    op.create_index(op.f("ix_pipeline_events_pipeline_run_id"), "pipeline_events", ["pipeline_run_id"])
    op.create_index("ix_pipeline_events_run_ts", "pipeline_events", ["pipeline_run_id", "step_order", "timestamp"])

    op.create_table(
        "business_insights",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=True),
        sa.Column("pipeline_run_id", sa.String(length=64), nullable=True),
        sa.Column("source_node_id", sa.String(length=80), nullable=True),
        sa.Column("insight_type", sa.String(length=48), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("output_reference", sa.String(length=200), nullable=False),
        sa.Column("owner", sa.String(length=100), server_default="system", nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_business_insights_company_id")),
        sa.ForeignKeyConstraint(["pipeline_run_id"], ["pipeline_runs.id"], name=op.f("fk_business_insights_pipeline_run_id"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_node_id"], ["lineage_nodes.id"], name=op.f("fk_business_insights_source_node_id"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_insights")),
    )
    op.create_index(op.f("ix_business_insights_company_id"), "business_insights", ["company_id"])
    op.create_index(op.f("ix_business_insights_dataset_id"), "business_insights", ["dataset_id"])
    op.create_index(op.f("ix_business_insights_pipeline_run_id"), "business_insights", ["pipeline_run_id"])
    op.create_index(op.f("ix_business_insights_source_node_id"), "business_insights", ["source_node_id"])
    op.create_index("ix_business_insights_comp_ds", "business_insights", ["company_id", "dataset_id"])


def downgrade():
    op.drop_index("ix_business_insights_comp_ds", table_name="business_insights")
    op.drop_index(op.f("ix_business_insights_source_node_id"), table_name="business_insights")
    op.drop_index(op.f("ix_business_insights_pipeline_run_id"), table_name="business_insights")
    op.drop_index(op.f("ix_business_insights_dataset_id"), table_name="business_insights")
    op.drop_index(op.f("ix_business_insights_company_id"), table_name="business_insights")
    op.drop_table("business_insights")

    op.drop_index("ix_pipeline_events_run_ts", table_name="pipeline_events")
    op.drop_index(op.f("ix_pipeline_events_pipeline_run_id"), table_name="pipeline_events")
    op.drop_index(op.f("ix_pipeline_events_pipeline_id"), table_name="pipeline_events")
    op.drop_index(op.f("ix_pipeline_events_node_id"), table_name="pipeline_events")
    op.drop_index(op.f("ix_pipeline_events_company_id"), table_name="pipeline_events")
    op.drop_table("pipeline_events")

    op.drop_index("ix_lineage_edges_comp_src_tgt", table_name="lineage_edges")
    op.drop_index(op.f("ix_lineage_edges_target_node_id"), table_name="lineage_edges")
    op.drop_index(op.f("ix_lineage_edges_source_node_id"), table_name="lineage_edges")
    op.drop_index(op.f("ix_lineage_edges_run_id"), table_name="lineage_edges")
    op.drop_index(op.f("ix_lineage_edges_pipeline_id"), table_name="lineage_edges")
    op.drop_index(op.f("ix_lineage_edges_company_id"), table_name="lineage_edges")
    op.drop_table("lineage_edges")

    op.drop_index("ix_lineage_nodes_comp_type_status", table_name="lineage_nodes")
    op.drop_index(op.f("ix_lineage_nodes_pipeline_id"), table_name="lineage_nodes")
    op.drop_index(op.f("ix_lineage_nodes_external_id"), table_name="lineage_nodes")
    op.drop_index(op.f("ix_lineage_nodes_dataset_id"), table_name="lineage_nodes")
    op.drop_index(op.f("ix_lineage_nodes_company_id"), table_name="lineage_nodes")
    op.drop_table("lineage_nodes")

    op.drop_index("ix_pipeline_runs_comp_pipe_started", table_name="pipeline_runs")
    op.drop_index(op.f("ix_pipeline_runs_pipeline_id"), table_name="pipeline_runs")
    op.drop_index(op.f("ix_pipeline_runs_dataset_id"), table_name="pipeline_runs")
    op.drop_index(op.f("ix_pipeline_runs_company_id"), table_name="pipeline_runs")
    op.drop_table("pipeline_runs")

    op.drop_index("ix_pipelines_company_type", table_name="pipelines")
    op.drop_index(op.f("ix_pipelines_company_id"), table_name="pipelines")
    op.drop_table("pipelines")

