from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ComponentBase(BaseModel):
    name: str
    category: Optional[str] = None
    sub_category: Optional[str] = None


class ComponentCreate(ComponentBase):
    is_predefined: bool = False
    manufacturer: Optional[str] = None
    size: Optional[int] = None
    grade: Optional[str] = None


class ComponentResponse(ComponentBase):
    id: int
    is_predefined: bool
    sc_uuid: Optional[str] = None
    manufacturer: Optional[str] = None
    size: Optional[int] = None
    grade: Optional[str] = None
    item_class: Optional[str] = None  # Military, Industrial, Civilian, Stealth, Competition
    sc_type: Optional[str] = None
    sc_version: Optional[str] = None
    is_stackable: bool = False  # Teilbar (Erze) vs. Einzelstück (Komponenten)
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Detaillierte Komponenten-Daten von SC Wiki API
class ShieldStats(BaseModel):
    max_shield_health: Optional[float] = None
    max_shield_regen: Optional[float] = None
    decay_ratio: Optional[float] = None
    downed_delay: Optional[float] = None
    damage_delay: Optional[float] = None


class PowerStats(BaseModel):
    power_base: Optional[float] = None
    power_draw: Optional[float] = None
    em_min: Optional[float] = None
    em_max: Optional[float] = None


class CoolerStats(BaseModel):
    cooling_rate: Optional[float] = None
    suppression_ir_factor: Optional[float] = None
    suppression_heat_factor: Optional[float] = None


class QuantumDriveStats(BaseModel):
    quantum_speed: Optional[float] = None
    quantum_spool_time: Optional[float] = None
    quantum_cooldown_time: Optional[float] = None
    quantum_range: Optional[float] = None
    quantum_fuel_requirement: Optional[float] = None


class WeaponStats(BaseModel):
    damage_per_shot: Optional[float] = None
    fire_rate: Optional[float] = None
    range: Optional[float] = None
    ammo_capacity: Optional[int] = None


class ComponentDetailResponse(BaseModel):
    """Detaillierte Komponenten-Daten von der SC Wiki API."""
    id: int
    name: str
    category: Optional[str] = None
    sub_category: Optional[str] = None
    manufacturer: Optional[str] = None
    size: Optional[int] = None
    grade: Optional[str] = None
    item_class: Optional[str] = None
    description: Optional[str] = None

    # Typ-spezifische Stats
    shield: Optional[ShieldStats] = None
    power: Optional[PowerStats] = None
    cooler: Optional[CoolerStats] = None
    quantum_drive: Optional[QuantumDriveStats] = None
    weapon: Optional[WeaponStats] = None

    # Rohe API-Daten für erweiterte Anzeige
    raw_stats: Optional[dict] = None


class SCLocationBase(BaseModel):
    name: str
    location_type: Optional[str] = None
    parent_name: Optional[str] = None
    system_name: Optional[str] = None


class SCLocationResponse(SCLocationBase):
    id: int
    sc_uuid: Optional[str] = None
    has_shops: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SCImportStats(BaseModel):
    """Statistiken nach einem SC-Import."""
    components_added: int = 0
    components_updated: int = 0
    locations_added: int = 0
    locations_updated: int = 0
    errors: list[str] = []
    sc_version: Optional[str] = None
