"""add last_seen_transfers to users

Revision ID: 32fc07a6d422
Revises: b1c222405pp9
Create Date: 2026-02-07 10:08:09.116330

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32fc07a6d422'
down_revision: Union[str, Sequence[str], None] = 'b1c222405pp9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('last_seen_transfers', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'last_seen_transfers')
