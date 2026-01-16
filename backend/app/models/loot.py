from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class LootSession(Base):
    """Eine Loot-Runde, verknüpft mit einer Anwesenheits-Session."""
    __tablename__ = "loot_sessions"

    id = Column(Integer, primary_key=True, index=True)
    attendance_session_id = Column(Integer, ForeignKey("attendance_sessions.id"), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    attendance_session = relationship("AttendanceSession", back_populates="loot_session")
    created_by = relationship("User")
    items = relationship("LootItem", back_populates="loot_session", cascade="all, delete-orphan")


class LootItem(Base):
    """Ein gelooteter Gegenstand."""
    __tablename__ = "loot_items"

    id = Column(Integer, primary_key=True, index=True)
    loot_session_id = Column(Integer, ForeignKey("loot_sessions.id"), nullable=False)
    component_id = Column(Integer, ForeignKey("components.id"), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    loot_session = relationship("LootSession", back_populates="items")
    component = relationship("Component")
    distributions = relationship("LootDistribution", back_populates="loot_item", cascade="all, delete-orphan")


class LootDistribution(Base):
    """Verteilung eines Loot-Items an einen Spieler."""
    __tablename__ = "loot_distributions"

    id = Column(Integer, primary_key=True, index=True)
    loot_item_id = Column(Integer, ForeignKey("loot_items.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    loot_item = relationship("LootItem", back_populates="distributions")
    user = relationship("User")
