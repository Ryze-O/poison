from typing import List
from datetime import datetime
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.treasury import Treasury, TreasuryTransaction, TransactionType
from app.models.officer_account import OfficerAccount, OfficerTransaction
from app.schemas.treasury import TreasuryResponse, TransactionCreate, TransactionUpdate, TransactionResponse, CSVImportResponse
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role, check_treasurer

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
    check_treasurer(current_user)

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
    check_treasurer(current_user)

    if transaction.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Betrag muss positiv sein"
        )

    treasury = get_or_create_treasury(db)
    officer_account = None

    # Betrag je nach Typ anpassen
    actual_amount = transaction.amount
    if transaction.transaction_type == TransactionType.EXPENSE:
        actual_amount = -transaction.amount
        if treasury.current_balance < transaction.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nicht genug Geld in der Kasse"
            )

        # Bei Ausgabe: Kassenwart-Konto prüfen und abbuchen
        if transaction.officer_account_id:
            officer_account = db.query(OfficerAccount).filter(
                OfficerAccount.id == transaction.officer_account_id
            ).first()
            if not officer_account:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Kassenwart-Konto nicht gefunden"
                )
            if officer_account.balance < transaction.amount:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Nicht genug Guthaben auf dem Kassenwart-Konto. Verfügbar: {officer_account.balance} aUEC"
                )

    # Bei Einnahmen: Kassenwart-Konto prüfen und Guthaben erhöhen
    received_by_account = None
    if transaction.transaction_type == TransactionType.INCOME and transaction.received_by_account_id:
        received_by_account = db.query(OfficerAccount).filter(
            OfficerAccount.id == transaction.received_by_account_id
        ).first()
        if not received_by_account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Kassenwart-Konto (Empfänger) nicht gefunden"
            )

    # Transaktion erstellen
    db_transaction = TreasuryTransaction(
        amount=actual_amount,
        transaction_type=transaction.transaction_type,
        description=transaction.description,
        category=transaction.category,
        officer_account_id=transaction.officer_account_id,
        received_by_account_id=transaction.received_by_account_id,
        created_by_id=current_user.id
    )
    db.add(db_transaction)

    # Kassenstand aktualisieren
    treasury.current_balance += actual_amount

    # Bei Einnahme mit Kassenwart-Konto: Guthaben erhöhen
    if received_by_account:
        received_by_account.balance += transaction.amount

        # OfficerTransaction zur Dokumentation erstellen
        received_tx = OfficerTransaction(
            officer_account_id=received_by_account.id,
            amount=transaction.amount,
            description=f"Einnahme: {transaction.description}",
            created_by_id=current_user.id
        )
        db.add(received_tx)

    # Bei Ausgabe mit Kassenwart-Konto: Betrag abziehen und Transaktion dokumentieren
    if officer_account:
        officer_account.balance -= transaction.amount

        # OfficerTransaction zur Dokumentation erstellen
        officer_tx = OfficerTransaction(
            officer_account_id=officer_account.id,
            amount=-transaction.amount,
            description=f"Ausgabe: {transaction.description}",
            treasury_transaction_id=None,  # Wird nach commit gesetzt
            created_by_id=current_user.id
        )
        db.add(officer_tx)

    db.commit()
    db.refresh(db_transaction)

    # Treasury Transaction ID in OfficerTransaction nachträglich setzen
    if officer_account:
        officer_tx.treasury_transaction_id = db_transaction.id
        db.commit()

    return db_transaction


@router.get("/summary")
async def get_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt eine Zusammenfassung der Kasse zurück. Nur Treasurer+."""
    check_treasurer(current_user)

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
    check_treasurer(current_user)

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


@router.delete("/transactions/all")
async def delete_all_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht alle Transaktionen und setzt Kassenstand auf 0. Nur Admin."""
    check_role(current_user, UserRole.ADMIN)

    # Alle Transaktionen löschen
    deleted_count = db.query(TreasuryTransaction).delete()

    # Kassenstand auf 0 setzen
    treasury = get_or_create_treasury(db)
    treasury.current_balance = 0.0

    db.commit()

    return {"message": f"{deleted_count} Transaktionen gelöscht, Kassenstand auf 0 gesetzt"}


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


