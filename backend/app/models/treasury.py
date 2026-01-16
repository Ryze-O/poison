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
    category = Column(String(50), nullable=True)  # z.B. "Spende", "Ausrüstung"
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    created_by = relationship("User")
