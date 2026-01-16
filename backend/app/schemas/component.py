from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ComponentBase(BaseModel):
    name: str
    category: Optional[str] = None


class ComponentCreate(ComponentBase):
    is_predefined: bool = False


class ComponentResponse(ComponentBase):
    id: int
    is_predefined: bool
    created_at: datetime

    class Config:
        from_attributes = True
