"""add_is_stackable to components

Revision ID: i9j0k1l2m3n4
Revises: 3c7b3361b18c
Create Date: 2026-01-20 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i9j0k1l2m3n4'
down_revision: Union[str, Sequence[str], None] = '3c7b3361b18c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_stackable field to components table."""
    # Prüfen ob Spalte bereits existiert
    conn = op.get_bind()
    result = conn.execute(sa.text("PRAGMA table_info(components)"))
    columns = [row[1] for row in result]

    if 'is_stackable' not in columns:
        op.add_column('components', sa.Column('is_stackable', sa.Boolean(), server_default='0', nullable=True))

    # Mark existing ore/raw material items as stackable
    op.execute("""
        UPDATE components
        SET is_stackable = 1
        WHERE category IN ('Ore', 'Raw Material', 'Erze', 'Rohstoffe', 'Commodities')
           OR sub_category LIKE '%Ore%'
           OR sub_category LIKE '%Raw%'
           OR sub_category LIKE '%Commodity%'
           OR name LIKE '%SCU%'
           OR name LIKE '%Quantainium%'
           OR name LIKE '%Bexalite%'
           OR name LIKE '%Taranite%'
           OR name LIKE '%Laranite%'
           OR name LIKE '%Agricium%'
           OR name LIKE '%Hephaestanite%'
           OR name LIKE '%Titanium%'
           OR name LIKE '%Diamond%'
           OR name LIKE '%Gold%'
           OR name LIKE '%Copper%'
           OR name LIKE '%RMC%'
           OR name LIKE '%Recycled Material%'
    """)


def downgrade() -> None:
    """Remove is_stackable field from components table."""
    with op.batch_alter_table('components', schema=None) as batch_op:
        batch_op.drop_column('is_stackable')
