from sqlalchemy import Column, Integer, String, Enum, DateTime
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
    discord_id = Column(String(20), unique=True, nullable=False, index=True)
    username = Column(String(100), nullable=False)
    display_name = Column(String(100), nullable=True)  # Nickname in der Staffel
    avatar = Column(String(255), nullable=True)  # Discord Avatar URL
    role = Column(Enum(UserRole), default=UserRole.MEMBER, nullable=False)

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
