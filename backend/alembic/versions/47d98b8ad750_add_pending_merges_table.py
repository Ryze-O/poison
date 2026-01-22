"""add pending_merges table

Revision ID: 47d98b8ad750
Revises: q3h4i5j6k7l8
Create Date: 2026-01-22 13:41:26.120613

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '47d98b8ad750'
down_revision: Union[str, Sequence[str], None] = 'q3h4i5j6k7l8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nur die neue Tabelle erstellen - andere Änderungen sind bereits in der DB
    op.create_table('pending_merges',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('discord_user_id', sa.Integer(), nullable=False),
    sa.Column('existing_user_id', sa.Integer(), nullable=False),
    sa.Column('match_reason', sa.String(length=100), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['discord_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['existing_user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pending_merges_id'), 'pending_merges', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_pending_merges_id'), table_name='pending_merges')
    op.drop_table('pending_merges')
