"""add_guest_tokens

Revision ID: 3c7b3361b18c
Revises: 17824f4b243f
Create Date: 2026-01-20 13:24:41.344335

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c7b3361b18c'
down_revision: Union[str, Sequence[str], None] = '17824f4b243f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Guest Tokens Tabelle erstellen
    op.create_table('guest_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('role', sa.Enum('member', 'officer', 'treasurer', 'admin', name='userrole'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_guest_tokens_id'), 'guest_tokens', ['id'], unique=False)
    op.create_index(op.f('ix_guest_tokens_token'), 'guest_tokens', ['token'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_guest_tokens_token'), table_name='guest_tokens')
    op.drop_index(op.f('ix_guest_tokens_id'), table_name='guest_tokens')
    op.drop_table('guest_tokens')
