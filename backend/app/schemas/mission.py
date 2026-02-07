"""
Pydantic Schemas für Einsatzplaner
"""

from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.models.mission import MissionStatus
from app.schemas.user import UserResponse


# ============== User Ships Schemas ==============

class UserShipBase(BaseModel):
    ship_name: str
    is_fitted: bool = False
    loadout_notes: Optional[str] = None


class UserShipCreate(UserShipBase):
    pass


class UserShipUpdate(BaseModel):
    ship_name: Optional[str] = None
    is_fitted: Optional[bool] = None
    loadout_notes: Optional[str] = None


class UserShipResponse(UserShipBase):
    id: int
    user_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============== Mission Template Schemas ==============

class MissionTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None


class MissionTemplateResponse(MissionTemplateBase):
    id: int
    template_data: Dict[str, Any]
    is_system: bool
    created_by_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============== Mission Phase Schemas ==============

class MissionPhaseBase(BaseModel):
    phase_number: int
    title: str
    description: Optional[str] = None
    start_time: Optional[str] = None
    sort_order: int = 0


class MissionPhaseCreate(MissionPhaseBase):
    pass


class MissionPhaseUpdate(BaseModel):
    phase_number: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[str] = None
    sort_order: Optional[int] = None


class MissionPhaseResponse(MissionPhaseBase):
    id: int
    mission_id: int

    class Config:
        from_attributes = True


# ============== Mission Assignment Schemas ==============

class MissionAssignmentBase(BaseModel):
    is_backup: bool = False
    is_training: bool = False
    notes: Optional[str] = None


class MissionAssignmentCreate(MissionAssignmentBase):
    position_id: int
    user_id: Optional[int] = None
    placeholder_name: Optional[str] = None


class MissionAssignmentUpdate(BaseModel):
    user_id: Optional[int] = None
    placeholder_name: Optional[str] = None
    is_backup: Optional[bool] = None
    is_training: Optional[bool] = None
    notes: Optional[str] = None


class MissionAssignmentResponse(MissionAssignmentBase):
    id: int
    position_id: int
    user_id: Optional[int] = None
    placeholder_name: Optional[str] = None
    user: Optional[UserResponse] = None
    assigned_at: Optional[datetime] = None
    assigned_by_id: int

    class Config:
        from_attributes = True


# ============== Mission Position Schemas ==============

class MissionPositionBase(BaseModel):
    name: str
    position_type: Optional[str] = None
    is_required: bool = True
    min_count: int = 1
    max_count: int = 1
    notes: Optional[str] = None
    sort_order: int = 0


class MissionPositionCreate(MissionPositionBase):
    required_role_id: Optional[int] = None


class MissionPositionUpdate(BaseModel):
    name: Optional[str] = None
    position_type: Optional[str] = None
    is_required: Optional[bool] = None
    min_count: Optional[int] = None
    max_count: Optional[int] = None
    required_role_id: Optional[int] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None


class MissionPositionResponse(MissionPositionBase):
    id: int
    unit_id: int
    required_role_id: Optional[int] = None
    required_role_name: Optional[str] = None  # Aufgelöster Rollenname
    assignments: List[MissionAssignmentResponse] = []

    class Config:
        from_attributes = True


# ============== Mission Unit Schemas ==============

class MissionUnitBase(BaseModel):
    name: str
    unit_type: Optional[str] = None
    description: Optional[str] = None
    ship_name: Optional[str] = None
    radio_frequencies: Optional[Dict[str, str]] = None
    sort_order: int = 0
    crew_count: int = 1  # Besatzungsanzahl für Anmeldekategorien


class MissionUnitCreate(MissionUnitBase):
    ship_id: Optional[int] = None
    positions: List[MissionPositionCreate] = []


class MissionUnitUpdate(BaseModel):
    name: Optional[str] = None
    unit_type: Optional[str] = None
    description: Optional[str] = None
    ship_name: Optional[str] = None
    ship_id: Optional[int] = None
    radio_frequencies: Optional[Dict[str, str]] = None
    sort_order: Optional[int] = None
    crew_count: Optional[int] = None


class MissionUnitResponse(MissionUnitBase):
    id: int
    mission_id: int
    ship_id: Optional[int] = None
    positions: List[MissionPositionResponse] = []

    class Config:
        from_attributes = True


# ============== Mission Registration Schemas ==============

class MissionRegistrationBase(BaseModel):
    preferred_unit_id: Optional[int] = None
    preferred_position_id: Optional[int] = None
    availability_note: Optional[str] = None
    ship_info: Optional[str] = None  # "Habe meine Polaris meta-gefittet am Einsatzort bereit"


class MissionRegistrationCreate(MissionRegistrationBase):
    user_loadout_ids: Optional[List[int]] = None


class MissionRegistrationResponse(MissionRegistrationBase):
    id: int
    mission_id: int
    user_id: int
    user: Optional[UserResponse] = None
    status: str
    registered_at: Optional[datetime] = None
    ship_info: Optional[str] = None
    user_loadout_ids: Optional[List[int]] = None
    # Aufgelöste UserLoadout-Daten (Ship-Name, Loadout-Name, is_ready)
    user_loadouts_resolved: Optional[List[Dict[str, Any]]] = None
    # Optional: Info ob User Schiffe hat
    has_ships: bool = False

    class Config:
        from_attributes = True


