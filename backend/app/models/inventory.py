from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TransferRequestStatus(str, enum.Enum):
    PENDING = "pending"           # Warte auf Pioneer-Freigabe
    APPROVED = "approved"         # Pioneer hat freigegeben, Discord-Koordination läuft
    AWAITING_RECEIPT = "awaiting_receipt"  # Pioneer hat ausgeliefert, warte auf Empfänger-Bestätigung
    COMPLETED = "completed"       # Empfänger hat Erhalt bestätigt, Transfer abgeschlossen
    REJECTED = "rejected"         # Abgelehnt


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


class TransferRequest(Base):
    """Anfrage für einen Transfer - muss vom Besitzer oder Admin bestätigt werden."""
    __tablename__ = "transfer_requests"

    id = Column(Integer, primary_key=True, index=True)
    # Bestellnummer für Discord-Koordination (z.B. "VPR-2026-0042")
    order_number = Column(String(20), unique=True, nullable=True, index=True)
    # Wer fragt an (will empfangen)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Wessen Lager (der Besitzer)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    component_id = Column(Integer, ForeignKey("components.id"), nullable=False)
    from_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    to_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    quantity = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)

    status = Column(SQLEnum(TransferRequestStatus), default=TransferRequestStatus.PENDING, nullable=False)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Wer hat freigegeben (Pioneer)
    delivered_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Wer hat als ausgeliefert markiert
    confirmed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Wer hat Erhalt bestätigt
    rejection_reason = Column(Text, nullable=True)  # Begründung bei Ablehnung

    # Kommentare
    pioneer_comment = Column(Text, nullable=True)  # Nur für Pioneers sichtbar (interne Notizen)
    public_comment = Column(Text, nullable=True)   # Für alle sichtbar (Anmerkung an Bestellenden)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    requester = relationship("User", foreign_keys=[requester_id])
    owner = relationship("User", foreign_keys=[owner_id])
    approved_by = relationship("User", foreign_keys=[approved_by_id])
    delivered_by = relationship("User", foreign_keys=[delivered_by_id])
    confirmed_by = relationship("User", foreign_keys=[confirmed_by_id])
    component = relationship("Component")
    from_location = relationship("Location", foreign_keys=[from_location_id])
    to_location = relationship("Location", foreign_keys=[to_location_id])
