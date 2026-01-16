from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.schemas.component import ComponentResponse
from app.schemas.user import UserResponse
from app.models.inventory_log import InventoryAction


class InventoryResponse(BaseModel):
    id: int
    user_id: int
    component: ComponentResponse
    quantity: int

    class Config:
        from_attributes = True


class InventoryUpdate(BaseModel):
    quantity: int


class TransferCreate(BaseModel):
    to_user_id: int
    component_id: int
    quantity: int
    notes: Optional[str] = None


class TransferResponse(BaseModel):
    id: int
    from_user: UserResponse
    to_user: UserResponse
    component: ComponentResponse
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
