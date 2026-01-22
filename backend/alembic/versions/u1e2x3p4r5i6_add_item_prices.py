"""add item_prices and uex_sync_logs tables

Revision ID: u1e2x3p4r5i6
Revises: 47d98b8ad750
Create Date: 2026-01-22 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'u1e2x3p4r5i6'
down_revision: Union[str, Sequence[str], None] = '47d98b8ad750'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Item Prices Tabelle für UEX Preisdaten
    op.create_table('item_prices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('component_id', sa.Integer(), nullable=True),
        sa.Column('uex_id', sa.Integer(), nullable=True),
        sa.Column('item_uuid', sa.String(length=50), nullable=True),
        sa.Column('item_name', sa.String(length=200), nullable=False),
        sa.Column('terminal_id', sa.Integer(), nullable=True),
        sa.Column('terminal_name', sa.String(length=200), nullable=False),
        sa.Column('price_buy', sa.Float(), nullable=True),
        sa.Column('price_sell', sa.Float(), nullable=True),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('date_added', sa.DateTime(timezone=True), nullable=True),
        sa.Column('date_modified', sa.DateTime(timezone=True), nullable=True),
        sa.Column('synced_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['component_id'], ['components.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_item_prices_id'), 'item_prices', ['id'], unique=False)
    op.create_index(op.f('ix_item_prices_component_id'), 'item_prices', ['component_id'], unique=False)
    op.create_index(op.f('ix_item_prices_item_uuid'), 'item_prices', ['item_uuid'], unique=False)
    op.create_index('ix_item_prices_component_terminal', 'item_prices', ['component_id', 'terminal_name'], unique=False)

    # UEX Sync Log Tabelle
    op.create_table('uex_sync_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('items_processed', sa.Integer(), nullable=True),
        sa.Column('items_matched', sa.Integer(), nullable=True),
        sa.Column('items_unmatched', sa.Integer(), nullable=True),
        sa.Column('errors', sa.String(length=2000), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_uex_sync_logs_id'), 'uex_sync_logs', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_uex_sync_logs_id'), table_name='uex_sync_logs')
    op.drop_table('uex_sync_logs')
    op.drop_index('ix_item_prices_component_terminal', table_name='item_prices')
    op.drop_index(op.f('ix_item_prices_item_uuid'), table_name='item_prices')
    op.drop_index(op.f('ix_item_prices_component_id'), table_name='item_prices')
    op.drop_index(op.f('ix_item_prices_id'), table_name='item_prices')
    op.drop_table('item_prices')
