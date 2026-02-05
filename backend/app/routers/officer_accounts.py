from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.officer_account import OfficerAccount, OfficerTransaction
from app.schemas.officer_account import (
    OfficerAccountCreate,
    OfficerAccountResponse,
    OfficerAccountWithTransactions,
    OfficerAccountsSummary,
    OfficerTransactionCreate,
    OfficerTransactionResponse,
    OfficerTransferCreate,
)
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role, check_treasurer

router = APIRouter()


@router.get("", response_model=OfficerAccountsSummary)
async def get_all_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Offizier-Konten mit Kontoständen zurück. Nur Treasurer+."""
    check_treasurer(current_user)

    accounts = db.query(OfficerAccount).all()
    total_balance = sum(acc.balance for acc in accounts)

    return OfficerAccountsSummary(
        total_balance=total_balance,
        accounts=accounts
    )


@router.get("/{account_id}", response_model=OfficerAccountWithTransactions)
async def get_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt ein Offizier-Konto mit Transaktionen zurück. Nur Treasurer+."""
    check_treasurer(current_user)

    account = db.query(OfficerAccount).filter(OfficerAccount.id == account_id).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Offizier-Konto nicht gefunden"
        )

    return account


@router.post("", response_model=OfficerAccountResponse)
async def create_account(
    data: OfficerAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Erstellt ein neues Offizier-Konto. Nur Admin."""
    check_role(current_user, UserRole.ADMIN)

    # Prüfen ob User existiert
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    # Prüfen ob bereits ein Konto existiert
    existing = db.query(OfficerAccount).filter(OfficerAccount.user_id == data.user_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Benutzer hat bereits ein Offizier-Konto"
        )

    account = OfficerAccount(
        user_id=data.user_id,
        balance=data.initial_balance
    )
    db.add(account)
    db.commit()
    db.refresh(account)

    return account


@router.delete("/{account_id}")
async def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht ein Offizier-Konto. Nur Admin."""
    check_role(current_user, UserRole.ADMIN)

    account = db.query(OfficerAccount).filter(OfficerAccount.id == account_id).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Offizier-Konto nicht gefunden"
        )

    if account.balance != 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Konto hat noch einen Stand von {account.balance} aUEC"
        )

    db.delete(account)
    db.commit()

    return {"message": "Offizier-Konto gelöscht"}


@router.post("/{account_id}/transactions", response_model=OfficerTransactionResponse)
async def create_transaction(
    account_id: int,
    data: OfficerTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Erstellt eine Transaktion auf einem Offizier-Konto. Nur Treasurer+."""
    check_treasurer(current_user)

    account = db.query(OfficerAccount).filter(OfficerAccount.id == account_id).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Offizier-Konto nicht gefunden"
        )

    # Bei Auszahlung prüfen ob genug Guthaben
    if data.amount < 0 and account.balance + data.amount < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nicht genug Guthaben. Verfügbar: {account.balance} aUEC"
        )

    # Transaktion erstellen
    transaction = OfficerTransaction(
        officer_account_id=account_id,
        amount=data.amount,
        description=data.description,
        created_by_id=current_user.id
    )
    db.add(transaction)

    # Kontostand aktualisieren
    account.balance += data.amount

    db.commit()
    db.refresh(transaction)

    return transaction


@router.post("/transfer", response_model=dict)
async def transfer_between_accounts(
    data: OfficerTransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Überweist Geld zwischen zwei Offizier-Konten. Nur Treasurer+."""
    check_treasurer(current_user)

    if data.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Betrag muss positiv sein"
        )

    if data.from_account_id == data.to_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sender und Empfänger müssen unterschiedlich sein"
        )

    from_account = db.query(OfficerAccount).filter(OfficerAccount.id == data.from_account_id).first()
    to_account = db.query(OfficerAccount).filter(OfficerAccount.id == data.to_account_id).first()

    if not from_account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sender-Konto nicht gefunden"
        )
    if not to_account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empfänger-Konto nicht gefunden"
        )

    if from_account.balance < data.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nicht genug Guthaben. Verfügbar: {from_account.balance} aUEC"
        )

    # Transaktionen erstellen
    from_tx = OfficerTransaction(
        officer_account_id=from_account.id,
        amount=-data.amount,
        description=f"Transfer an {to_account.user.display_name or to_account.user.username}: {data.description}",
        created_by_id=current_user.id
    )
    to_tx = OfficerTransaction(
        officer_account_id=to_account.id,
        amount=data.amount,
        description=f"Transfer von {from_account.user.display_name or from_account.user.username}: {data.description}",
        created_by_id=current_user.id
    )
    db.add(from_tx)
    db.add(to_tx)

    # Kontostände aktualisieren
    from_account.balance -= data.amount
    to_account.balance += data.amount

    db.commit()

    return {
        "message": f"{data.amount} aUEC überwiesen",
        "from_balance": from_account.balance,
        "to_balance": to_account.balance
    }


@router.patch("/{account_id}/set-balance", response_model=OfficerAccountResponse)
async def set_account_balance(
    account_id: int,
    balance: float,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Setzt den Kontostand direkt (für Import/Korrektur). Nur Admin."""
    check_role(current_user, UserRole.ADMIN)

    account = db.query(OfficerAccount).filter(OfficerAccount.id == account_id).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Offizier-Konto nicht gefunden"
        )

    old_balance = account.balance
    account.balance = balance

    # Korrektur-Transaktion dokumentieren
    if old_balance != balance:
        diff = balance - old_balance
        transaction = OfficerTransaction(
            officer_account_id=account_id,
            amount=diff,
            description=f"Korrektur: Stand von {old_balance} auf {balance} geändert",
            created_by_id=current_user.id
        )
        db.add(transaction)

    db.commit()
    db.refresh(account)

    return account
