"""add is_pioneer to users

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-01-20 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'k1l2m3n4o5p6'
down_revision: Union[str, Sequence[str], None] = 'j0k1l2m3n4o5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_pioneer field to users table."""
    # Prüfen ob Spalte bereits existiert
    conn = op.get_bind()
    result = conn.execute(sa.text("PRAGMA table_info(users)"))
    columns = [row[1] for row in result]

    if 'is_pioneer' not in columns:
        op.add_column('users', sa.Column('is_pioneer', sa.Boolean(), server_default='0', nullable=False))


def downgrade() -> None:
    """Remove is_pioneer field from users table."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('is_pioneer')
