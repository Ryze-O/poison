"""
Einsatzplaner Models

Planung und Verwaltung von Staffel-Einsätzen:
- Missions (Einsätze)
- Units (Einheiten)
- Positions (Positionen/Slots)
- Assignments (Zuweisungen)
- Registrations (Anmeldungen)
- Templates (Vorlagen)
- UserShips (User-Schiffe)
"""

from datetime import datetime
from enum import Enum
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum as SQLEnum, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class MissionStatus(str, Enum):
    """Status eines Einsatzes."""
    DRAFT = "draft"           # Entwurf, nur Ersteller sieht
    PUBLISHED = "published"   # Veröffentlicht, User können sich anmelden
    LOCKED = "locked"         # Gesperrt, keine Anmeldungen mehr
    ACTIVE = "active"         # Einsatz läuft
    COMPLETED = "completed"   # Abgeschlossen
    CANCELLED = "cancelled"   # Abgesagt


class Mission(Base):
    """Einsatz / Mission."""
    __tablename__ = "missions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)  # Legacy-Feld, wird durch strukturierte Felder ersetzt

    # Strukturierte Beschreibungsfelder
    mission_context = Column(Text, nullable=True)      # Kontext/Hintergrund/Lore
    mission_objective = Column(Text, nullable=True)    # Einsatzziel
    preparation_notes = Column(Text, nullable=True)    # Vorbereitung für Teilnehmer
    special_notes = Column(Text, nullable=True)        # Besondere Hinweise/Risiken

    # Zeitplanung
    scheduled_date = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, nullable=True)

    # Status
    status = Column(SQLEnum(MissionStatus), default=MissionStatus.DRAFT)

    # Voraussetzungen (Pre-Briefing)
    start_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    equipment_level = Column(String(100), nullable=True)  # "Full Combat Loadout"
    target_group = Column(String(100), nullable=True)     # "CW + SW"
    rules_of_engagement = Column(Text, nullable=True)     # ROE

    # Meta
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    start_location = relationship("Location", foreign_keys=[start_location_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    units = relationship("MissionUnit", back_populates="mission", cascade="all, delete-orphan")
    phases = relationship("MissionPhase", back_populates="mission", cascade="all, delete-orphan")
    registrations = relationship("MissionRegistration", back_populates="mission", cascade="all, delete-orphan")


class MissionPhase(Base):
    """Phase/Ablaufschritt eines Einsatzes."""
    __tablename__ = "mission_phases"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id"), nullable=False)

    phase_number = Column(Integer, nullable=False)  # 1, 2, 3...
    title = Column(String(200), nullable=False)     # "Phase 1: Sammeln"
    description = Column(Text, nullable=True)
    start_time = Column(String(20), nullable=True)  # "20:00"
    sort_order = Column(Integer, default=0)

    # Relationships
    mission = relationship("Mission", back_populates="phases")


class MissionUnit(Base):
    """Einheit innerhalb eines Einsatzes (GKS Polaris, Jägerwing I, etc.)."""
    __tablename__ = "mission_units"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id"), nullable=False)

    name = Column(String(100), nullable=False)      # "GKS Polaris", "Jägerwing I"
    unit_type = Column(String(50), nullable=True)   # gks, wing, squad, beast, deals
    description = Column(Text, nullable=True)

    # Schiff
    ship_name = Column(String(100), nullable=True)  # Manuell gewähltes Schiff
    ship_id = Column(Integer, ForeignKey("command_group_ships.id"), nullable=True)

    # Funkfrequenzen als JSON
    radio_frequencies = Column(JSON, nullable=True)  # {"el": "102.11", "intern": "102.31"}

    sort_order = Column(Integer, default=0)

    # Besatzungsanzahl für Anmeldekategorien
    crew_count = Column(Integer, default=1)

    # Relationships
    mission = relationship("Mission", back_populates="units")
    ship = relationship("CommandGroupShip")
    positions = relationship("MissionPosition", back_populates="unit", cascade="all, delete-orphan")


class MissionPosition(Base):
    """Position/Slot innerhalb einer Einheit (Kommandant, Pilot, Crew 1, etc.)."""
    __tablename__ = "mission_positions"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("mission_units.id"), nullable=False)

    name = Column(String(100), nullable=False)        # "Kommandant", "Crew 1"
    position_type = Column(String(50), nullable=True) # commander, pilot, crew, lead, wing
    is_required = Column(Boolean, default=True)       # Pflicht vs. optional
    min_count = Column(Integer, default=1)
    max_count = Column(Integer, default=1)

    # Optional: Anforderung an Einsatzrolle
    required_role_id = Column(Integer, ForeignKey("operational_roles.id"), nullable=True)
    notes = Column(String(255), nullable=True)
    sort_order = Column(Integer, default=0)

    # Relationships
    unit = relationship("MissionUnit", back_populates="positions")
    required_role = relationship("OperationalRole")
    assignments = relationship("MissionAssignment", back_populates="position", cascade="all, delete-orphan")


class MissionRegistration(Base):
    """User-Anmeldung für einen Einsatz."""
    __tablename__ = "mission_registrations"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Präferenzen
    preferred_unit_id = Column(Integer, ForeignKey("mission_units.id"), nullable=True)
    preferred_position_id = Column(Integer, ForeignKey("mission_positions.id"), nullable=True)
    availability_note = Column(String(255), nullable=True)  # "Kann ab 20:15"
    ship_info = Column(String(500), nullable=True)  # "Habe meine Polaris meta-gefittet am Einsatzort bereit"

    status = Column(String(20), default="registered")  # registered, assigned, declined
    registered_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    mission = relationship("Mission", back_populates="registrations")
    user = relationship("User")
    preferred_unit = relationship("MissionUnit")
    preferred_position = relationship("MissionPosition")


class MissionAssignment(Base):
    """Zuweisung eines Users zu einer Position."""
    __tablename__ = "mission_assignments"

    id = Column(Integer, primary_key=True, index=True)
    position_id = Column(Integer, ForeignKey("mission_positions.id"), nullable=False)

    # User ODER Platzhalter
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    placeholder_name = Column(String(100), nullable=True)  # "XXXXX", "11111"

    is_backup = Column(Boolean, default=False)    # Reserve
    is_training = Column(Boolean, default=False)  # In Ausbildung
    notes = Column(String(255), nullable=True)    # "Medipin auf Idris"

    assigned_at = Column(DateTime, default=datetime.utcnow)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Relationships
    position = relationship("MissionPosition", back_populates="assignments")
    user = relationship("User", foreign_keys=[user_id])
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])


