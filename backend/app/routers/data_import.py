"""CSV-Import für Inventar und Kassen-Transaktionen."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
import csv
import io
from datetime import datetime

from app.database import get_db
from app.models.user import User, UserRole
from app.models.component import Component
from app.models.inventory import Inventory
from app.models.location import Location
from app.models.treasury import TreasuryTransaction
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


class ImportResult(BaseModel):
    success: int
    errors: List[str]
    warnings: List[str]


def detect_csv_delimiter(text: str) -> str:
    """
    Erkennt automatisch das CSV-Trennzeichen (Komma oder Semikolon).
    Deutsche Excel-Versionen exportieren mit Semikolon.
    """
    # Erste Zeile (Header) analysieren
    first_line = text.split('\n')[0] if '\n' in text else text

    semicolon_count = first_line.count(';')
    comma_count = first_line.count(',')

    # Wenn mehr Semikolons als Kommas, dann Semikolon als Trennzeichen
    if semicolon_count > comma_count:
        return ';'
    return ','


def create_csv_reader(text: str) -> csv.DictReader:
    """Erstellt einen CSV-Reader mit automatisch erkanntem Trennzeichen."""
    delimiter = detect_csv_delimiter(text)
    return csv.DictReader(io.StringIO(text), delimiter=delimiter)


@router.post("/inventory", response_model=ImportResult)
async def import_inventory(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Importiert Inventar aus CSV-Datei.

    Erwartetes Format (Komma oder Semikolon als Trennzeichen):
    Username,Item,Menge,Standort       (internationale CSV)
    Username;Item;Menge;Standort       (deutsche Excel-CSV)

    Beispiel:
    Ryze,Aegis Avenger Titan,1,Lorville

    - Username: Discord-Username oder Display-Name
    - Item: Name des Items (muss in der DB existieren)
    - Menge: Anzahl (Integer)
    - Standort: Optional, Name des Standorts
    """
    check_role(current_user, UserRole.ADMIN)

    content = await file.read()
    try:
        text = content.decode('utf-8-sig')  # UTF-8 mit BOM Support
    except UnicodeDecodeError:
        text = content.decode('latin-1')

    reader = create_csv_reader(text)

    success = 0
    errors = []
    warnings = []

    # Cache für User, Items und Locations
    users_cache = {}
    items_cache = {}
    locations_cache = {}

    for row_num, row in enumerate(reader, start=2):  # Start bei 2 (Header ist Zeile 1)
        try:
            # Username extrahieren
            username = row.get('Username', row.get('username', row.get('User', ''))).strip()
            if not username:
                errors.append(f"Zeile {row_num}: Username fehlt")
                continue

            # User finden (mit Cache)
            if username not in users_cache:
                user = db.query(User).filter(
                    (User.username == username) |
                    (User.display_name == username)
                ).first()
                users_cache[username] = user

            user = users_cache[username]
            if not user:
                errors.append(f"Zeile {row_num}: User '{username}' nicht gefunden")
                continue

            # Item extrahieren
            item_name = row.get('Item', row.get('item', row.get('Komponente', ''))).strip()
            if not item_name:
                errors.append(f"Zeile {row_num}: Item-Name fehlt")
                continue

            # Item finden (mit Cache)
            if item_name not in items_cache:
                item = db.query(Component).filter(Component.name == item_name).first()
                items_cache[item_name] = item

            item = items_cache[item_name]
            if not item:
                errors.append(f"Zeile {row_num}: Item '{item_name}' nicht gefunden")
                continue

            # Menge extrahieren
            quantity_str = row.get('Menge', row.get('menge', row.get('Quantity', '1'))).strip()
            try:
                quantity = int(quantity_str)
                if quantity <= 0:
                    raise ValueError("Menge muss positiv sein")
            except ValueError:
                errors.append(f"Zeile {row_num}: Ungültige Menge '{quantity_str}'")
                continue

            # Standort extrahieren (optional)
            location_name = row.get('Standort', row.get('standort', row.get('Location', ''))).strip()
            location = None
            if location_name:
                if location_name not in locations_cache:
                    loc = db.query(Location).filter(Location.name == location_name).first()
                    locations_cache[location_name] = loc

                location = locations_cache[location_name]
                if not location:
                    warnings.append(f"Zeile {row_num}: Standort '{location_name}' nicht gefunden, wird ignoriert")

            # Inventar erstellen oder updaten
            existing = db.query(Inventory).filter(
                Inventory.user_id == user.id,
                Inventory.component_id == item.id,
                Inventory.location_id == (location.id if location else None)
            ).first()

            if existing:
                existing.quantity += quantity
            else:
                new_inventory = Inventory(
                    user_id=user.id,
                    component_id=item.id,
                    quantity=quantity,
                    location_id=location.id if location else None
                )
                db.add(new_inventory)

            success += 1

        except Exception as e:
            errors.append(f"Zeile {row_num}: {str(e)}")

    db.commit()

    return ImportResult(success=success, errors=errors, warnings=warnings)


