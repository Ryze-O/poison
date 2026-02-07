"""add user_loadouts and version_date

Revision ID: c883c00ff8a9
Revises: 38e1eecd04f3
Create Date: 2026-02-07 11:42:28.461520

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c883c00ff8a9'
down_revision: Union[str, Sequence[str], None] = '38e1eecd04f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('user_loadouts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('loadout_id', sa.Integer(), nullable=False),
    sa.Column('ship_id', sa.Integer(), nullable=False),
    sa.Column('ship_nickname', sa.String(length=100), nullable=True),
    sa.Column('is_ready', sa.Boolean(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['loadout_id'], ['meta_loadouts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['ship_id'], ['ships.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_loadouts_id'), 'user_loadouts', ['id'], unique=False)
    op.add_column('meta_loadouts', sa.Column('version_date', sa.Date(), nullable=True))
    op.add_column('mission_registrations', sa.Column('user_loadout_ids', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('mission_registrations', 'user_loadout_ids')
    op.drop_column('meta_loadouts', 'version_date')
    op.drop_index(op.f('ix_user_loadouts_id'), table_name='user_loadouts')
    op.drop_table('user_loadouts')