class MissionTemplate(Base):
    """Einsatz-Vorlage."""
    __tablename__ = "mission_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)      # "Loot Run", "PvP Operation"
    description = Column(Text, nullable=True)
    template_data = Column(JSON, nullable=False)    # Units, Positions, Phasen als JSON

    is_system = Column(Boolean, default=False)      # System-Template vs. User-erstellt
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL für System
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    created_by = relationship("User")


class UserShip(Base):
    """Schiffe eines Users (Flotten-Management)."""
    __tablename__ = "user_ships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    ship_name = Column(String(100), nullable=False)  # "Gladius", "Polaris"
    is_fitted = Column(Boolean, default=False)       # Vollständig ausgerüstet?
    loadout_notes = Column(Text, nullable=True)      # "Meta PvP Loadout"

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", backref="ships")


# Standard-Funkfrequenzen als Konstante
STANDARD_RADIO_FREQUENCIES = {
    "el_1": "102.11",      # Einsatzleitung 1
    "el_2": "102.12",      # Einsatzleitung 2
    "gks_1": "102.31",     # GKS Intern 1
    "gks_2": "102.32",     # GKS Intern 2
    "jaeger_1": "102.51",  # Jäger 1
    "jaeger_2": "102.52",  # Jäger 2
    "squad_1": "102.61",   # Squad 1
    "squad_2": "102.62",   # Squad 2
    "beast": "102.70",     # BEAST
    "targets_1": "102.91", # Targets 1
    "targets_2": "102.92", # Targets 2
    "notfall": "102.90",   # Notfall
}
