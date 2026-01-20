from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Component(Base):
    """Komponenten-Katalog (Schilde, Waffen, Kühler, etc.)."""
    __tablename__ = "components"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    category = Column(String(50), nullable=True, index=True)  # z.B. "Schilde", "Waffen", "Kühler"
    sub_category = Column(String(50), nullable=True)  # Unterkategorie
    is_predefined = Column(Boolean, default=False)  # Vordefiniert = nicht löschbar

    # Star Citizen spezifische Felder
    sc_uuid = Column(String(50), unique=True, nullable=True, index=True)  # UUID von SC Wiki API
    manufacturer = Column(String(100), nullable=True)  # Hersteller
    size = Column(Integer, nullable=True)  # Größe (1-4 etc.)
    grade = Column(String(10), nullable=True)  # A, B, C, D
    item_class = Column(String(50), nullable=True)  # Military, Industrial, Civilian, Stealth, Competition
    sc_type = Column(String(100), nullable=True)  # Original-Typ aus API
    sc_version = Column(String(20), nullable=True)  # SC Version bei Import
    is_stackable = Column(Boolean, default=False)  # Teilbar (Erze etc.) vs. Einzelstück (Komponenten)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class SCLocation(Base):
    """Star Citizen Orte mit Shops (Stationen, Outposts, etc.)."""
    __tablename__ = "sc_locations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    sc_uuid = Column(String(50), unique=True, nullable=True, index=True)
    location_type = Column(String(50), nullable=True)  # Station, Outpost, City, etc.
    parent_name = Column(String(200), nullable=True)  # Planet/Mond Name
    system_name = Column(String(100), nullable=True)  # Stanton, Pyro, etc.
    has_shops = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
