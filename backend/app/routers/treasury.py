from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.treasury import Treasury, TreasuryTransaction, TransactionType
from app.schemas.treasury import TreasuryResponse, TransactionCreate, TransactionResponse
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


def get_or_create_treasury(db: Session) -> Treasury:
    """Holt die Staffelkasse oder erstellt sie wenn nicht vorhanden."""
    treasury = db.query(Treasury).first()
    if not treasury:
        treasury = Treasury(current_balance=0.0)
        db.add(treasury)
        db.commit()
        db.refresh(treasury)
    return treasury


@router.get("/balance", response_model=TreasuryResponse)
async def get_balance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt den aktuellen Kassenstand zurück. Sichtbar für alle."""
    return get_or_create_treasury(db)


@router.get("/transactions", response_model=List[TransactionResponse])
async def get_transactions(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt die Transaktions-Historie zurück. Nur Treasurer+."""
    check_role(current_user, UserRole.TREASURER)

    return db.query(TreasuryTransaction).order_by(
        TreasuryTransaction.created_at.desc()
    ).limit(limit).all()


@router.post("/transactions", response_model=TransactionResponse)
async def create_transaction(
    transaction: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Erstellt eine neue Transaktion. Nur Treasurer+."""
    check_role(current_user, UserRole.TREASURER)

    if transaction.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Betrag muss positiv sein"
        )

    treasury = get_or_create_treasury(db)

    # Betrag je nach Typ anpassen
    actual_amount = transaction.amount
    if transaction.transaction_type == TransactionType.EXPENSE:
        actual_amount = -transaction.amount
        if treasury.current_balance < transaction.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nicht genug Geld in der Kasse"
            )

    # Transaktion erstellen
    db_transaction = TreasuryTransaction(
        amount=actual_amount,
        transaction_type=transaction.transaction_type,
        description=transaction.description,
        category=transaction.category,
        created_by_id=current_user.id
    )
    db.add(db_transaction)

    # Kassenstand aktualisieren
    treasury.current_balance += actual_amount

    db.commit()
    db.refresh(db_transaction)
    return db_transaction


@router.get("/summary")
async def get_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt eine Zusammenfassung der Kasse zurück. Nur Treasurer+."""
    check_role(current_user, UserRole.TREASURER)

    treasury = get_or_create_treasury(db)

    total_income = db.query(TreasuryTransaction).filter(
        TreasuryTransaction.transaction_type == TransactionType.INCOME
    ).count()

    total_expenses = db.query(TreasuryTransaction).filter(
        TreasuryTransaction.transaction_type == TransactionType.EXPENSE
    ).count()

    return {
        "current_balance": treasury.current_balance,
        "total_transactions": total_income + total_expenses,
        "income_count": total_income,
        "expense_count": total_expenses
    }
