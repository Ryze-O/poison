"""add attendance OCR fields for screenshot and confirmation

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-01-18 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, Sequence[str], None] = 'f6g7h8i9j0k1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add OCR fields to attendance_sessions for screenshot storage and confirmation."""
    # Prüfen welche Spalten bereits existieren
    conn = op.get_bind()
    result = conn.execute(sa.text("PRAGMA table_info(attendance_sessions)"))
    columns = [row[1] for row in result]

    # Spalten einzeln hinzufügen (nur wenn nicht vorhanden)
    if 'screenshot_data' not in columns:
        op.add_column('attendance_sessions', sa.Column('screenshot_data', sa.LargeBinary(), nullable=True))
    if 'ocr_data' not in columns:
        op.add_column('attendance_sessions', sa.Column('ocr_data', sa.Text(), nullable=True))
    if 'is_confirmed' not in columns:
        op.add_column('attendance_sessions', sa.Column('is_confirmed', sa.Boolean(), server_default='0', nullable=True))

    # User-Requests Tabelle für Anträge von Nicht-Admins
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    if 'user_requests' not in inspector.get_table_names():
        op.create_table(
            'user_requests',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('username', sa.String(100), nullable=False),
            sa.Column('display_name', sa.String(100), nullable=True),
            sa.Column('detected_name', sa.String(100), nullable=False),
            sa.Column('requested_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('status', sa.String(20), server_default='pending'),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    """Remove OCR fields from attendance_sessions and user_requests table."""
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    if 'user_requests' in inspector.get_table_names():
        op.drop_table('user_requests')

    with op.batch_alter_table('attendance_sessions', schema=None) as batch_op:
        batch_op.drop_column('is_confirmed')
        batch_op.drop_column('ocr_data')
        batch_op.drop_column('screenshot_data')
