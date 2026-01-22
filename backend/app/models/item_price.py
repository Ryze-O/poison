"""
Item Price Model - speichert Preise und Shop-Standorte von UEX API.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ItemPrice(Base):
    """Preis- und Shop-Daten für Items aus der UEX API."""
    __tablename__ = "item_prices"

    id = Column(Integer, primary_key=True, index=True)

    # Referenz zum Item
    component_id = Column(Integer, ForeignKey("components.id"), nullable=True, index=True)
    component = relationship("Component", backref="prices")

    # UEX API Daten
    uex_id = Column(Integer, nullable=True)  # ID in UEX
    item_uuid = Column(String(50), nullable=True, index=True)  # UUID zum Matching
    item_name = Column(String(200), nullable=False)  # Name aus UEX (falls kein Match)

    # Shop/Terminal Info
    terminal_id = Column(Integer, nullable=True)
    terminal_name = Column(String(200), nullable=False)  # z.B. "CenterMass Area 18"

    # Preise
    price_buy = Column(Float, nullable=True)  # Kaufpreis in aUEC
    price_sell = Column(Float, nullable=True)  # Verkaufspreis in aUEC

    # Kategorie aus UEX
    category_id = Column(Integer, nullable=True)

    # Timestamps
    date_added = Column(DateTime(timezone=True), nullable=True)  # Wann zu UEX hinzugefügt
    date_modified = Column(DateTime(timezone=True), nullable=True)  # Letzte Änderung in UEX
    synced_at = Column(DateTime(timezone=True), server_default=func.now())  # Wann synchronisiert

    # Composite index für schnelle Suche nach component + shop
    __table_args__ = (
        Index('ix_item_prices_component_terminal', 'component_id', 'terminal_name'),
    )


class UEXSyncLog(Base):
    """Log für UEX Synchronisierungen."""
    __tablename__ = "uex_sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)
    items_processed = Column(Integer, default=0)
    items_matched = Column(Integer, default=0)
    items_unmatched = Column(Integer, default=0)
    errors = Column(String(2000), nullable=True)
    status = Column(String(20), default="running")  # running, completed, failed
