from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Location(Base):
    """Lager-Standorte (z.B. Schiffe, Stationen, Basen)."""
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)  # z.B. "Carrack von Max", "Port Olisar Hangar 3"

    # Hierarchie: Sternensystem > Planet/Mond > Station/Stadt
    system_name = Column(String(50), nullable=True, index=True)  # z.B. "Stanton", "Pyro"
    planet_name = Column(String(100), nullable=True, index=True)  # z.B. "Hurston", "Crusader", "microTech"
    location_type = Column(String(50), nullable=True)  # "Station", "City", "Outpost", "Ship", "Custom"

    # Vordefinierte Standorte (Stationen/Städte) können nicht gelöscht werden
    is_predefined = Column(Boolean, default=False)

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Null für vordefinierte
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    created_by = relationship("User")
