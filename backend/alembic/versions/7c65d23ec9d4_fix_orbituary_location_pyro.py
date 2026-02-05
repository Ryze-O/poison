"""fix_orbituary_location_pyro

Revision ID: 7c65d23ec9d4
Revises: f64d85b780a3
Create Date: 2026-02-05

Orbituary ist in Pyro (bei Bloom), nicht in Stanton.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c65d23ec9d4'
down_revision: Union[str, Sequence[str], None] = 'f64d85b780a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Fix Orbituary location: move from Stanton/Crusader to Pyro/Bloom."""
    from sqlalchemy import text

    bind = op.get_bind()

    # Orbituary korrigieren: Pyro/Bloom statt Stanton/Crusader
    bind.execute(text("""
        UPDATE locations
        SET system_name = 'Pyro', planet_name = 'Bloom'
        WHERE name = 'Orbituary'
    """))


def downgrade() -> None:
    """Revert Orbituary to original (wrong) location."""
    from sqlalchemy import text

    bind = op.get_bind()

    bind.execute(text("""
        UPDATE locations
        SET system_name = 'Stanton', planet_name = 'Crusader'
        WHERE name = 'Orbituary'
    """))
