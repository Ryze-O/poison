from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ComponentBase(BaseModel):
    name: str
    category: Optional[str] = None
    sub_category: Optional[str] = None


class ComponentCreate(ComponentBase):
    is_predefined: bool = False
    manufacturer: Optional[str] = None
    size: Optional[int] = None
    grade: Optional[str] = None


class ComponentResponse(ComponentBase):
    id: int
    is_predefined: bool
    sc_uuid: Optional[str] = None
    manufacturer: Optional[str] = None
    size: Optional[int] = None
    grade: Optional[str] = None
    sc_type: Optional[str] = None
    sc_version: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SCLocationBase(BaseModel):
    name: str
    location_type: Optional[str] = None
    parent_name: Optional[str] = None
    system_name: Optional[str] = None


class SCLocationResponse(SCLocationBase):
    id: int
    sc_uuid: Optional[str] = None
    has_shops: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SCImportStats(BaseModel):
    """Statistiken nach einem SC-Import."""
    components_added: int = 0
    components_updated: int = 0
    locations_added: int = 0
    locations_updated: int = 0
    errors: list[str] = []
    sc_version: Optional[str] = None
