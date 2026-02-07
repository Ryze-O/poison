"""add ships, ship_hardpoints, meta_loadouts, meta_loadout_items

Revision ID: 38e1eecd04f3
Revises: 32fc07a6d422
Create Date: 2026-02-07 10:50:29.649680

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '38e1eecd04f3'
down_revision: Union[str, Sequence[str], None] = '32fc07a6d422'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('ships',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('slug', sa.String(length=100), nullable=True),
    sa.Column('manufacturer', sa.String(length=100), nullable=True),
    sa.Column('image_url', sa.String(length=500), nullable=True),
    sa.Column('size_class', sa.String(length=20), nullable=True),
    sa.Column('focus', sa.String(length=100), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ships_id'), 'ships', ['id'], unique=False)
    op.create_index(op.f('ix_ships_name'), 'ships', ['name'], unique=False)
    op.create_index(op.f('ix_ships_slug'), 'ships', ['slug'], unique=True)

    op.create_table('ship_hardpoints',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('ship_id', sa.Integer(), nullable=False),
    sa.Column('hardpoint_type', sa.String(length=30), nullable=False),
    sa.Column('size', sa.Integer(), nullable=False),
    sa.Column('slot_index', sa.Integer(), nullable=False),
    sa.Column('default_component_name', sa.String(length=200), nullable=True),
    sa.ForeignKeyConstraint(['ship_id'], ['ships.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ship_hardpoints_id'), 'ship_hardpoints', ['id'], unique=False)

    op.create_table('meta_loadouts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('ship_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('erkul_link', sa.String(length=500), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['ship_id'], ['ships.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_meta_loadouts_id'), 'meta_loadouts', ['id'], unique=False)

    op.create_table('meta_loadout_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('loadout_id', sa.Integer(), nullable=False),
    sa.Column('hardpoint_id', sa.Integer(), nullable=True),
    sa.Column('component_id', sa.Integer(), nullable=False),
    sa.Column('hardpoint_type', sa.String(length=30), nullable=False),
    sa.Column('slot_index', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['component_id'], ['components.id'], ),
    sa.ForeignKeyConstraint(['hardpoint_id'], ['ship_hardpoints.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['loadout_id'], ['meta_loadouts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_meta_loadout_items_id'), 'meta_loadout_items', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_meta_loadout_items_id'), table_name='meta_loadout_items')
    op.drop_table('meta_loadout_items')
    op.drop_index(op.f('ix_meta_loadouts_id'), table_name='meta_loadouts')
    op.drop_table('meta_loadouts')
    op.drop_index(op.f('ix_ship_hardpoints_id'), table_name='ship_hardpoints')
    op.drop_table('ship_hardpoints')
    op.drop_index(op.f('ix_ships_slug'), table_name='ships')
    op.drop_index(op.f('ix_ships_name'), table_name='ships')
    op.drop_index(op.f('ix_ships_id'), table_name='ships')
    op.drop_table('ships')
