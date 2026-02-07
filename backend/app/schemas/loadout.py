from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date

from app.schemas.component import ComponentResponse
from app.schemas.user import UserResponse


# ============== Ship Schemas ==============

class ShipHardpointResponse(BaseModel):
    id: int
    hardpoint_type: str
    size: int
    slot_index: int
    default_component_name: Optional[str]

    class Config:
        from_attributes = True


class ShipResponse(BaseModel):
    id: int
    name: str
    slug: Optional[str]
    manufacturer: Optional[str]
    image_url: Optional[str]
    size_class: Optional[str]
    focus: Optional[str]

    class Config:
        from_attributes = True


class ShipWithHardpointsResponse(ShipResponse):
    hardpoints: List[ShipHardpointResponse]


class ShipCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    manufacturer: Optional[str] = None
    image_url: Optional[str] = None
    size_class: Optional[str] = None
    focus: Optional[str] = None


# ============== Meta-Loadout Schemas ==============

class MetaLoadoutItemResponse(BaseModel):
    id: int
    hardpoint_type: str
    slot_index: int
    hardpoint_id: Optional[int]
    component: ComponentResponse

    class Config:
        from_attributes = True


class MetaLoadoutResponse(BaseModel):
    id: int
    ship: ShipResponse
    name: str
    description: Optional[str]
    erkul_link: Optional[str]
    is_active: bool
    version_date: Optional[date]
    created_by: Optional[UserResponse]
    items: List[MetaLoadoutItemResponse]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class MetaLoadoutListResponse(BaseModel):
    """Kurzform für Listen (ohne Items)."""
    id: int
    ship: ShipResponse
    name: str
    description: Optional[str]
    erkul_link: Optional[str]
    is_active: bool
    version_date: Optional[date]
    created_by: Optional[UserResponse]
    created_at: datetime

    class Config:
        from_attributes = True


class MetaLoadoutCreate(BaseModel):
    ship_id: int
    name: str
    description: Optional[str] = None
    erkul_link: Optional[str] = None
    version_date: Optional[date] = None


class MetaLoadoutUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    erkul_link: Optional[str] = None
    is_active: Optional[bool] = None
    version_date: Optional[date] = None


class MetaLoadoutItemSet(BaseModel):
    """Einzelner Slot beim Setzen von Items."""
    hardpoint_type: str
    slot_index: int
    component_id: int
    hardpoint_id: Optional[int] = None


class MetaLoadoutItemsSet(BaseModel):
    """Alle Items eines Loadouts auf einmal setzen."""
    items: List[MetaLoadoutItemSet]


# ============== Check / Request Missing ==============

class LoadoutCheckItem(BaseModel):
    """Status eines Loadout-Slots für einen User."""
    hardpoint_type: str
    slot_index: int
    component: ComponentResponse
    required: int  # Immer 1 pro Slot
    in_inventory: int  # Wie viele hat der User
    available_from_pioneers: int  # Wie viele bei Pioneers verfügbar

    class Config:
        from_attributes = True


class LoadoutCheckResponse(BaseModel):
    """Was fehlt dem User für ein Loadout."""
    loadout: MetaLoadoutResponse
    items: List[LoadoutCheckItem]
    total_required: int
    total_owned: int
    total_missing: int


# ============== UserLoadout Schemas ==============

# ============== Erkul Import Schemas ==============

class ErkulImportRequest(BaseModel):
    """Erkul-Link oder Code zum Importieren."""
    erkul_url: str  # URL oder Code (z.B. "4ZwmqCps" oder "https://www.erkul.games/loadout/4ZwmqCps")


class ErkulImportedItem(BaseModel):
    """Ein importierter Slot aus Erkul."""
    hardpoint_type: str
    slot_index: int
    component_id: Optional[int] = None
    component_name: Optional[str] = None
    erkul_local_name: str
    matched: bool


class ErkulImportResponse(BaseModel):
    """Ergebnis eines Erkul-Imports."""
    erkul_name: str
    erkul_ship: str
    imported_count: int
    unmatched_count: int
    unmatched_items: List[str]
    items: List[ErkulImportedItem]


# ============== UserLoadout Schemas ==============

class UserLoadoutCreate(BaseModel):
    loadout_id: int
    ship_nickname: Optional[str] = None
    is_ready: bool = False
    notes: Optional[str] = None


class UserLoadoutUpdate(BaseModel):
    ship_nickname: Optional[str] = None
    is_ready: Optional[bool] = None
    notes: Optional[str] = None


class UserLoadoutResponse(BaseModel):
    id: int
    user_id: int
    loadout_id: int
    ship_id: int
    ship_nickname: Optional[str]
    is_ready: bool
    notes: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    loadout: MetaLoadoutResponse
    ship: ShipResponse

    class Config:
        from_attributes = True


class UserLoadoutWithUser(BaseModel):
    """UserLoadout mit aufgelösten User-Daten (für Officer-Sicht)."""
    id: int
    user_id: int
    loadout_id: int
    ship_id: int
    ship_nickname: Optional[str]
    is_ready: bool
    notes: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    loadout: MetaLoadoutListResponse
    ship: ShipResponse
    user: UserResponse

    class Config:
        from_attributes = True
