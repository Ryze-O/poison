from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, LargeBinary, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class AttendanceSession(Base):
    """Ein Staffelabend / eine Session."""
    __tablename__ = "attendance_sessions"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime(timezone=True), server_default=func.now())
    session_type = Column(String(20), default="staffelabend", nullable=False)  # staffelabend, loot_run, freeplay
    notes = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # OCR-Daten für nachträgliche Bearbeitung
    screenshot_data = Column(LargeBinary, nullable=True)  # Temporär gespeicherter Screenshot
    ocr_data = Column(Text, nullable=True)  # JSON mit matched/unmatched Namen
    is_confirmed = Column(Boolean, default=False)  # Ob Session bestätigt wurde

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    created_by = relationship("User", foreign_keys=[created_by_id])
    records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")
    loot_session = relationship("LootSession", back_populates="attendance_session", uselist=False)


class AttendanceRecord(Base):
    """Einzelne Anwesenheit eines Benutzers bei einer Session."""
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("attendance_sessions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Kann null sein wenn OCR-Name nicht zugeordnet
    detected_name = Column(String(100), nullable=True)  # Der vom OCR erkannte Name

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    session = relationship("AttendanceSession", back_populates="records")
    user = relationship("User")
