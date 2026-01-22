from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.schemas.user import UserResponse


class OfficerAccountBase(BaseModel):
    user_id: int
    balance: float = 0.0


class OfficerAccountCreate(BaseModel):
    user_id: int
    initial_balance: float = 0.0


class OfficerAccountUpdate(BaseModel):
    balance: Optional[float] = None


class OfficerTransactionCreate(BaseModel):
    """Transaktion auf einem Offizier-Konto erstellen."""
    officer_account_id: int
    amount: float  # Positiv = Einzahlung, Negativ = Auszahlung
    description: str


class OfficerTransferCreate(BaseModel):
    """Transfer zwischen zwei Offizier-Konten."""
    from_account_id: int
    to_account_id: int
    amount: float  # Immer positiv
    description: str


class OfficerTransactionResponse(BaseModel):
    id: int
    officer_account_id: int
    amount: float
    description: str
    treasury_transaction_id: Optional[int] = None
    created_by: UserResponse
    created_at: datetime

    class Config:
        from_attributes = True


class OfficerAccountResponse(BaseModel):
    id: int
    user: UserResponse
    balance: float
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OfficerAccountWithTransactions(OfficerAccountResponse):
    """Offizier-Konto mit Transaktionshistorie."""
    transactions: List[OfficerTransactionResponse] = []

    class Config:
        from_attributes = True


class OfficerAccountsSummary(BaseModel):
    """Zusammenfassung aller Offizier-Konten."""
    total_balance: float
    accounts: List[OfficerAccountResponse]
