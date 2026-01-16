from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class InventoryAction(str, enum.Enum):
    ADD = "add"           # Manuell hinzugefügt
    REMOVE = "remove"     # Manuell entfernt
    LOOT = "loot"         # Durch Loot-Verteilung erhalten
    TRANSFER_IN = "transfer_in"    # Transfer empfangen
    TRANSFER_OUT = "transfer_out"  # Transfer gesendet


class InventoryLog(Base):
    """Protokoll aller Lager-Änderungen."""
    __tablename__ = "inventory_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    component_id = Column(Integer, ForeignKey("components.id"), nullable=False)
    action = Column(Enum(InventoryAction), nullable=False)
    quantity = Column(Integer, nullable=False)  # Positiv oder negativ
    quantity_before = Column(Integer, nullable=False)
    quantity_after = Column(Integer, nullable=False)
    related_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Bei Transfers
    notes = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    component = relationship("Component")
    related_user = relationship("User", foreign_keys=[related_user_id])
