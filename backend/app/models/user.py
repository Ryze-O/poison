from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class UserRole(str, enum.Enum):
    """Benutzer-Rollen mit aufsteigenden Berechtigungen.

    Zusätzliche Flags (unabhängig von Rolle):
    - is_pioneer: Verantwortlich für Versorgung/Logistik
    - is_treasurer: Kassenwart, verwaltet Staffelkasse (nur für Officer+)
    - is_kg_verwalter: Kann Staffelstruktur bearbeiten
    """
    GUEST = "guest"            # Kann fast nichts sehen (wartet auf Freischaltung)
    LOOT_GUEST = "loot_guest"  # Kann Loot erhalten, nur Leserechte
    MEMBER = "member"          # Kann nur sehen
    OFFICER = "officer"        # Kann Loot erfassen, eigenes Lager verwalten
    ADMIN = "admin"            # Alles


class User(Base):
    """Benutzer - wird über Discord OAuth oder Passwort-Registrierung angelegt."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    discord_id = Column(String(20), unique=True, nullable=True, index=True)  # Nullable für CSV-Import und Passwort-User
    username = Column(String(100), nullable=False)
    display_name = Column(String(100), nullable=True)  # Nickname in der Staffel
    avatar = Column(String(255), nullable=True)  # Discord Avatar URL
    avatar_custom = Column(String(255), nullable=True)  # Eigener Avatar (Upload) für Nicht-Discord-User
    password_hash = Column(String(255), nullable=True)  # bcrypt Hash für Passwort-Login
    is_pending = Column(Boolean, default=False, nullable=False)  # Wartet auf Admin-Freischaltung
    role = Column(Enum(UserRole), default=UserRole.MEMBER, nullable=False)
    is_pioneer = Column(Boolean, default=False, nullable=False)  # Pioneer: verantwortlich für Versorgung
    is_treasurer = Column(Boolean, default=False, nullable=False)  # Kassenwart: verwaltet Teil der Staffelkasse
    is_kg_verwalter = Column(Boolean, default=False, nullable=False)  # KG-Verwalter: kann Staffelstruktur bearbeiten
    aliases = Column(String(500), nullable=True)  # Komma-separierte OCR-Aliase (z.B. "ry-ze,ry_ze")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def has_permission(self, required_role: UserRole) -> bool:
        """Prüft ob der Benutzer mindestens die angegebene Rolle hat."""
        role_hierarchy = {
            UserRole.GUEST: -1,
            UserRole.LOOT_GUEST: 0,
            UserRole.MEMBER: 1,
            UserRole.OFFICER: 2,
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


class PendingMerge(Base):
    """Vorgeschlagene Zusammenführung von Discord-User mit existierendem User."""
    __tablename__ = "pending_merges"

    id = Column(Integer, primary_key=True, index=True)
    discord_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # Neuer Discord-User
    existing_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # Existierender User ohne Discord
    match_reason = Column(String(100), nullable=False)  # z.B. "username_match", "display_name_match", "alias_match"
    status = Column(String(20), default="pending")  # pending, approved, rejected

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    discord_user = relationship("User", foreign_keys=[discord_user_id])
    existing_user = relationship("User", foreign_keys=[existing_user_id])
