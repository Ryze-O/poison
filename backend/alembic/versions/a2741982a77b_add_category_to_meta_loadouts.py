"""add category to meta_loadouts

Revision ID: a2741982a77b
Revises: c883c00ff8a9
Create Date: 2026-02-07 17:19:19.401547

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2741982a77b'
down_revision: Union[str, Sequence[str], None] = 'c883c00ff8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('meta_loadouts', sa.Column('category', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('meta_loadouts', 'category')
