"""Add appointment lifecycle and clinician-entered outcome fields."""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260728_0002"
down_revision: str | Sequence[str] | None = "20260723_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("appointments") as batch:
        batch.add_column(sa.Column("previous_slot_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("cancellation_reason", sa.Text(), nullable=True))
        batch.add_column(sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("doctor_notes", sa.Text(), nullable=True))
        batch.add_column(sa.Column("prescribed_medications", sa.JSON(), nullable=False, server_default="[]"))
        batch.add_column(sa.Column("follow_up_suggestions", sa.Text(), nullable=True))
        batch.add_column(sa.Column("follow_up_recommended_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("appointments") as batch:
        batch.drop_column("follow_up_recommended_at")
        batch.drop_column("follow_up_suggestions")
        batch.drop_column("prescribed_medications")
        batch.drop_column("doctor_notes")
        batch.drop_column("completed_at")
        batch.drop_column("cancelled_at")
        batch.drop_column("cancellation_reason")
        batch.drop_column("previous_slot_id")