@router.post("/import-csv", response_model=CSVImportResponse)
async def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Importiert Transaktionen aus einer Bank-CSV.
    Spalten: Version, Datum, Zeit, Event, Nutzen, Was, Wer, Menge, Währung, Begl. von / An
    Nur Admin.
    """
    check_role(current_user, UserRole.ADMIN)

    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nur CSV-Dateien erlaubt"
        )

    content = await file.read()
    # Versuche verschiedene Encodings
    for encoding in ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']:
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Konnte CSV nicht dekodieren"
        )

    treasury = get_or_create_treasury(db)
    imported = 0
    skipped = 0
    errors = []

    # Automatische Delimiter-Erkennung (deutsche Excel-CSVs nutzen Semikolon)
    lines = text.split('\n')
    first_line = lines[0] if lines else text
    delimiter = ';' if first_line.count(';') > first_line.count(',') else ','

    # Header-Zeile finden (suche nach "Version" und "Menge" in einer Zeile)
    header_row_idx = None
    for idx, line in enumerate(lines):
        if 'Version' in line and 'Menge' in line and 'Datum' in line:
            header_row_idx = idx
            break

    if header_row_idx is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Konnte Header-Zeile nicht finden (benötigt: Version, Datum, Menge)"
        )

    # CSV ab Header-Zeile parsen
    csv_text = '\n'.join(lines[header_row_idx:])
    reader = csv.DictReader(io.StringIO(csv_text), delimiter=delimiter)

    # Spalten-Mapping: Finde die echten Spaltennamen (können leer sein am Anfang)
    # Die Spalten sind: (leer), Version, Datum, Zeit, Event, Nutzen, Was, Wer, Menge, Währung, Begl. von / An
    fieldnames = reader.fieldnames or []

    # Finde Spaltenindizes basierend auf Namen
    def find_column(name):
        for fn in fieldnames:
            if fn and name.lower() in fn.lower():
                return fn
        return None

    col_version = find_column('Version')
    col_datum = find_column('Datum')
    col_zeit = find_column('Zeit')
    col_event = find_column('Event')
    col_nutzen = find_column('Nutzen')
    col_was = find_column('Was')
    col_wer = find_column('Wer')
    col_menge = find_column('Menge')
    col_begl = find_column('Begl')

    if not col_menge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Spalte 'Menge' nicht gefunden"
        )

    for row_num, row in enumerate(reader, start=header_row_idx + 2):
        try:
            # Menge parsen (kann negativ sein für Ausgaben)
            menge_str = (row.get(col_menge, '') or '').strip().replace(',', '.').replace('"', '')
            if not menge_str or menge_str == '-':
                skipped += 1
                continue

            # Entferne Tausender-Punkte (1.900.000,00 -> 1900000.00)
            # Nach replace(',', '.') haben wir z.B. "1.900.000.00"
            # Wir müssen alle Punkte außer dem letzten entfernen
            parts = menge_str.split('.')
            if len(parts) > 2:
                # Letzte zwei Teile mit Punkt verbinden, Rest ohne
                menge_str = ''.join(parts[:-2]) + parts[-2] + '.' + parts[-1]

            try:
                menge = float(menge_str)
            except ValueError:
                skipped += 1
                continue

            if menge == 0:
                skipped += 1
                continue

            # Transaktionstyp basierend auf Vorzeichen
            if menge > 0:
                transaction_type = TransactionType.INCOME
                amount = menge
            else:
                transaction_type = TransactionType.EXPENSE
                amount = menge  # Bleibt negativ

            # Datum parsen
            datum_str = (row.get(col_datum, '') or '').strip() if col_datum else ''
            zeit_str = (row.get(col_zeit, '') or '').strip() if col_zeit else ''
            transaction_date = None
            if datum_str and datum_str != '-':
                try:
                    # Datum normalisieren: 8.1.2025 -> 08.01.2025
                    date_parts = datum_str.split('.')
                    if len(date_parts) == 3:
                        day = date_parts[0].zfill(2)
                        month = date_parts[1].zfill(2)
                        year = date_parts[2]
                        # Jahr normalisieren (25 -> 2025)
                        if len(year) == 2:
                            year = '20' + year
                        datum_str = f"{day}.{month}.{year}"

                    if zeit_str and zeit_str != '-':
                        # Zeit auch normalisieren falls nötig
                        try:
                            transaction_date = datetime.strptime(f"{datum_str} {zeit_str}", "%d.%m.%Y %H:%M:%S")
                        except ValueError:
                            # Nur Datum ohne Zeit
                            transaction_date = datetime.strptime(datum_str, "%d.%m.%Y")
                    else:
                        transaction_date = datetime.strptime(datum_str, "%d.%m.%Y")
                except (ValueError, IndexError):
                    pass  # Datum ignorieren wenn nicht parsbar

            # Beschreibung zusammensetzen
            event = (row.get(col_event, '') or '').strip() if col_event else ''
            if not event or event == '-':
                skipped += 1
                continue
            description = event

            # Transaktion erstellen
            db_transaction = TreasuryTransaction(
                amount=amount,
                transaction_type=transaction_type,
                description=description,
                category=(row.get(col_nutzen, '') or '').strip() or None if col_nutzen else None,
                sc_version=(row.get(col_version, '') or '').strip() or None if col_version else None,
                item_reference=(row.get(col_was, '') or '').strip() or None if col_was else None,
                beneficiary=(row.get(col_wer, '') or '').strip() or None if col_wer else None,
                verified_by=(row.get(col_begl, '') or '').strip() or None if col_begl else None,
                transaction_date=transaction_date,
                created_by_id=current_user.id
            )
            db.add(db_transaction)

            # Kassenstand aktualisieren
            treasury.current_balance += amount

            imported += 1

        except Exception as e:
            errors.append(f"Zeile {row_num}: {str(e)}")

    db.commit()

    return CSVImportResponse(
        imported=imported,
        skipped=skipped,
        errors=errors
    )
