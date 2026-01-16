from pydantic import BaseModel
from typing import Optional, List
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
    notes: Optional[str] = None
    records: List[AttendanceRecordCreate] = []


class AttendanceSessionResponse(BaseModel):
    id: int
    date: datetime
    notes: Optional[str]
    created_by: UserResponse
    records: List[AttendanceRecordResponse]
    created_at: datetime

    class Config:
        from_attributes = True
