from pydantic import BaseModel
from typing import Optional, List
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
    # Bei Ausgaben: von welchem Kassenwart-Konto abziehen
    officer_account_id: Optional[int] = None
    # Erweiterte Felder aus dem Bank-Spreadsheet
    sc_version: Optional[str] = None
    item_reference: Optional[str] = None
    beneficiary: Optional[str] = None
    verified_by: Optional[str] = None
    transaction_date: Optional[datetime] = None


class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    transaction_type: Optional[TransactionType] = None
    description: Optional[str] = None
    category: Optional[str] = None
    # Erweiterte Felder
    sc_version: Optional[str] = None
    item_reference: Optional[str] = None
    beneficiary: Optional[str] = None
    verified_by: Optional[str] = None
    transaction_date: Optional[datetime] = None


class TransactionResponse(BaseModel):
    id: int
    amount: float
    transaction_type: TransactionType
    description: str
    category: Optional[str]
    # Kassenwart-Konto (bei Ausgaben)
    officer_account_id: Optional[int] = None
    # Erweiterte Felder
    sc_version: Optional[str] = None
    item_reference: Optional[str] = None
    beneficiary: Optional[str] = None
    verified_by: Optional[str] = None
    transaction_date: Optional[datetime] = None
    created_by: UserResponse
    created_at: datetime

    class Config:
        from_attributes = True


class CSVImportResponse(BaseModel):
    imported: int
    skipped: int
    errors: List[str] = []
