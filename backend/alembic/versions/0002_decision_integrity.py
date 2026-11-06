"""Persist scenario evidence and protect decision history from modification."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("simulation_runs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("dataset_id", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("payload", sa.JSON, nullable=False))
    op.create_index("ix_simulation_runs_dataset_id", "simulation_runs", ["dataset_id"])
    op.create_index("ix_audit_kind_subject_id", "audit_events", ["kind", "subject", "id"])
    if op.get_bind().dialect.name == "sqlite":
        for table in ("audit_events", "simulation_runs"):
            for action in ("UPDATE", "DELETE"):
                op.execute(f"CREATE TRIGGER protect_{table}_{action.lower()} BEFORE {action} ON {table} "
                           "BEGIN SELECT RAISE(ABORT, 'Decision history is append-only'); END")
    else:
        op.execute("CREATE FUNCTION protect_decision_history() RETURNS trigger LANGUAGE plpgsql AS $$ "
                   "BEGIN RAISE EXCEPTION 'Decision history is append-only'; END; $$")
        for table in ("audit_events", "simulation_runs"):
            op.execute(f"CREATE TRIGGER protect_{table} BEFORE UPDATE OR DELETE OR TRUNCATE ON {table} "
                       "FOR EACH STATEMENT EXECUTE FUNCTION protect_decision_history()")


def downgrade():
    if op.get_bind().dialect.name == "sqlite":
        for table in ("audit_events", "simulation_runs"):
            for action in ("update", "delete"):
                op.execute(f"DROP TRIGGER protect_{table}_{action}")
    else:
        for table in ("audit_events", "simulation_runs"):
            op.execute(f"DROP TRIGGER protect_{table} ON {table}")
        op.execute("DROP FUNCTION protect_decision_history()")
    op.drop_index("ix_audit_kind_subject_id", table_name="audit_events")
    op.drop_index("ix_simulation_runs_dataset_id", table_name="simulation_runs")
    op.drop_table("simulation_runs")
