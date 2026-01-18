"""add pyro and nyx locations

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-01-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6g7h8i9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6g7h8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add Pyro and Nyx system locations."""
    from sqlalchemy import text

    bind = op.get_bind()

    # Pyro System Standorte
    pyro_locations = [
        # Pyro I - Monox (kein bewohnbarer Ort)
        # Pyro II - Bloom
        ("Bloom", "Pyro", "Pyro II", "Station"),

        # Pyro III - aktuell keine Stationen bekannt

        # Pyro IV - Ignis
        ("Checkmate Station", "Pyro", "Pyro IV", "Station"),

        # Pyro V - keine Stationen

        # Pyro VI - Pyrotechnic Amalgamated Station
        ("Pyrotechnic Amalgamated HQ", "Pyro", "Pyro VI", "Station"),

        # Ruin Station - Asteroidenstation
        ("Ruin Station", "Pyro", None, "Station"),

        # Stanton-Pyro Jump Point
        ("Pyro Gateway", "Pyro", None, "Station"),
    ]

    # Nyx System Standorte
    nyx_locations = [
        # Delamar (Asteroid) - temporär in Stanton, eigentlich Nyx
        ("Levski", "Nyx", "Delamar", "City"),

        # Nyx I - Glaciem (kein bewohnbarer Ort)
        # Nyx II - Myr (kein bewohnbarer Ort)
        # Nyx III - Ashana (kein bewohnbarer Ort)
    ]

    all_locations = pyro_locations + nyx_locations

    for name, system, planet, loc_type in all_locations:
        try:
            bind.execute(text("""
                INSERT OR IGNORE INTO locations (name, system_name, planet_name, location_type, is_predefined)
                VALUES (:name, :system, :planet, :type, 1)
            """), {"name": name, "system": system, "planet": planet, "type": loc_type})
        except Exception:
            pass  # Ignoriere Duplikate


def downgrade() -> None:
    """Remove Pyro and Nyx locations."""
    from sqlalchemy import text

    bind = op.get_bind()

    # Lösche alle Pyro und Nyx Standorte
    bind.execute(text("""
        DELETE FROM locations WHERE system_name IN ('Pyro', 'Nyx') AND is_predefined = 1
    """))
