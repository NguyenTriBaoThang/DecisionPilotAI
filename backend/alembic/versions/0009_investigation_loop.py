"""Add investigation cases, trace, predictions and demo clock."""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "inv_cases",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("company_id", sa.String(64), nullable=False),
        sa.Column("dataset_id", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="new"),
        sa.Column("title", sa.String(220), nullable=False),
        sa.Column("impact_vnd", sa.BigInteger, nullable=False),
        sa.Column("period_current", sa.JSON, nullable=False),
        sa.Column("period_prior", sa.JSON, nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("summary", sa.JSON, nullable=True),
        sa.Column("run_state", sa.String(16), nullable=False, server_default="idle"),
    )

    op.create_table(
        "inv_trace",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("case_id", sa.String(64), sa.ForeignKey("inv_cases.id"), nullable=False),
        sa.Column("seq", sa.Integer, nullable=False),
        sa.Column("agent", sa.String(32), nullable=False),
        sa.Column("type", sa.String(24), nullable=False),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("case_id", "seq", name="uq_inv_trace_case_seq"),
    )

    op.create_table(
        "inv_predictions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("case_id", sa.String(64), sa.ForeignKey("inv_cases.id"), nullable=False),
        sa.Column("option_key", sa.String(64), nullable=False),
        sa.Column("metric", sa.String(24), nullable=False),
        sa.Column("scope", sa.JSON, nullable=False),
        sa.Column("baseline_daily", sa.Float, nullable=False),
        sa.Column("predicted_delta_pct", sa.Float, nullable=False),
        sa.Column("calibrated_delta_pct", sa.Float, nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("horizon_days", sa.Integer, nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="tracking"),
        sa.Column("actual_delta_pct", sa.Float, nullable=True),
        sa.Column("verdict", sa.String(16), nullable=True),
        sa.Column("scored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("seeded", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("case_id", name="uq_inv_predictions_case"),
    )

    op.create_table(
        "inv_clock",
        sa.Column("company_id", sa.String(64), primary_key=True),
        sa.Column("base_end", sa.Date, nullable=False),
        sa.Column("current_end", sa.Date, nullable=False),
    )


def downgrade():
    for name in ("inv_clock", "inv_predictions", "inv_trace", "inv_cases"):
        op.drop_table(name)
