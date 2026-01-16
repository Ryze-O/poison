from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.schemas.component import ComponentResponse
from app.schemas.user import UserResponse


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
