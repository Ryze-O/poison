"""extend locations with hierarchy

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-01-17 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6g7h8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6g7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add hierarchy columns to locations table."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)

    # Prüfe ob locations Tabelle existiert
    if 'locations' not in inspector.get_table_names():
        # Erstelle die komplette Tabelle
        op.create_table(
            'locations',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(100), nullable=False, index=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('system_name', sa.String(50), nullable=True, index=True),
            sa.Column('planet_name', sa.String(100), nullable=True, index=True),
            sa.Column('location_type', sa.String(50), nullable=True),
            sa.Column('is_predefined', sa.Boolean(), default=False),
            sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    else:
        # Existierende Tabelle erweitern
        existing_columns = [c['name'] for c in inspector.get_columns('locations')]

        if 'system_name' not in existing_columns:
            op.add_column('locations', sa.Column('system_name', sa.String(50), nullable=True))
            op.create_index('ix_locations_system_name', 'locations', ['system_name'])

        if 'planet_name' not in existing_columns:
            op.add_column('locations', sa.Column('planet_name', sa.String(100), nullable=True))
            op.create_index('ix_locations_planet_name', 'locations', ['planet_name'])

        if 'location_type' not in existing_columns:
            op.add_column('locations', sa.Column('location_type', sa.String(50), nullable=True))

        if 'is_predefined' not in existing_columns:
            op.add_column('locations', sa.Column('is_predefined', sa.Boolean(), default=False))

    # Vordefinierte Stationen und Städte einfügen
    _insert_predefined_locations(bind)


def _insert_predefined_locations(bind):
    """Fügt vordefinierte Star Citizen Standorte ein."""
    from sqlalchemy import text

    # Stanton System Standorte
    locations = [
        # Hurston
        ("Lorville", "Stanton", "Hurston", "City"),
        ("Everus Harbor", "Stanton", "Hurston", "Station"),
        ("HDMS-Edmond", "Stanton", "Hurston", "Outpost"),
        ("HDMS-Oparei", "Stanton", "Hurston", "Outpost"),
        ("HDMS-Pinewood", "Stanton", "Hurston", "Outpost"),
        ("HDMS-Stanhope", "Stanton", "Hurston", "Outpost"),
        ("HDMS-Thedus", "Stanton", "Hurston", "Outpost"),

        # Crusader
        ("Orison", "Stanton", "Crusader", "City"),
        ("Port Olisar", "Stanton", "Crusader", "Station"),
        ("Grim HEX", "Stanton", "Yela", "Station"),
        ("Klescher Rehabilitation Facility", "Stanton", "Aberdeen", "Station"),
        ("Security Post Kareah", "Stanton", "Cellin", "Station"),
        ("Covalex Shipping Hub", "Stanton", "Daymar", "Station"),
        ("Kudre Ore", "Stanton", "Daymar", "Outpost"),
        ("Shubin Mining Facility SAL-2", "Stanton", "Daymar", "Outpost"),
        ("Shubin Mining Facility SAL-5", "Stanton", "Daymar", "Outpost"),

        # ArcCorp
        ("Area18", "Stanton", "ArcCorp", "City"),
        ("Baijini Point", "Stanton", "ArcCorp", "Station"),
        ("Humboldt Mines", "Stanton", "Lyria", "Outpost"),
        ("Loveridge Mineral Reserve", "Stanton", "Lyria", "Outpost"),
        ("Shubin Mining Facility SAL-1", "Stanton", "Lyria", "Outpost"),

        # microTech
        ("New Babbage", "Stanton", "microTech", "City"),
        ("Port Tressler", "Stanton", "microTech", "Station"),
        ("Shubin Mining Facility SM0-10", "Stanton", "Calliope", "Outpost"),
        ("Shubin Mining Facility SM0-13", "Stanton", "Calliope", "Outpost"),
        ("Shubin Mining Facility SM0-18", "Stanton", "Clio", "Outpost"),
        ("Shubin Mining Facility SM0-22", "Stanton", "Euterpe", "Outpost"),
        ("Rayari Anvik Research Outpost", "Stanton", "Calliope", "Outpost"),
        ("Rayari Kaltag Research Outpost", "Stanton", "Calliope", "Outpost"),
        ("Rayari McGrath Research Outpost", "Stanton", "Calliope", "Outpost"),

        # Lagrange Points
        ("CRU-L1", "Stanton", "Crusader L1", "Station"),
        ("HUR-L1", "Stanton", "Hurston L1", "Station"),
        ("HUR-L2", "Stanton", "Hurston L2", "Station"),
        ("ARC-L1", "Stanton", "ArcCorp L1", "Station"),
        ("MIC-L1", "Stanton", "microTech L1", "Station"),
    ]

    for name, system, planet, loc_type in locations:
        try:
            bind.execute(text("""
                INSERT OR IGNORE INTO locations (name, system_name, planet_name, location_type, is_predefined)
                VALUES (:name, :system, :planet, :type, 1)
            """), {"name": name, "system": system, "planet": planet, "type": loc_type})
        except Exception:
            pass  # Ignoriere Duplikate


def downgrade() -> None:
    """Remove hierarchy columns from locations."""
    try:
        op.drop_index('ix_locations_planet_name', table_name='locations')
    except Exception:
        pass
    try:
        op.drop_index('ix_locations_system_name', table_name='locations')
    except Exception:
        pass

    op.drop_column('locations', 'is_predefined')
    op.drop_column('locations', 'location_type')
    op.drop_column('locations', 'planet_name')
    op.drop_column('locations', 'system_name')
