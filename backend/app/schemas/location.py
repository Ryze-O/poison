from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.schemas.user import UserResponse


class LocationBase(BaseModel):
    name: str
    description: Optional[str] = None


class LocationCreate(LocationBase):
    pass


class LocationResponse(LocationBase):
    id: int
    created_by: UserResponse
    created_at: datetime

    class Config:
        from_attributes = True
