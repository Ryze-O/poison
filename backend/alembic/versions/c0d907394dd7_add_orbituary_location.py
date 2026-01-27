"""add orbituary location

Revision ID: c0d907394dd7
Revises: b9c806283cc6
Create Date: 2026-01-27 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c0d907394dd7'
down_revision: Union[str, Sequence[str], None] = 'b9c806283cc6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add Orbituary location."""
    from sqlalchemy import text

    bind = op.get_bind()

    # Orbituary als neuen Standort hinzufügen (Stanton System)
    try:
        bind.execute(text("""
            INSERT OR IGNORE INTO locations (name, system_name, planet_name, location_type, is_predefined)
            VALUES ('Orbituary', 'Stanton', 'Crusader', 'Station', 1)
        """))
    except Exception:
        pass  # Ignoriere Duplikate


def downgrade() -> None:
    """Remove Orbituary location."""
    from sqlalchemy import text

    bind = op.get_bind()

    bind.execute(text("""
        DELETE FROM locations WHERE name = 'Orbituary' AND is_predefined = 1
    """))
