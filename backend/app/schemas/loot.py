from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.schemas.component import ComponentResponse
from app.schemas.user import UserResponse
from app.schemas.location import LocationResponse


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
    attendance_session_id: Optional[int] = None  # Optional für standalone Sessions
    location_id: Optional[int] = None
    date: Optional[datetime] = None
    notes: Optional[str] = None
    items: List[LootItemCreate] = []


class LootSessionUpdate(BaseModel):
    location_id: Optional[int] = None
    date: Optional[datetime] = None
    notes: Optional[str] = None
    is_completed: Optional[bool] = None


class LootSessionResponse(BaseModel):
    id: int
    attendance_session_id: Optional[int] = None
    created_by: UserResponse
    location: Optional[LocationResponse] = None
    date: Optional[datetime] = None
    notes: Optional[str] = None
    is_completed: bool = False
    items: List[LootItemResponse]
    created_at: datetime

    class Config:
        from_attributes = True
