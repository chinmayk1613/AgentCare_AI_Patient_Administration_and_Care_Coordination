"""Create the complete AgentCare relational model."""

from typing import Sequence

from alembic import op

from app.database import Base
from app import models  # noqa: F401

revision: str = "20260723_0001"
down_revision: str | Sequence[str] | None = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())

