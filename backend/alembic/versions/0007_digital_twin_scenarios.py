"""Add Interactive 3D Business Scenario Simulator (Enterprise Digital Twin) tables."""
from alembic import op
import sqlalchemy as sa


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "twin_scenarios",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=True),
        sa.Column("scenario_type", sa.String(length=48), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("baseline_reference", sa.String(length=64), nullable=True),
        sa.Column("objective", sa.String(length=48), server_default="balanced", nullable=False),
        sa.Column("horizon_days", sa.Integer(), server_default="30", nullable=False),
        sa.Column("is_baseline", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("constraints_json", sa.JSON(), nullable=False),
        sa.Column("configuration_json", sa.JSON(), nullable=False),
        sa.Column("data_sources_json", sa.JSON(), nullable=False),
        sa.Column("models_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=100), server_default="system", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_twin_scenarios_company_id")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_twin_scenarios")),
    )
    op.create_index(op.f("ix_twin_scenarios_company_id"), "twin_scenarios", ["company_id"])
    op.create_index(op.f("ix_twin_scenarios_dataset_id"), "twin_scenarios", ["dataset_id"])
    op.create_index("ix_twin_scenarios_comp_ds", "twin_scenarios", ["company_id", "dataset_id"])

    op.create_table(
        "twin_scenario_variables",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("scenario_id", sa.String(length=64), nullable=False),
        sa.Column("domain", sa.String(length=40), nullable=False),
        sa.Column("variable_name", sa.String(length=80), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("baseline_value", sa.Float(), nullable=True),
        sa.Column("scenario_value", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("min_value", sa.Float(), nullable=True),
        sa.Column("max_value", sa.Float(), nullable=True),
        sa.Column("validation_rule", sa.String(length=200), nullable=False),
        sa.Column("source_or_assumption", sa.String(length=200), nullable=False),
        sa.Column("supported", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_twin_scenario_variables_company_id")),
        sa.ForeignKeyConstraint(
            ["scenario_id"], ["twin_scenarios.id"], ondelete="CASCADE", name=op.f("fk_twin_scenario_variables_scenario_id")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_twin_scenario_variables")),
    )
    op.create_index(op.f("ix_twin_scenario_variables_company_id"), "twin_scenario_variables", ["company_id"])
    op.create_index(op.f("ix_twin_scenario_variables_scenario_id"), "twin_scenario_variables", ["scenario_id"])
    op.create_index("ix_twin_vars_scen_domain", "twin_scenario_variables", ["scenario_id", "domain"])

    op.create_table(
        "twin_simulation_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("scenario_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="preparing", nullable=False),
        sa.Column("legacy_simulation_id", sa.String(length=64), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column("model_versions_json", sa.JSON(), nullable=False),
        sa.Column("input_references_json", sa.JSON(), nullable=False),
        sa.Column("output_references_json", sa.JSON(), nullable=False),
        sa.Column("data_readiness_json", sa.JSON(), nullable=False),
        sa.Column("warnings_json", sa.JSON(), nullable=False),
        sa.Column("assumptions_json", sa.JSON(), nullable=False),
        sa.Column("recommendation_json", sa.JSON(), nullable=True),
        sa.Column("error_details", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=100), server_default="system", nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_twin_simulation_runs_company_id")),
        sa.ForeignKeyConstraint(
            ["scenario_id"], ["twin_scenarios.id"], ondelete="CASCADE", name=op.f("fk_twin_simulation_runs_scenario_id")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_twin_simulation_runs")),
    )
    op.create_index(op.f("ix_twin_simulation_runs_company_id"), "twin_simulation_runs", ["company_id"])
    op.create_index(op.f("ix_twin_simulation_runs_scenario_id"), "twin_simulation_runs", ["scenario_id"])
    op.create_index(op.f("ix_twin_simulation_runs_dataset_id"), "twin_simulation_runs", ["dataset_id"])
    op.create_index("ix_twin_runs_comp_scen", "twin_simulation_runs", ["company_id", "scenario_id", "started_at"])

    op.create_table(
        "twin_simulation_events",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("simulation_run_id", sa.String(length=64), nullable=False),
        sa.Column("step_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("zone_id", sa.String(length=48), nullable=True),
        sa.Column("node_id", sa.String(length=64), nullable=True),
        sa.Column("source_node_id", sa.String(length=64), nullable=True),
        sa.Column("target_node_id", sa.String(length=64), nullable=True),
        sa.Column("edge_id", sa.String(length=80), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("record_count", sa.Integer(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_twin_simulation_events_company_id")),
        sa.ForeignKeyConstraint(
            ["simulation_run_id"],
            ["twin_simulation_runs.id"],
            ondelete="CASCADE",
            name=op.f("fk_twin_simulation_events_simulation_run_id"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_twin_simulation_events")),
    )
    op.create_index(op.f("ix_twin_simulation_events_company_id"), "twin_simulation_events", ["company_id"])
    op.create_index(
        op.f("ix_twin_simulation_events_simulation_run_id"), "twin_simulation_events", ["simulation_run_id"]
    )
    op.create_index("ix_twin_events_run_step", "twin_simulation_events", ["simulation_run_id", "step_order"])

    op.create_table(
        "twin_simulation_results",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("simulation_run_id", sa.String(length=64), nullable=False),
        sa.Column("metric_name", sa.String(length=80), nullable=False),
        sa.Column("domain", sa.String(length=40), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("baseline_value", sa.Float(), nullable=True),
        sa.Column("scenario_value", sa.Float(), nullable=True),
        sa.Column("abs_difference", sa.Float(), nullable=True),
        sa.Column("pct_difference", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("uncertainty_metadata_json", sa.JSON(), nullable=False),
        sa.Column("evidence_references_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_twin_simulation_results_company_id")),
        sa.ForeignKeyConstraint(
            ["simulation_run_id"],
            ["twin_simulation_runs.id"],
            ondelete="CASCADE",
            name=op.f("fk_twin_simulation_results_simulation_run_id"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_twin_simulation_results")),
    )
    op.create_index(op.f("ix_twin_simulation_results_company_id"), "twin_simulation_results", ["company_id"])
    op.create_index(
        op.f("ix_twin_simulation_results_simulation_run_id"), "twin_simulation_results", ["simulation_run_id"]
    )
    op.create_index("ix_twin_results_run_metric", "twin_simulation_results", ["simulation_run_id", "metric_name"])


def downgrade():
    op.drop_index("ix_twin_results_run_metric", table_name="twin_simulation_results")
    op.drop_index(op.f("ix_twin_simulation_results_simulation_run_id"), table_name="twin_simulation_results")
    op.drop_index(op.f("ix_twin_simulation_results_company_id"), table_name="twin_simulation_results")
    op.drop_table("twin_simulation_results")

    op.drop_index("ix_twin_events_run_step", table_name="twin_simulation_events")
    op.drop_index(op.f("ix_twin_simulation_events_simulation_run_id"), table_name="twin_simulation_events")
    op.drop_index(op.f("ix_twin_simulation_events_company_id"), table_name="twin_simulation_events")
    op.drop_table("twin_simulation_events")

    op.drop_index("ix_twin_runs_comp_scen", table_name="twin_simulation_runs")
    op.drop_index(op.f("ix_twin_simulation_runs_dataset_id"), table_name="twin_simulation_runs")
    op.drop_index(op.f("ix_twin_simulation_runs_scenario_id"), table_name="twin_simulation_runs")
    op.drop_index(op.f("ix_twin_simulation_runs_company_id"), table_name="twin_simulation_runs")
    op.drop_table("twin_simulation_runs")

    op.drop_index("ix_twin_vars_scen_domain", table_name="twin_scenario_variables")
    op.drop_index(op.f("ix_twin_scenario_variables_scenario_id"), table_name="twin_scenario_variables")
    op.drop_index(op.f("ix_twin_scenario_variables_company_id"), table_name="twin_scenario_variables")
    op.drop_table("twin_scenario_variables")

    op.drop_index("ix_twin_scenarios_comp_ds", table_name="twin_scenarios")
    op.drop_index(op.f("ix_twin_scenarios_dataset_id"), table_name="twin_scenarios")
    op.drop_index(op.f("ix_twin_scenarios_company_id"), table_name="twin_scenarios")
    op.drop_table("twin_scenarios")

