"""extend component stats

Revision ID: d1e018405ee8
Revises: c0d907394dd7
Create Date: 2026-01-27 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e018405ee8'
down_revision: Union[str, Sequence[str], None] = 'c0d907394dd7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add extended technical stats to components table."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)

    # Prüfe existierende Spalten
    existing_columns = [c['name'] for c in inspector.get_columns('components')]

    # Erweiterte technische Daten
    if 'class_name' not in existing_columns:
        op.add_column('components', sa.Column('class_name', sa.String(200), nullable=True))
        op.create_index('ix_components_class_name', 'components', ['class_name'])

    if 'power_base' not in existing_columns:
        op.add_column('components', sa.Column('power_base', sa.Float(), nullable=True))

    if 'power_draw' not in existing_columns:
        op.add_column('components', sa.Column('power_draw', sa.Float(), nullable=True))

    if 'durability' not in existing_columns:
        op.add_column('components', sa.Column('durability', sa.Float(), nullable=True))

    if 'volume' not in existing_columns:
        op.add_column('components', sa.Column('volume', sa.Float(), nullable=True))

    # Cooler-spezifisch
    if 'cooling_rate' not in existing_columns:
        op.add_column('components', sa.Column('cooling_rate', sa.Float(), nullable=True))

    # Shield-spezifisch
    if 'shield_hp' not in existing_columns:
        op.add_column('components', sa.Column('shield_hp', sa.Float(), nullable=True))

    if 'shield_regen' not in existing_columns:
        op.add_column('components', sa.Column('shield_regen', sa.Float(), nullable=True))

    # Power Plant-spezifisch
    if 'power_output' not in existing_columns:
        op.add_column('components', sa.Column('power_output', sa.Float(), nullable=True))

    # Quantum Drive-spezifisch
    if 'quantum_speed' not in existing_columns:
        op.add_column('components', sa.Column('quantum_speed', sa.Float(), nullable=True))

    if 'quantum_range' not in existing_columns:
        op.add_column('components', sa.Column('quantum_range', sa.Float(), nullable=True))

    if 'quantum_fuel_rate' not in existing_columns:
        op.add_column('components', sa.Column('quantum_fuel_rate', sa.Float(), nullable=True))

    # Shop-Verfügbarkeit
    if 'shop_locations' not in existing_columns:
        op.add_column('components', sa.Column('shop_locations', sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove extended technical stats from components table."""
    try:
        op.drop_index('ix_components_class_name', table_name='components')
    except Exception:
        pass

    op.drop_column('components', 'shop_locations')
    op.drop_column('components', 'quantum_fuel_rate')
    op.drop_column('components', 'quantum_range')
    op.drop_column('components', 'quantum_speed')
    op.drop_column('components', 'power_output')
    op.drop_column('components', 'shield_regen')
    op.drop_column('components', 'shield_hp')
    op.drop_column('components', 'cooling_rate')
    op.drop_column('components', 'volume')
    op.drop_column('components', 'durability')
    op.drop_column('components', 'power_draw')
    op.drop_column('components', 'power_base')
    op.drop_column('components', 'class_name')
