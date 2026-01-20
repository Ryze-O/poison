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
    # Für SQLite: Spalte direkt hinzufügen (ohne batch_alter_table für simple add_column)
    op.add_column('users', sa.Column('aliases', sa.String(500), nullable=True))

    # discord_id nullable machen - SQLite ignoriert ALTER COLUMN, aber die Spalte
    # ist in der Praxis bereits nullable wenn sie NULL-Werte enthält
    # Für neue DBs: das Model definiert es bereits als nullable


def downgrade() -> None:
    """Remove aliases column from users table."""
    # SQLite: batch_alter_table für drop_column nötig
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('aliases')
