"""Add Enterprise XAI Recommendations, Post-Implementation Outcomes, Model Evaluations, Risk Alerts, and Tamper-Evident Audit Hash Chain."""
from alembic import op
import sqlalchemy as sa


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "xai_recommendations",
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("rec_key", sa.String(length=100), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=220), nullable=False),
        sa.Column("category_code", sa.String(length=48), nullable=False),
        sa.Column("category_label", sa.String(length=100), nullable=False),
        sa.Column("priority", sa.String(length=24), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("problem_statement", sa.Text(), nullable=False),
        sa.Column("recommended_action", sa.Text(), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("creator", sa.String(length=120), nullable=False),
        sa.Column("owner", sa.String(length=120), nullable=True),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("resources_needed", sa.Text(), nullable=True),
        sa.Column("tracking_kpi", sa.String(length=120), nullable=True),
        sa.Column("success_criteria", sa.Text(), nullable=True),
        sa.Column("stop_criteria", sa.Text(), nullable=True),
        sa.Column("confidence_level", sa.String(length=32), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("confidence_components_json", sa.JSON(), nullable=False),
        sa.Column("why_json", sa.JSON(), nullable=False),
        sa.Column("model_performance_json", sa.JSON(), nullable=False),
        sa.Column("xai_json", sa.JSON(), nullable=False),
        sa.Column("evidence_json", sa.JSON(), nullable=False),
        sa.Column("expected_impact_json", sa.JSON(), nullable=False),
        sa.Column("alternatives_json", sa.JSON(), nullable=False),
        sa.Column("action_plan_json", sa.JSON(), nullable=False),
        sa.Column("assumptions_json", sa.JSON(), nullable=False),
        sa.Column("risks_json", sa.JSON(), nullable=False),
        sa.Column("data_scope_json", sa.JSON(), nullable=False),
        sa.Column("legacy_payload_json", sa.JSON(), nullable=False),
        sa.Column("simulation_id", sa.String(length=64), nullable=True),
        sa.Column("lineage_node_id", sa.String(length=80), nullable=True),
        sa.Column("score", sa.Integer(), server_default="50", nullable=False),
        sa.Column("is_new", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_xai_recommendations_company_id")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_xai_recommendations")),
    )
    op.create_index(op.f("ix_xai_recommendations_rec_key"), "xai_recommendations", ["rec_key"])
    op.create_index(op.f("ix_xai_recommendations_company_id"), "xai_recommendations", ["company_id"])
    op.create_index(op.f("ix_xai_recommendations_dataset_id"), "xai_recommendations", ["dataset_id"])
    op.create_index(op.f("ix_xai_recommendations_category_code"), "xai_recommendations", ["category_code"])
    op.create_index(op.f("ix_xai_recommendations_priority"), "xai_recommendations", ["priority"])
    op.create_index(op.f("ix_xai_recommendations_status"), "xai_recommendations", ["status"])
    op.create_index(op.f("ix_xai_recommendations_confidence_level"), "xai_recommendations", ["confidence_level"])
    op.create_index("ix_xai_recs_comp_ds_key", "xai_recommendations", ["company_id", "dataset_id", "rec_key"], unique=True)
    op.create_index("ix_xai_recs_comp_status", "xai_recommendations", ["company_id", "status"])

    op.create_table(
        "recommendation_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recommendation_id", sa.String(length=100), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("action_type", sa.String(length=40), nullable=False),
        sa.Column("previous_status", sa.String(length=32), nullable=True),
        sa.Column("new_status", sa.String(length=32), nullable=True),
        sa.Column("actor", sa.String(length=100), nullable=False),
        sa.Column("actor_role", sa.String(length=32), server_default="analyst", nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("audit_event_id", sa.Integer(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_recommendation_actions_company_id")),
        sa.ForeignKeyConstraint(
            ["recommendation_id"],
            ["xai_recommendations.id"],
            ondelete="CASCADE",
            name=op.f("fk_recommendation_actions_recommendation_id"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recommendation_actions")),
    )
    op.create_index(op.f("ix_recommendation_actions_recommendation_id"), "recommendation_actions", ["recommendation_id"])
    op.create_index(op.f("ix_recommendation_actions_company_id"), "recommendation_actions", ["company_id"])
    op.create_index(op.f("ix_recommendation_actions_dataset_id"), "recommendation_actions", ["dataset_id"])
    op.create_index(op.f("ix_recommendation_actions_audit_event_id"), "recommendation_actions", ["audit_event_id"])
    op.create_index("ix_rec_actions_rec_time", "recommendation_actions", ["recommendation_id", "occurred_at"])

    op.create_table(
        "recommendation_outcomes",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("recommendation_id", sa.String(length=100), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("evaluation_status", sa.String(length=32), server_default="not_evaluated", nullable=False),
        sa.Column("kpi_name", sa.String(length=120), nullable=False),
        sa.Column("baseline_value", sa.Float(), nullable=True),
        sa.Column("target_value", sa.Float(), nullable=True),
        sa.Column("observed_value", sa.Float(), nullable=True),
        sa.Column("observed_delta_pct", sa.Float(), nullable=True),
        sa.Column("observation_window_days", sa.Integer(), nullable=True),
        sa.Column("methodology", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("evidence_json", sa.JSON(), nullable=False),
        sa.Column("evaluated_by", sa.String(length=100), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_recommendation_outcomes_company_id")),
        sa.ForeignKeyConstraint(
            ["recommendation_id"],
            ["xai_recommendations.id"],
            ondelete="CASCADE",
            name=op.f("fk_recommendation_outcomes_recommendation_id"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recommendation_outcomes")),
    )
    op.create_index(op.f("ix_recommendation_outcomes_recommendation_id"), "recommendation_outcomes", ["recommendation_id"])
    op.create_index(op.f("ix_recommendation_outcomes_company_id"), "recommendation_outcomes", ["company_id"])
    op.create_index(op.f("ix_recommendation_outcomes_dataset_id"), "recommendation_outcomes", ["dataset_id"])
    op.create_index("ix_rec_outcomes_comp_status", "recommendation_outcomes", ["company_id", "evaluation_status"])

    op.create_table(
        "model_evaluations",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("model_name", sa.String(length=120), nullable=False),
        sa.Column("model_version", sa.String(length=80), nullable=False),
        sa.Column("task_type", sa.String(length=48), nullable=False),
        sa.Column("training_dataset_ref", sa.String(length=160), nullable=False),
        sa.Column("eval_dataset_ref", sa.String(length=160), nullable=False),
        sa.Column("train_date_start", sa.Date(), nullable=True),
        sa.Column("train_date_end", sa.Date(), nullable=True),
        sa.Column("metrics_json", sa.JSON(), nullable=False),
        sa.Column("baseline_comparison_json", sa.JSON(), nullable=False),
        sa.Column("feature_schema_json", sa.JSON(), nullable=False),
        sa.Column("drift_status_json", sa.JSON(), nullable=False),
        sa.Column("owner", sa.String(length=100), server_default="ai-pipeline", nullable=False),
        sa.Column("status", sa.String(length=32), server_default="evaluated", nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_model_evaluations_company_id")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_model_evaluations")),
    )
    op.create_index(op.f("ix_model_evaluations_company_id"), "model_evaluations", ["company_id"])
    op.create_index(op.f("ix_model_evaluations_dataset_id"), "model_evaluations", ["dataset_id"])
    op.create_index("ix_model_evals_comp_ds_time", "model_evaluations", ["company_id", "dataset_id", "evaluated_at"])

    op.create_table(
        "audit_hash_chain",
        sa.Column("seq_no", sa.Integer(), nullable=False),
        sa.Column("audit_event_id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("prev_hash", sa.String(length=64), nullable=False),
        sa.Column("payload_sha256", sa.String(length=64), nullable=False),
        sa.Column("entry_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["audit_event_id"], ["audit_events.id"], name=op.f("fk_audit_hash_chain_audit_event_id")),
        sa.PrimaryKeyConstraint("seq_no", name=op.f("pk_audit_hash_chain")),
        sa.UniqueConstraint("audit_event_id", name="uq_audit_hash_chain_event_id"),
        sa.UniqueConstraint("entry_hash", name="uq_audit_hash_chain_entry_hash"),
    )
    op.create_index(op.f("ix_audit_hash_chain_company_id"), "audit_hash_chain", ["company_id"])

    op.create_table(
        "audit_risk_alerts",
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=True),
        sa.Column("risk_key", sa.String(length=120), nullable=False),
        sa.Column("severity", sa.String(length=24), nullable=False),
        sa.Column("category", sa.String(length=48), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("evidence_json", sa.JSON(), nullable=False),
        sa.Column("affected_entity_id", sa.String(length=120), nullable=True),
        sa.Column("affected_entity_type", sa.String(length=48), nullable=True),
        sa.Column("remediation", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="open", nullable=False),
        sa.Column("resolved_by", sa.String(length=100), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_audit_risk_alerts_company_id")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_risk_alerts")),
    )
    op.create_index(op.f("ix_audit_risk_alerts_company_id"), "audit_risk_alerts", ["company_id"])
    op.create_index(op.f("ix_audit_risk_alerts_dataset_id"), "audit_risk_alerts", ["dataset_id"])
    op.create_index(op.f("ix_audit_risk_alerts_risk_key"), "audit_risk_alerts", ["risk_key"])
    op.create_index(op.f("ix_audit_risk_alerts_severity"), "audit_risk_alerts", ["severity"])
    op.create_index(op.f("ix_audit_risk_alerts_status"), "audit_risk_alerts", ["status"])
    op.create_index("ix_audit_risks_comp_status", "audit_risk_alerts", ["company_id", "status"])

    if op.get_bind().dialect.name == "sqlite":
        for action in ("UPDATE", "DELETE"):
            op.execute(
                f"CREATE TRIGGER protect_audit_hash_chain_{action.lower()} BEFORE {action} ON audit_hash_chain "
                "BEGIN SELECT RAISE(ABORT, 'Audit hash chain is append-only'); END"
            )
    else:
        op.execute(
            "CREATE TRIGGER protect_audit_hash_chain BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_hash_chain "
            "FOR EACH STATEMENT EXECUTE FUNCTION protect_decision_history()"
        )


def downgrade():
    if op.get_bind().dialect.name == "sqlite":
        for action in ("update", "delete"):
            op.execute(f"DROP TRIGGER protect_audit_hash_chain_{action}")
    else:
        op.execute("DROP TRIGGER protect_audit_hash_chain ON audit_hash_chain")

    op.drop_index("ix_audit_risks_comp_status", table_name="audit_risk_alerts")
    op.drop_index(op.f("ix_audit_risk_alerts_status"), table_name="audit_risk_alerts")
    op.drop_index(op.f("ix_audit_risk_alerts_severity"), table_name="audit_risk_alerts")
    op.drop_index(op.f("ix_audit_risk_alerts_risk_key"), table_name="audit_risk_alerts")
    op.drop_index(op.f("ix_audit_risk_alerts_dataset_id"), table_name="audit_risk_alerts")
    op.drop_index(op.f("ix_audit_risk_alerts_company_id"), table_name="audit_risk_alerts")
    op.drop_table("audit_risk_alerts")

    op.drop_index(op.f("ix_audit_hash_chain_company_id"), table_name="audit_hash_chain")
    op.drop_table("audit_hash_chain")

    op.drop_index("ix_model_evals_comp_ds_time", table_name="model_evaluations")
    op.drop_index(op.f("ix_model_evaluations_dataset_id"), table_name="model_evaluations")
    op.drop_index(op.f("ix_model_evaluations_company_id"), table_name="model_evaluations")
    op.drop_table("model_evaluations")

    op.drop_index("ix_rec_outcomes_comp_status", table_name="recommendation_outcomes")
    op.drop_index(op.f("ix_recommendation_outcomes_dataset_id"), table_name="recommendation_outcomes")
    op.drop_index(op.f("ix_recommendation_outcomes_company_id"), table_name="recommendation_outcomes")
    op.drop_index(op.f("ix_recommendation_outcomes_recommendation_id"), table_name="recommendation_outcomes")
    op.drop_table("recommendation_outcomes")

    op.drop_index("ix_rec_actions_rec_time", table_name="recommendation_actions")
    op.drop_index(op.f("ix_recommendation_actions_audit_event_id"), table_name="recommendation_actions")
    op.drop_index(op.f("ix_recommendation_actions_dataset_id"), table_name="recommendation_actions")
    op.drop_index(op.f("ix_recommendation_actions_company_id"), table_name="recommendation_actions")
    op.drop_index(op.f("ix_recommendation_actions_recommendation_id"), table_name="recommendation_actions")
    op.drop_table("recommendation_actions")

    op.drop_index("ix_xai_recs_comp_status", table_name="xai_recommendations")
    op.drop_index("ix_xai_recs_comp_ds_key", table_name="xai_recommendations")
    op.drop_index(op.f("ix_xai_recommendations_confidence_level"), table_name="xai_recommendations")
    op.drop_index(op.f("ix_xai_recommendations_status"), table_name="xai_recommendations")
    op.drop_index(op.f("ix_xai_recommendations_priority"), table_name="xai_recommendations")
    op.drop_index(op.f("ix_xai_recommendations_category_code"), table_name="xai_recommendations")
    op.drop_index(op.f("ix_xai_recommendations_dataset_id"), table_name="xai_recommendations")
    op.drop_index(op.f("ix_xai_recommendations_company_id"), table_name="xai_recommendations")
    op.drop_index(op.f("ix_xai_recommendations_rec_key"), table_name="xai_recommendations")
    op.drop_table("xai_recommendations")

