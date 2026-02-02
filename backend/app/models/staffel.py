"""
Staffelstruktur Models

Abbildung der Viper-Staffelstruktur:
- Kommandogruppen (CW, SW, Pioneer)
- Einsatzrollen pro KG
- Funktionsrollen übergreifend
- User-Zuordnungen
"""

from datetime import datetime
from enum import Enum
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database import Base


class MemberStatus(str, Enum):
    """Status eines Mitglieds in einer Kommandogruppe."""
    ACTIVE = "ACTIVE"        # Normales aktives Mitglied
    RECRUIT = "RECRUIT"      # Rekrut <4 Wochen (orange)
    INACTIVE = "INACTIVE"    # Keine aktive Einsatzrolle (rot)
    ABSENT = "ABSENT"        # Abwesend >4 Wochen (grau)


class CommandGroup(Base):
    """Kommandogruppe (CW, SW, Pioneer)."""
    __tablename__ = "command_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(10), unique=True, nullable=False)  # "CW", "SW", "P"
    full_name = Column(String(100), nullable=False)  # "Capital Warfare"
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    operational_roles = relationship("OperationalRole", back_populates="command_group", cascade="all, delete-orphan")
    members = relationship("UserCommandGroup", back_populates="command_group", cascade="all, delete-orphan")
    ships = relationship("CommandGroupShip", back_populates="command_group", cascade="all, delete-orphan")


class OperationalRole(Base):
    """Einsatzrolle innerhalb einer Kommandogruppe."""
    __tablename__ = "operational_roles"

    id = Column(Integer, primary_key=True, index=True)
    command_group_id = Column(Integer, ForeignKey("command_groups.id"), nullable=False)
    name = Column(String(100), nullable=False)  # "GKS-Besatzung", "Dogfighter"
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)

    # Relationships
    command_group = relationship("CommandGroup", back_populates="operational_roles")
    user_assignments = relationship("UserOperationalRole", back_populates="operational_role", cascade="all, delete-orphan")


class FunctionRole(Base):
    """Funktionsrolle (übergreifend, nicht KG-spezifisch)."""
    __tablename__ = "function_roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)  # "Staffelleiter", "Schatzmeister"
    description = Column(Text, nullable=True)
    is_leadership = Column(Boolean, default=False)  # Staffelleitung vs normale Funktion
    sort_order = Column(Integer, default=0)

    # Relationships
    user_assignments = relationship("UserFunctionRole", back_populates="function_role", cascade="all, delete-orphan")


class UserCommandGroup(Base):
    """Zuordnung: User → Kommandogruppe (M:N mit Status)."""
    __tablename__ = "user_command_groups"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    command_group_id = Column(Integer, ForeignKey("command_groups.id"), nullable=False)
    status = Column(SQLEnum(MemberStatus), default=MemberStatus.ACTIVE)
    joined_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    user = relationship("User", backref="command_group_memberships")
    command_group = relationship("CommandGroup", back_populates="members")


class UserOperationalRole(Base):
    """Zuordnung: User → Einsatzrolle."""
    __tablename__ = "user_operational_roles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    operational_role_id = Column(Integer, ForeignKey("operational_roles.id"), nullable=False)
    is_training = Column(Boolean, default=False)  # "In Ausbildung"
    assigned_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", backref="operational_role_assignments")
    operational_role = relationship("OperationalRole", back_populates="user_assignments")


class UserFunctionRole(Base):
    """Zuordnung: User → Funktionsrolle."""
    __tablename__ = "user_function_roles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    function_role_id = Column(Integer, ForeignKey("function_roles.id"), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", backref="function_role_assignments")
    function_role = relationship("FunctionRole", back_populates="user_assignments")


class CommandGroupShip(Base):
    """Schiffe einer Kommandogruppe."""
    __tablename__ = "command_group_ships"

    id = Column(Integer, primary_key=True, index=True)
    command_group_id = Column(Integer, ForeignKey("command_groups.id"), nullable=False)
    ship_name = Column(String(100), nullable=False)  # "Polaris", "Javelin"
    ship_image = Column(String(255), nullable=True)  # Optional: Icon-Pfad
    sort_order = Column(Integer, default=0)

    # Relationships
    command_group = relationship("CommandGroup", back_populates="ships")
