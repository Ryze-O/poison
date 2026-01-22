from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TransactionType(str, enum.Enum):
    INCOME = "income"    # Eingang
    EXPENSE = "expense"  # Ausgang


class Treasury(Base):
    """Staffelkasse - aktueller Stand."""
    __tablename__ = "treasury"

    id = Column(Integer, primary_key=True, index=True)
    current_balance = Column(Float, default=0.0, nullable=False)

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TreasuryTransaction(Base):
    """Ein- oder Ausgang in der Staffelkasse."""
    __tablename__ = "treasury_transactions"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float, nullable=False)  # Positiv = Eingang, Negativ = Ausgang
    transaction_type = Column(Enum(TransactionType), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(100), nullable=True)  # z.B. "Einzahlung", "Schiff Fitting", "Beschaffung Schiff"

    # Bei Ausgaben: von welchem Kassenwart-Konto wurde abgebucht
    officer_account_id = Column(Integer, ForeignKey("officer_accounts.id"), nullable=True)

    # Erweiterte Felder aus dem Bank-Spreadsheet
    sc_version = Column(String(20), nullable=True)  # z.B. "4.0", "4.0.1", "4.1"
    item_reference = Column(String(100), nullable=True)  # Schiff/Ausrüstung: "Polaris", "Sabre", etc.
    beneficiary = Column(String(100), nullable=True)  # Wer hat es bekommen/gegeben
    verified_by = Column(String(100), nullable=True)  # Beglaubigt von
    transaction_date = Column(DateTime(timezone=True), nullable=True)  # Ursprüngliches Datum aus CSV

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    created_by = relationship("User")
    officer_account = relationship("OfficerAccount")
