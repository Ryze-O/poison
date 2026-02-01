"""add comments to transfer requests

Revision ID: g4h331738hh1
Revises: f3g220627gg0
Create Date: 2026-01-30 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g4h331738hh1'
down_revision: Union[str, Sequence[str], None] = 'f3g220627gg0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add pioneer_comment and public_comment fields to transfer_requests table."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)

    # Check if columns exist
    existing_columns = [c['name'] for c in inspector.get_columns('transfer_requests')]

    if 'pioneer_comment' not in existing_columns:
        op.add_column('transfer_requests', sa.Column('pioneer_comment', sa.Text(), nullable=True))

    if 'public_comment' not in existing_columns:
        op.add_column('transfer_requests', sa.Column('public_comment', sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove comment fields from transfer_requests table."""
    op.drop_column('transfer_requests', 'public_comment')
    op.drop_column('transfer_requests', 'pioneer_comment')
