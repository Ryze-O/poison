from sqlalchemy import Column, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Inventory(Base):
    """Lager - welche Komponenten sind wo und gehören wem."""
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    component_id = Column(Integer, ForeignKey("components.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=True, index=True)  # Wo ist es gelagert
    quantity = Column(Integer, default=0, nullable=False)

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User")
    component = relationship("Component")
    location = relationship("Location")


class InventoryTransfer(Base):
    """Transfer von Komponenten zwischen zwei Personen oder Orten."""
    __tablename__ = "inventory_transfers"

    id = Column(Integer, primary_key=True, index=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    component_id = Column(Integer, ForeignKey("components.id"), nullable=False)
    from_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    to_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    quantity = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user = relationship("User", foreign_keys=[to_user_id])
    component = relationship("Component")
    from_location = relationship("Location", foreign_keys=[from_location_id])
    to_location = relationship("Location", foreign_keys=[to_location_id])
