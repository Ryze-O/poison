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
    is_pioneer: Optional[bool] = None
    is_treasurer: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    discord_id: Optional[str] = None  # Nullable für CSV-importierte User ohne Discord-Login
    avatar: Optional[str] = None
    role: UserRole
    is_pioneer: bool = False  # Pioneer: verantwortlich für Versorgung
    is_treasurer: bool = False  # Kassenwart: verwaltet Teil der Staffelkasse
    aliases: Optional[str] = None  # Komma-separierte OCR-Aliase
    created_at: datetime

    class Config:
        from_attributes = True


# Gäste-Token Schemas
class GuestTokenCreate(BaseModel):
    name: str  # Anzeigename für den Gast
    role: UserRole = UserRole.MEMBER
    expires_in_days: Optional[int] = None  # Null = nie ablaufend


class GuestTokenResponse(BaseModel):
    id: int
    token: str
    name: str
    role: UserRole
    expires_at: Optional[datetime] = None
    is_active: bool
    last_used_at: Optional[datetime] = None
    created_at: datetime
    created_by_username: Optional[str] = None

    class Config:
        from_attributes = True


class GuestLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
