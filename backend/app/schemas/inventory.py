from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.schemas.component import ComponentResponse
from app.schemas.user import UserResponse
from app.models.inventory_log import InventoryAction


class LocationSimple(BaseModel):
    """Einfache Location-Darstellung für Inventory."""
    id: int
    name: str
    description: Optional[str]

    class Config:
        from_attributes = True


class InventoryResponse(BaseModel):
    id: int
    user_id: int
    component: ComponentResponse
    location: Optional[LocationSimple]
    quantity: int

    class Config:
        from_attributes = True


class InventoryUpdate(BaseModel):
    quantity: int


class TransferCreate(BaseModel):
    to_user_id: int
    component_id: int
    quantity: int
    to_location_id: Optional[int] = None
    notes: Optional[str] = None


class BulkLocationTransfer(BaseModel):
    """Alle Items von einem Ort zu einem anderen verschieben."""
    from_location_id: Optional[int] = None  # None = kein Ort zugewiesen
    to_location_id: Optional[int] = None    # None = kein Ort zugewiesen


class BulkTransferToOfficer(BaseModel):
    """Alle Items an einem Standort an einen anderen Offizier übertragen."""
    from_location_id: Optional[int] = None  # None = kein Ort zugewiesen
    to_user_id: int                          # Ziel-Offizier
    to_location_id: Optional[int] = None     # Ziel-Standort (optional)


class PatchResetRequest(BaseModel):
    """Nach einem Patch: Items die noch vorhanden sind an neue Location verschieben."""
    new_location_id: int                    # Neue Homelocation
    kept_item_ids: List[int]                # IDs der Inventory-Items die noch da sind


class TransferResponse(BaseModel):
    id: int
    from_user: UserResponse
    to_user: UserResponse
    component: ComponentResponse
    from_location: Optional[LocationSimple]
    to_location: Optional[LocationSimple]
    quantity: int
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class InventoryLogResponse(BaseModel):
    id: int
    user: UserResponse
    component: ComponentResponse
    action: InventoryAction
    quantity: int
    quantity_before: int
    quantity_after: int
    related_user: Optional[UserResponse]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
