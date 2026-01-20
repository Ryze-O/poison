from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

from app.schemas.user import UserResponse


class AttendanceRecordCreate(BaseModel):
    user_id: Optional[int] = None
    detected_name: Optional[str] = None


class AttendanceRecordResponse(BaseModel):
    id: int
    user: Optional[UserResponse]
    detected_name: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AttendanceSessionCreate(BaseModel):
    session_type: str = "staffelabend"  # staffelabend, loot_run, freeplay
    notes: Optional[str] = None
    records: List[AttendanceRecordCreate] = []
    # OCR-Daten für nachträgliche Bearbeitung
    screenshot_base64: Optional[str] = None  # Base64-codierter Screenshot
    ocr_data: Optional[dict] = None  # {matched: [...], unmatched: [...]}


class AttendanceSessionUpdate(BaseModel):
    """Zum Aktualisieren einer Session (z.B. Bestätigung)."""
    notes: Optional[str] = None
    is_confirmed: Optional[bool] = None


class AttendanceSessionResponse(BaseModel):
    id: int
    date: datetime
    session_type: str = "staffelabend"  # staffelabend, loot_run, freeplay
    notes: Optional[str]
    created_by: UserResponse
    records: List[AttendanceRecordResponse]
    is_confirmed: bool = False
    has_screenshot: bool = False  # Ob ein Screenshot vorhanden ist
    has_loot_session: bool = False  # Ob eine Loot-Session existiert
    loot_session_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class OCRDataResponse(BaseModel):
    """OCR-Daten einer Session für nachträgliche Bearbeitung."""
    matched: List[dict]
    unmatched: List[str]
    all_users: List[dict]


class UserRequestCreate(BaseModel):
    """Antrag für neuen User (wenn nicht Admin)."""
    username: str
    display_name: Optional[str] = None
    detected_name: str  # Der vom OCR erkannte Name (wird als Alias gespeichert)


class UserRequestResponse(BaseModel):
    id: int
    username: str
    display_name: Optional[str]
    detected_name: str
    requested_by: UserResponse
    status: str  # pending, approved, rejected
    created_at: datetime

    class Config:
        from_attributes = True
