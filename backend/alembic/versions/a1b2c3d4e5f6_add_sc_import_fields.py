"""add sc import fields

Revision ID: a1b2c3d4e5f6
Revises: 717553e12c36
Create Date: 2026-01-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '717553e12c36'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    from sqlalchemy import inspect
    from alembic import op

    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = inspector.get_table_names()
    existing_columns = {}

    if 'components' in existing_tables:
        existing_columns['components'] = [c['name'] for c in inspector.get_columns('components')]

    # Neue Felder für components Tabelle (nur wenn nicht vorhanden)
    if 'components' in existing_tables:
        cols = existing_columns.get('components', [])
        if 'sub_category' not in cols:
            op.add_column('components', sa.Column('sub_category', sa.String(50), nullable=True))
        if 'sc_uuid' not in cols:
            op.add_column('components', sa.Column('sc_uuid', sa.String(50), nullable=True))
        if 'manufacturer' not in cols:
            op.add_column('components', sa.Column('manufacturer', sa.String(100), nullable=True))
        if 'size' not in cols:
            op.add_column('components', sa.Column('size', sa.Integer(), nullable=True))
        if 'grade' not in cols:
            op.add_column('components', sa.Column('grade', sa.String(10), nullable=True))
        if 'sc_type' not in cols:
            op.add_column('components', sa.Column('sc_type', sa.String(100), nullable=True))
        if 'sc_version' not in cols:
            op.add_column('components', sa.Column('sc_version', sa.String(20), nullable=True))
        if 'updated_at' not in cols:
            op.add_column('components', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    # Index für sc_uuid (nur wenn nicht vorhanden)
    existing_indexes = [idx['name'] for idx in inspector.get_indexes('components')] if 'components' in existing_tables else []
    if 'ix_components_sc_uuid' not in existing_indexes:
        try:
            op.create_index('ix_components_sc_uuid', 'components', ['sc_uuid'], unique=True)
        except Exception:
            pass
    if 'ix_components_category' not in existing_indexes:
        try:
            op.create_index('ix_components_category', 'components', ['category'], unique=False)
        except Exception:
            pass

    # Neue Tabelle für SC Locations (nur wenn nicht vorhanden)
    if 'sc_locations' not in existing_tables:
        op.create_table(
            'sc_locations',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(200), nullable=False, index=True),
            sa.Column('sc_uuid', sa.String(50), nullable=True, unique=True, index=True),
            sa.Column('location_type', sa.String(50), nullable=True),
            sa.Column('parent_name', sa.String(200), nullable=True),
            sa.Column('system_name', sa.String(100), nullable=True),
            sa.Column('has_shops', sa.Boolean(), default=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('sc_locations')

    op.drop_index('ix_components_category', table_name='components')
    op.drop_index('ix_components_sc_uuid', table_name='components')

    op.drop_column('components', 'updated_at')
    op.drop_column('components', 'sc_version')
    op.drop_column('components', 'sc_type')
    op.drop_column('components', 'grade')
    op.drop_column('components', 'size')
    op.drop_column('components', 'manufacturer')
    op.drop_column('components', 'sc_uuid')
    op.drop_column('components', 'sub_category')