# ============== Mission Schemas ==============

class MissionBase(BaseModel):
    title: str
    description: Optional[str] = None  # Legacy-Feld

    # Strukturierte Beschreibungsfelder
    mission_context: Optional[str] = None      # Kontext/Hintergrund/Lore
    mission_objective: Optional[str] = None    # Einsatzziel
    preparation_notes: Optional[str] = None    # Vorbereitung für Teilnehmer
    special_notes: Optional[str] = None        # Besondere Hinweise/Risiken

    scheduled_date: datetime
    duration_minutes: Optional[int] = None
    equipment_level: Optional[str] = None
    target_group: Optional[str] = None
    rules_of_engagement: Optional[str] = None


class MissionCreate(MissionBase):
    start_location_id: Optional[int] = None
    template_id: Optional[int] = None  # Optional: Von Template erstellen


class MissionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None  # Legacy-Feld

    # Strukturierte Beschreibungsfelder
    mission_context: Optional[str] = None
    mission_objective: Optional[str] = None
    preparation_notes: Optional[str] = None
    special_notes: Optional[str] = None

    scheduled_date: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    start_location_id: Optional[int] = None
    equipment_level: Optional[str] = None
    target_group: Optional[str] = None
    rules_of_engagement: Optional[str] = None
    status: Optional[MissionStatus] = None


class MissionResponse(MissionBase):
    id: int
    status: MissionStatus
    start_location_id: Optional[int] = None
    start_location_name: Optional[str] = None
    created_by_id: int
    created_by: Optional[UserResponse] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Counts
    registration_count: int = 0
    assignment_count: int = 0
    total_positions: int = 0

    class Config:
        from_attributes = True


class MissionDetailResponse(MissionResponse):
    """Detaillierte Mission mit allen Unterressourcen."""
    units: List[MissionUnitResponse] = []
    phases: List[MissionPhaseResponse] = []
    registrations: List[MissionRegistrationResponse] = []

    class Config:
        from_attributes = True


# ============== Briefing Schema ==============

class BriefingUnit(BaseModel):
    """Einheit im Briefing-Format."""
    name: str
    ship_name: Optional[str] = None
    radio_frequencies: Optional[Dict[str, str]] = None
    positions: List[Dict[str, Any]]  # Vereinfachte Position mit Zuweisungen


class BriefingResponse(BaseModel):
    """Formatiertes Briefing-Dokument."""
    title: str
    scheduled_date: datetime
    duration_minutes: Optional[int] = None

    # Strukturierte Beschreibung
    mission_context: Optional[str] = None      # Kontext/Hintergrund/Lore
    mission_objective: Optional[str] = None    # Einsatzziel
    preparation_notes: Optional[str] = None    # Vorbereitung für Teilnehmer
    special_notes: Optional[str] = None        # Besondere Hinweise/Risiken

    # Pre-Briefing
    start_location: Optional[str] = None
    equipment_level: Optional[str] = None
    target_group: Optional[str] = None
    rules_of_engagement: Optional[str] = None

    # Phasen
    phases: List[MissionPhaseResponse] = []

    # Line-Up
    units: List[BriefingUnit] = []

    # Funkfrequenzen-Tabelle
    frequency_table: List[Dict[str, Any]] = []

    # Platzhalter-Legende
    placeholders_used: List[str] = []


# ============== Hilfsfunktionen ==============

class RadioFrequencyPreset(BaseModel):
    """Vordefinierte Funkfrequenz."""
    key: str
    label: str
    frequency: str


class RadioFrequencyPresetsResponse(BaseModel):
    """Alle Standard-Funkfrequenzen."""
    presets: List[RadioFrequencyPreset]


# ============== Assignment UI Schemas ==============

class OperationalRoleSimple(BaseModel):
    """Einfache Einsatzrolle für Assignment-UI."""
    id: int
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class GroupedOperationalRole(BaseModel):
    """Einsatzrollen gruppiert nach Kommandogruppe."""
    command_group_id: int
    command_group_name: str  # "CW", "SW", "P"
    command_group_full: str  # "Capital Warfare"
    roles: List[OperationalRoleSimple]


class EligibleUser(BaseModel):
    """User mit Zusatzinfos für Assignment-UI."""
    id: int
    username: str
    display_name: Optional[str] = None
    discord_id: Optional[str] = None
    avatar: Optional[str] = None
    role: str
    is_officer: bool
    is_kg_verwalter: bool
    is_pioneer: bool


class PositionWithAssignments(BaseModel):
    """Position mit bestehenden Assignments."""
    id: int
    name: str
    position_type: Optional[str] = None
    required_role_id: Optional[int] = None
    sort_order: int
    assignments: List[MissionAssignmentResponse]

    class Config:
        from_attributes = True


class UnitWithPositions(BaseModel):
    """Unit mit Positionen für Assignment-UI."""
    id: int
    name: str
    unit_type: Optional[str] = None
    ship_name: Optional[str] = None
    crew_count: int
    sort_order: int
    positions: List[PositionWithAssignments]

    class Config:
        from_attributes = True


class AssignmentDataResponse(BaseModel):
    """Alle Daten für das Assignment-UI."""
    mission_id: int
    mission_title: str
    units: List[UnitWithPositions]
    operational_roles: List[GroupedOperationalRole]
    eligible_users: List[EligibleUser]
    can_manage: bool
