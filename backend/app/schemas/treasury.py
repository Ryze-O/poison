from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.models.treasury import TransactionType
from app.schemas.user import UserResponse


class TreasuryResponse(BaseModel):
    id: int
    current_balance: float

    class Config:
        from_attributes = True


class TransactionCreate(BaseModel):
    amount: float
    transaction_type: TransactionType
    description: str
    category: Optional[str] = None


class TransactionResponse(BaseModel):
    id: int
    amount: float
    transaction_type: TransactionType
    description: str
    category: Optional[str]
    created_by: UserResponse
    created_at: datetime

    class Config:
        from_attributes = True
