"""add rejection reason to transfer requests

Revision ID: e2f119516ff9
Revises: d1e018405ee8
Create Date: 2026-01-27 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2f119516ff9'
down_revision: Union[str, Sequence[str], None] = 'd1e018405ee8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add rejection_reason field to transfer_requests table."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)

    # Check if column exists
    existing_columns = [c['name'] for c in inspector.get_columns('transfer_requests')]

    if 'rejection_reason' not in existing_columns:
        op.add_column('transfer_requests', sa.Column('rejection_reason', sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove rejection_reason field from transfer_requests table."""
    op.drop_column('transfer_requests', 'rejection_reason')
