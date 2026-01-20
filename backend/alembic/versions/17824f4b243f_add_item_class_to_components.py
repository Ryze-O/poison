"""add item_class to components

Revision ID: 17824f4b243f
Revises: h8i9j0k1l2m3
Create Date: 2026-01-20 13:11:03.691583

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '17824f4b243f'
down_revision: Union[str, Sequence[str], None] = 'h8i9j0k1l2m3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nur item_class Spalte hinzufügen
    op.add_column('components', sa.Column('item_class', sa.String(length=50), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('components', 'item_class')
