"""add is_kg_verwalter field

Revision ID: i6j553950jj3
Revises: h5i442849ii2
Create Date: 2026-02-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i6j553950jj3'
down_revision: Union[str, None] = 'h5i442849ii2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_kg_verwalter', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('users', 'is_kg_verwalter')
