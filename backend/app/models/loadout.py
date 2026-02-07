from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Ship(Base):
    """Schiffskatalog für Meta-Loadouts."""
    __tablename__ = "ships"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    slug = Column(String(100), unique=True, nullable=True, index=True)  # FleetYards slug
    manufacturer = Column(String(100), nullable=True)
    image_url = Column(String(500), nullable=True)  # Externes Bild (media.starcitizen.tools)
    size_class = Column(String(20), nullable=True)  # "small", "medium", "large", "capital"
    focus = Column(String(100), nullable=True)  # "Fighter", "Mining", "Cargo", etc.

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    hardpoints = relationship("ShipHardpoint", back_populates="ship", cascade="all, delete-orphan")
    loadouts = relationship("MetaLoadout", back_populates="ship", cascade="all, delete-orphan")


class ShipHardpoint(Base):
    """Hardpoint-Slots eines Schiffs (Waffen, Schilde, Kühler, etc.)."""
    __tablename__ = "ship_hardpoints"

    id = Column(Integer, primary_key=True, index=True)
    ship_id = Column(Integer, ForeignKey("ships.id", ondelete="CASCADE"), nullable=False)
    hardpoint_type = Column(String(30), nullable=False)  # cooler, shield, power_plant, quantum_drive, weapon_gun, turret, missile_launcher
    size = Column(Integer, nullable=False)  # 1-9
    slot_index = Column(Integer, nullable=False)  # Slot-Nummer (0-basiert pro Typ)
    default_component_name = Column(String(200), nullable=True)  # Default-Komponente aus FleetYards

    # Relationships
    ship = relationship("Ship", back_populates="hardpoints")


class MetaLoadout(Base):
    """Meta-Loadout-Konfiguration für ein Schiff."""
    __tablename__ = "meta_loadouts"

    id = Column(Integer, primary_key=True, index=True)
    ship_id = Column(Integer, ForeignKey("ships.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)  # z.B. "Viper PvP Meta"
    description = Column(Text, nullable=True)
    erkul_link = Column(String(500), nullable=True)  # Erkul.games Loadout-Link
    is_active = Column(Boolean, default=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    version_date = Column(Date, nullable=True)  # Wann dieses Fitting zuletzt aktualisiert wurde

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    ship = relationship("Ship", back_populates="loadouts")
    created_by = relationship("User")
    items = relationship("MetaLoadoutItem", back_populates="loadout", cascade="all, delete-orphan")


class MetaLoadoutItem(Base):
    """Einzelner Slot in einem Meta-Loadout."""
    __tablename__ = "meta_loadout_items"

    id = Column(Integer, primary_key=True, index=True)
    loadout_id = Column(Integer, ForeignKey("meta_loadouts.id", ondelete="CASCADE"), nullable=False)
    hardpoint_id = Column(Integer, ForeignKey("ship_hardpoints.id", ondelete="SET NULL"), nullable=True)
    component_id = Column(Integer, ForeignKey("components.id"), nullable=False)
    hardpoint_type = Column(String(30), nullable=False)  # Redundant für einfache Abfragen
    slot_index = Column(Integer, nullable=False)

    # Relationships
    loadout = relationship("MetaLoadout", back_populates="items")
    hardpoint = relationship("ShipHardpoint")
    component = relationship("Component")


class UserLoadout(Base):
    """Gefittetes Schiff eines Users (verknüpft User mit Meta-Loadout)."""
    __tablename__ = "user_loadouts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    loadout_id = Column(Integer, ForeignKey("meta_loadouts.id", ondelete="CASCADE"), nullable=False)
    ship_id = Column(Integer, ForeignKey("ships.id", ondelete="CASCADE"), nullable=False)
    ship_nickname = Column(String(100), nullable=True)  # z.B. "Meine Gladius"
    is_ready = Column(Boolean, default=False)  # Vollständig gefittet?
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="user_loadouts")
    loadout = relationship("MetaLoadout")
    ship = relationship("Ship")
