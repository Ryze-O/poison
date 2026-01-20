"""extend loot sessions with location, date, notes, is_completed

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-01-20 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h8i9j0k1l2m3'
down_revision: Union[str, Sequence[str], None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add location, date, notes, is_completed to loot_sessions."""
    with op.batch_alter_table('loot_sessions', schema=None) as batch_op:
        # Standort wo gelootet wurde (ForeignKey wird im Model definiert)
        batch_op.add_column(sa.Column('location_id', sa.Integer(), nullable=True))
        # Eigenes Datum (falls anders als Erstellungsdatum)
        batch_op.add_column(sa.Column('date', sa.DateTime(timezone=True), nullable=True))
        # Notizen zur Session
        batch_op.add_column(sa.Column('notes', sa.Text(), nullable=True))
        # Session abgeschlossen?
        batch_op.add_column(sa.Column('is_completed', sa.Boolean(), server_default='0', nullable=False))

    # attendance_session_id optional machen (für standalone Loot-Sessions)
    # SQLite unterstützt kein ALTER COLUMN, daher über batch_alter_table
    with op.batch_alter_table('loot_sessions', schema=None) as batch_op:
        batch_op.alter_column('attendance_session_id', nullable=True)


def downgrade() -> None:
    """Remove extended fields from loot_sessions."""
    with op.batch_alter_table('loot_sessions', schema=None) as batch_op:
        batch_op.alter_column('attendance_session_id', nullable=False)

    with op.batch_alter_table('loot_sessions', schema=None) as batch_op:
        batch_op.drop_column('is_completed')
        batch_op.drop_column('notes')
        batch_op.drop_column('date')
        batch_op.drop_column('location_id')
