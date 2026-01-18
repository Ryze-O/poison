from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.user import UserRole


class UserBase(BaseModel):
    username: str
    display_name: Optional[str] = None


class UserCreate(UserBase):
    discord_id: str
    avatar: Optional[str] = None


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[UserRole] = None


class UserResponse(UserBase):
    id: int
    discord_id: Optional[str] = None  # Nullable für CSV-importierte User ohne Discord-Login
    avatar: Optional[str] = None
    role: UserRole
    aliases: Optional[str] = None  # Komma-separierte OCR-Aliase
    created_at: datetime

    class Config:
        from_attributes = True
