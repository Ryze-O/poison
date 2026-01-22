from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class OfficerAccount(Base):
    """Individuelle Kontostände für Offiziere/Pioneers die Staffelgelder verwalten."""
    __tablename__ = "officer_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    balance = Column(Float, default=0.0, nullable=False)  # Aktueller Kontostand

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="officer_account")


class OfficerTransaction(Base):
    """Transaktionen auf Offizier-Konten (Ein-/Auszahlungen, Transfers)."""
    __tablename__ = "officer_transactions"

    id = Column(Integer, primary_key=True, index=True)

    # Wer ist betroffen
    officer_account_id = Column(Integer, ForeignKey("officer_accounts.id"), nullable=False)

    # Betrag (positiv = Einzahlung auf Konto, negativ = Auszahlung/Ausgabe)
    amount = Column(Float, nullable=False)

    # Beschreibung
    description = Column(Text, nullable=False)

    # Optional: Verknüpfung mit Treasury-Transaktion (für Nachvollziehbarkeit)
    treasury_transaction_id = Column(Integer, ForeignKey("treasury_transactions.id"), nullable=True)

    # Wer hat die Transaktion erfasst
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    officer_account = relationship("OfficerAccount", backref="transactions")
    treasury_transaction = relationship("TreasuryTransaction")
    created_by = relationship("User", foreign_keys=[created_by_id])
