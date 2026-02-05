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
    username: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_pioneer: Optional[bool] = None
    is_treasurer: Optional[bool] = None
    is_kg_verwalter: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    discord_id: Optional[str] = None  # Nullable für CSV-importierte User ohne Discord-Login
    avatar: Optional[str] = None
    avatar_custom: Optional[str] = None  # Eigener Avatar für Nicht-Discord-User
    role: UserRole
    is_pioneer: bool = False  # Pioneer: verantwortlich für Versorgung
    is_treasurer: bool = False  # Kassenwart: verwaltet Teil der Staffelkasse
    is_kg_verwalter: bool = False  # KG-Verwalter: kann Staffelstruktur bearbeiten
    is_pending: bool = False  # Wartet auf Admin-Freischaltung
    aliases: Optional[str] = None  # Komma-separierte OCR-Aliase
    created_at: datetime

    class Config:
        from_attributes = True


# Password Authentication Schemas
class PasswordRegister(BaseModel):
    """Schema für Passwort-Registrierung."""
    username: str
    password: str
    display_name: Optional[str] = None


class PasswordLogin(BaseModel):
    """Schema für Passwort-Login."""
    username: str
    password: str


class PasswordResetByAdmin(BaseModel):
    """Schema für Admin-Passwort-Reset."""
    user_id: int
    new_password: str


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