@router.post("/members", response_model=ImportResult)
async def import_members(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Importiert Staffelmitglieder aus CSV-Datei.

    Erwartetes Format (Komma oder Semikolon als Trennzeichen):
    Username,DisplayName,Rolle         (internationale CSV)
    Username;DisplayName;Rolle         (deutsche Excel-CSV)

    Beispiel:
    ryze,Ryze,officer
    dermando69,Mando,member

    - Username: Eindeutiger Benutzername (Pflicht)
    - DisplayName: Anzeigename in der Staffel (optional)
    - Rolle: member, officer, treasurer, admin (optional, default: member)

    Bestehende User werden anhand des Usernamens aktualisiert.
    Neue User werden ohne Discord-ID angelegt (können sich später via Discord einloggen).
    """
    check_role(current_user, UserRole.ADMIN)

    content = await file.read()
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('latin-1')

    reader = create_csv_reader(text)

    success = 0
    errors = []
    warnings = []

    # Rollen-Mapping
    role_mapping = {
        'member': UserRole.MEMBER,
        'mitglied': UserRole.MEMBER,
        'officer': UserRole.OFFICER,
        'offizier': UserRole.OFFICER,
        'treasurer': UserRole.TREASURER,
        'kassenwart': UserRole.TREASURER,
        'admin': UserRole.ADMIN,
        'administrator': UserRole.ADMIN,
    }

    for row_num, row in enumerate(reader, start=2):
        try:
            # Username extrahieren (Pflicht)
            username = row.get('Username', row.get('username', row.get('Name', ''))).strip()
            if not username:
                errors.append(f"Zeile {row_num}: Username fehlt")
                continue

            if len(username) < 2:
                errors.append(f"Zeile {row_num}: Username zu kurz (min. 2 Zeichen)")
                continue

            # Display-Name extrahieren (optional)
            display_name = row.get('DisplayName', row.get('displayname', row.get('Anzeigename', ''))).strip()
            if not display_name:
                display_name = None

            # Rolle extrahieren (optional, default: member)
            role_str = row.get('Rolle', row.get('rolle', row.get('Role', 'member'))).strip().lower()
            role = role_mapping.get(role_str, UserRole.MEMBER)

            if role_str and role_str not in role_mapping:
                warnings.append(f"Zeile {row_num}: Unbekannte Rolle '{role_str}', verwende 'member'")

            # Prüfen ob User bereits existiert (via Username)
            existing_user = db.query(User).filter(User.username == username).first()

            if existing_user:
                # User aktualisieren
                if display_name:
                    existing_user.display_name = display_name
                existing_user.role = role
                warnings.append(f"Zeile {row_num}: User '{username}' aktualisiert")
            else:
                # Neuen User anlegen (ohne Discord-ID)
                new_user = User(
                    discord_id=None,  # Wird bei Discord-Login nachträglich gesetzt
                    username=username,
                    display_name=display_name,
                    role=role
                )
                db.add(new_user)

            success += 1

        except Exception as e:
            errors.append(f"Zeile {row_num}: {str(e)}")

    db.commit()

    return ImportResult(success=success, errors=errors, warnings=warnings)


@router.post("/treasury", response_model=ImportResult)
async def import_treasury(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Importiert Kassen-Transaktionen aus CSV-Datei.

    Erwartetes Format (Komma oder Semikolon als Trennzeichen):
    Datum,Betrag,Typ,Beschreibung              (internationale CSV)
    Datum;Betrag;Typ;Beschreibung              (deutsche Excel-CSV)

    Beispiel:
    2024-01-15,50000,income,Mitgliedsbeiträge Januar
    2024-01-20,-15000,expense,Schiffsversicherung

    - Datum: YYYY-MM-DD oder DD.MM.YYYY
    - Betrag: Zahl (positiv für Einnahmen, negativ für Ausgaben)
    - Typ: income oder expense (optional, wird aus Vorzeichen abgeleitet)
    - Beschreibung: Text
    """
    check_role(current_user, UserRole.ADMIN)

    content = await file.read()
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('latin-1')

    reader = create_csv_reader(text)

    success = 0
    errors = []
    warnings = []

    for row_num, row in enumerate(reader, start=2):
        try:
            # Datum extrahieren
            date_str = row.get('Datum', row.get('datum', row.get('Date', ''))).strip()
            if not date_str:
                errors.append(f"Zeile {row_num}: Datum fehlt")
                continue

            # Datum parsen (verschiedene Formate)
            date = None
            for fmt in ['%Y-%m-%d', '%d.%m.%Y', '%d/%m/%Y', '%m/%d/%Y']:
                try:
                    date = datetime.strptime(date_str, fmt)
                    break
                except ValueError:
                    continue

            if not date:
                errors.append(f"Zeile {row_num}: Ungültiges Datum '{date_str}'")
                continue

            # Betrag extrahieren
            amount_str = row.get('Betrag', row.get('betrag', row.get('Amount', '0'))).strip()
            amount_str = amount_str.replace(',', '.').replace(' ', '')  # Komma zu Punkt, Leerzeichen entfernen
            try:
                amount = float(amount_str)
            except ValueError:
                errors.append(f"Zeile {row_num}: Ungültiger Betrag '{amount_str}'")
                continue

            # Typ ermitteln
            type_str = row.get('Typ', row.get('typ', row.get('Type', ''))).strip().lower()
            if type_str in ['income', 'einnahme', 'eingang', '+']:
                transaction_type = 'income'
                amount = abs(amount)
            elif type_str in ['expense', 'ausgabe', 'ausgang', '-']:
                transaction_type = 'expense'
                amount = -abs(amount)
            else:
                # Aus Vorzeichen ableiten
                transaction_type = 'income' if amount >= 0 else 'expense'

            # Beschreibung
            description = row.get('Beschreibung', row.get('beschreibung', row.get('Description', ''))).strip()
            if not description:
                description = f"Import vom {datetime.now().strftime('%d.%m.%Y')}"

            # Transaktion erstellen
            transaction = TreasuryTransaction(
                amount=amount,
                type=transaction_type,
                description=description,
                date=date,
                created_by_id=current_user.id
            )
            db.add(transaction)
            success += 1

        except Exception as e:
            errors.append(f"Zeile {row_num}: {str(e)}")

    db.commit()

    return ImportResult(success=success, errors=errors, warnings=warnings)
