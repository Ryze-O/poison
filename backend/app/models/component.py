from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Component(Base):
    """Komponenten-Katalog (Schilde, Waffen, Kühler, etc.)."""
    __tablename__ = "components"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    category = Column(String(50), nullable=True)  # z.B. "Schilde", "Waffen", "Kühler"
    is_predefined = Column(Boolean, default=False)  # Vordefiniert = nicht löschbar

    created_at = Column(DateTime(timezone=True), server_default=func.now())
