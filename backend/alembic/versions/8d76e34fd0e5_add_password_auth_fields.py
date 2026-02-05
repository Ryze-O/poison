"""add_password_auth_fields

Revision ID: 8d76e34fd0e5
Revises: 7c65d23ec9d4
Create Date: 2026-02-05

Adds fields for password-based authentication:
- password_hash: bcrypt hash for password login
- avatar_custom: custom avatar URL for non-Discord users
- is_pending: flag for users awaiting admin approval
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8d76e34fd0e5'
down_revision: Union[str, Sequence[str], None] = '7c65d23ec9d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add password authentication fields to users table."""
    # Add new columns
    op.add_column('users', sa.Column('password_hash', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('avatar_custom', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('is_pending', sa.Boolean(), nullable=True, server_default='0'))

    # Set default value for existing rows
    op.execute("UPDATE users SET is_pending = 0 WHERE is_pending IS NULL")

    # Make is_pending NOT NULL after setting defaults
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column('is_pending', nullable=False, server_default=None)


def downgrade() -> None:
    """Remove password authentication fields from users table."""
    op.drop_column('users', 'is_pending')
    op.drop_column('users', 'avatar_custom')
    op.drop_column('users', 'password_hash')
