from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.schemas.user import UserResponse


class LocationBase(BaseModel):
    name: str
    description: Optional[str] = None
    system_name: Optional[str] = None
    planet_name: Optional[str] = None
    location_type: Optional[str] = None


class LocationCreate(LocationBase):
    pass


class LocationResponse(LocationBase):
    id: int
    is_predefined: bool = False
    created_by: Optional[UserResponse] = None
    created_at: datetime

    class Config:
        from_attributes = True
