"""add is_treasurer to users

Revision ID: q3h4i5j6k7l8
Revises: p2g3h4i5j6k7
Create Date: 2025-01-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'q3h4i5j6k7l8'
down_revision: Union[str, None] = 'p2g3h4i5j6k7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # is_treasurer Flag zu users hinzufügen
    op.add_column('users', sa.Column('is_treasurer', sa.Boolean(), nullable=True))

    # Default-Wert setzen
    op.execute("UPDATE users SET is_treasurer = 0")

    # Bestehende User mit role='treasurer' als is_treasurer markieren
    op.execute("UPDATE users SET is_treasurer = 1 WHERE role = 'treasurer'")


def downgrade() -> None:
    op.drop_column('users', 'is_treasurer')
