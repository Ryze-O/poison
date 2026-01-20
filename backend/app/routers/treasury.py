from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.treasury import Treasury, TreasuryTransaction, TransactionType
from app.schemas.treasury import TreasuryResponse, TransactionCreate, TransactionUpdate, TransactionResponse
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


@router.patch("/transactions/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: int,
    update_data: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktualisiert eine Transaktion. Nur Treasurer+."""
    check_role(current_user, UserRole.TREASURER)

    transaction = db.query(TreasuryTransaction).filter(
        TreasuryTransaction.id == transaction_id
    ).first()

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaktion nicht gefunden"
        )

    treasury = get_or_create_treasury(db)
    old_amount = transaction.amount

    # Neue Werte berechnen
    new_amount = update_data.amount if update_data.amount is not None else abs(old_amount)
    new_type = update_data.transaction_type if update_data.transaction_type is not None else transaction.transaction_type

    # Betrag mit Vorzeichen je nach Typ
    if new_type == TransactionType.EXPENSE:
        new_amount_signed = -abs(new_amount)
    else:
        new_amount_signed = abs(new_amount)

    # Kassenstand korrigieren: alten Betrag rückgängig machen, neuen anwenden
    treasury.current_balance = treasury.current_balance - old_amount + new_amount_signed

    if treasury.current_balance < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Diese Änderung würde zu einem negativen Kassenstand führen"
        )

    # Transaktion aktualisieren
    transaction.amount = new_amount_signed
    transaction.transaction_type = new_type

    if update_data.description is not None:
        transaction.description = update_data.description
    if update_data.category is not None:
        transaction.category = update_data.category if update_data.category else None

    db.commit()
    db.refresh(transaction)
    return transaction


@router.delete("/transactions/{transaction_id}")
async def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht eine Transaktion. Nur Admin."""
    check_role(current_user, UserRole.ADMIN)

    transaction = db.query(TreasuryTransaction).filter(
        TreasuryTransaction.id == transaction_id
    ).first()

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaktion nicht gefunden"
        )

    treasury = get_or_create_treasury(db)

    # Kassenstand korrigieren (Transaktion rückgängig machen)
    treasury.current_balance -= transaction.amount

    if treasury.current_balance < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Das Löschen würde zu einem negativen Kassenstand führen"
        )

    db.delete(transaction)
    db.commit()

    return {"message": "Transaktion gelöscht"}
