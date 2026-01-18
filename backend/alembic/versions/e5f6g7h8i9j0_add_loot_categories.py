"""add loot item categories (ores, drugs, commodities)

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-01-18 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6g7h8i9j0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6g7h8i9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add loot item categories: ores, drugs, commodities."""
    from sqlalchemy import text

    bind = op.get_bind()

    # Erze / Ores
    ores = [
        # Quantainium-Gruppe (sehr wertvoll, explosiv)
        ("Quantainium (rein)", "Erze", "Quantainium"),
        ("Quantainium (unrein)", "Erze", "Quantainium"),

        # Hochwertige Erze
        ("Bexalite (rein)", "Erze", "Bexalite"),
        ("Bexalite (unrein)", "Erze", "Bexalite"),
        ("Taranite (rein)", "Erze", "Taranite"),
        ("Taranite (unrein)", "Erze", "Taranite"),
        ("Laranite (rein)", "Erze", "Laranite"),
        ("Laranite (unrein)", "Erze", "Laranite"),

        # Mittlere Erze
        ("Agricium (rein)", "Erze", "Agricium"),
        ("Agricium (unrein)", "Erze", "Agricium"),
        ("Hephaestanite (rein)", "Erze", "Hephaestanite"),
        ("Hephaestanite (unrein)", "Erze", "Hephaestanite"),
        ("Titanium (rein)", "Erze", "Titanium"),
        ("Titanium (unrein)", "Erze", "Titanium"),

        # Edelsteine
        ("Diamond (rein)", "Erze", "Edelsteine"),
        ("Diamond (unrein)", "Erze", "Edelsteine"),
        ("Gold (rein)", "Erze", "Edelsteine"),
        ("Gold (unrein)", "Erze", "Edelsteine"),
        ("Beryl (rein)", "Erze", "Edelsteine"),
        ("Beryl (unrein)", "Erze", "Edelsteine"),

        # Basis-Erze
        ("Copper (rein)", "Erze", "Basis-Erze"),
        ("Copper (unrein)", "Erze", "Basis-Erze"),
        ("Corundum (rein)", "Erze", "Basis-Erze"),
        ("Corundum (unrein)", "Erze", "Basis-Erze"),
        ("Tungsten (rein)", "Erze", "Basis-Erze"),
        ("Tungsten (unrein)", "Erze", "Basis-Erze"),
        ("Aluminum (rein)", "Erze", "Basis-Erze"),
        ("Aluminum (unrein)", "Erze", "Basis-Erze"),
        ("Borase", "Erze", "Basis-Erze"),
        ("Quartz", "Erze", "Basis-Erze"),
    ]

    # Rohstoffe / Salvage
    salvage = [
        ("Recycled Material Composite (RMC)", "Rohstoffe", "Salvage"),
        ("Construction Materials", "Rohstoffe", "Salvage"),
        ("Scrap", "Rohstoffe", "Salvage"),
        ("Hull Scraping", "Rohstoffe", "Salvage"),
    ]

    # Drogen / Drugs
    drugs = [
        ("Slam", "Drogen", "Stimulanzien"),
        ("Neon", "Drogen", "Stimulanzien"),
        ("WiDoW", "Drogen", "Stimulanzien"),
        ("Maze", "Drogen", "Psychedelika"),
        ("E'tam", "Drogen", "Psychedelika"),
        ("Altruciatoxin", "Drogen", "Gifte"),
    ]

    # Waren / Commodities
    commodities = [
        ("Medical Supplies", "Waren", "Medizin"),
        ("Stims", "Waren", "Medizin"),
        ("Agricultural Supplies", "Waren", "Landwirtschaft"),
        ("Processed Food", "Waren", "Nahrung"),
        ("Distilled Spirits", "Waren", "Nahrung"),
        ("Hydrogen", "Waren", "Treibstoff"),
        ("Quantum Fuel", "Waren", "Treibstoff"),
    ]

    all_items = ores + salvage + drugs + commodities

    for name, category, sub_category in all_items:
        try:
            bind.execute(text("""
                INSERT OR IGNORE INTO components (name, category, sub_category, is_predefined)
                VALUES (:name, :category, :sub_category, 1)
            """), {"name": name, "category": category, "sub_category": sub_category})
        except Exception:
            pass  # Ignoriere Duplikate


def downgrade() -> None:
    """Remove loot categories."""
    from sqlalchemy import text

    bind = op.get_bind()

    # Lösche alle Loot-Items (nicht Ship Components etc.)
    bind.execute(text("""
        DELETE FROM components
        WHERE category IN ('Erze', 'Rohstoffe', 'Drogen', 'Waren')
        AND is_predefined = 1
    """))
