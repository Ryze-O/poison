from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.schemas.component import ComponentResponse
from app.schemas.user import UserResponse


class LootDistributionCreate(BaseModel):
    user_id: int
    quantity: int


class LootDistributionResponse(BaseModel):
    id: int
    user: UserResponse
    quantity: int

    class Config:
        from_attributes = True


class LootItemCreate(BaseModel):
    component_id: int
    quantity: int


class LootItemResponse(BaseModel):
    id: int
    component: ComponentResponse
    quantity: int
    distributions: List[LootDistributionResponse]

    class Config:
        from_attributes = True


class LootSessionCreate(BaseModel):
    attendance_session_id: int
    items: List[LootItemCreate] = []


class LootSessionResponse(BaseModel):
    id: int
    attendance_session_id: int
    created_by: UserResponse
    items: List[LootItemResponse]
    created_at: datetime

    class Config:
        from_attributes = True
