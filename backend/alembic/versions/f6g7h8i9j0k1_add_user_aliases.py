"""add user aliases field for OCR matching

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-01-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6g7h8i9j0k1'
down_revision: Union[str, Sequence[str], None] = 'e5f6g7h8i9j0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add aliases column to users table and make discord_id nullable."""
    # SQLite benötigt batch_alter_table für Schema-Änderungen
    with op.batch_alter_table('users', schema=None) as batch_op:
        # Add aliases column for OCR name matching
        batch_op.add_column(sa.Column('aliases', sa.String(500), nullable=True))
        # Make discord_id nullable for CSV-imported users without Discord login
        batch_op.alter_column('discord_id', existing_type=sa.String(20), nullable=True)


def downgrade() -> None:
    """Remove aliases column from users table."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('aliases')
        batch_op.alter_column('discord_id', existing_type=sa.String(20), nullable=False)
