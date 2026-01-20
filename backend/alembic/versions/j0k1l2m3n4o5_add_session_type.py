"""add_session_type to attendance_sessions

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-01-20 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'j0k1l2m3n4o5'
down_revision: Union[str, Sequence[str], None] = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add session_type field to attendance_sessions table."""
    with op.batch_alter_table('attendance_sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('session_type', sa.String(20), server_default='staffelabend', nullable=False))

    # Mark sessions with linked loot sessions as loot_run
    op.execute("""
        UPDATE attendance_sessions
        SET session_type = 'loot_run'
        WHERE id IN (
            SELECT attendance_session_id FROM loot_sessions
            WHERE attendance_session_id IS NOT NULL
        )
    """)


def downgrade() -> None:
    """Remove session_type field from attendance_sessions table."""
    with op.batch_alter_table('attendance_sessions', schema=None) as batch_op:
        batch_op.drop_column('session_type')
