from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class UserRole(str, enum.Enum):
    """Benutzer-Rollen mit aufsteigenden Berechtigungen."""
    MEMBER = "member"          # Kann nur sehen
    OFFICER = "officer"        # Kann Loot erfassen, eigenes Lager verwalten
    TREASURER = "treasurer"    # Wie Officer + Kasse verwalten
    ADMIN = "admin"            # Alles


class User(Base):
    """Benutzer - wird über Discord OAuth angelegt."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    discord_id = Column(String(20), unique=True, nullable=True, index=True)  # Nullable für CSV-Import
    username = Column(String(100), nullable=False)
    display_name = Column(String(100), nullable=True)  # Nickname in der Staffel
    avatar = Column(String(255), nullable=True)  # Discord Avatar URL
    role = Column(Enum(UserRole), default=UserRole.MEMBER, nullable=False)
    is_pioneer = Column(Boolean, default=False, nullable=False)  # Pioneer: verantwortlich für Versorgung
    aliases = Column(String(500), nullable=True)  # Komma-separierte OCR-Aliase (z.B. "ry-ze,ry_ze")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def has_permission(self, required_role: UserRole) -> bool:
        """Prüft ob der Benutzer mindestens die angegebene Rolle hat."""
        role_hierarchy = {
            UserRole.MEMBER: 0,
            UserRole.OFFICER: 1,
            UserRole.TREASURER: 2,
            UserRole.ADMIN: 3,
        }
        return role_hierarchy[self.role] >= role_hierarchy[required_role]


class GuestToken(Base):
    """Gäste-Zugang mit Token-Link (ohne Discord-Login)."""
    __tablename__ = "guest_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)  # Anzeigename für den Gast
    role = Column(Enum(UserRole), default=UserRole.MEMBER, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)  # Null = nie
    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    created_by = relationship("User", foreign_keys=[created_by_id])


class UserRequest(Base):
    """Antrag für neuen User (wenn nicht Admin)."""
    __tablename__ = "user_requests"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), nullable=False)
    display_name = Column(String(100), nullable=True)
    detected_name = Column(String(100), nullable=False)  # OCR-erkannter Name (wird als Alias gespeichert)
    requested_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="pending")  # pending, approved, rejected
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    requested_by = relationship("User", foreign_keys=[requested_by_id])
