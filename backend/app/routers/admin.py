"""
Admin-Router für Datenbank-Management und Export-Funktionen.
Nur für Admins zugänglich.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
import csv
import io
from datetime import datetime
from pathlib import Path

from app.database import get_db
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role
from app.models.user import User, UserRole
from app.models.inventory import Inventory
from app.models.treasury import TreasuryTransaction
from app.models.attendance import AttendanceSession, AttendanceRecord
from app.models.loot import LootSession, LootItem, LootDistribution
from app.models.component import Component
from app.models.location import Location

router = APIRouter()


# ============== Statistiken ==============

@router.get("/stats")
async def get_database_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt Statistiken über alle Tabellen zurück."""
    check_role(current_user, UserRole.ADMIN)

    return {
        "users": db.query(func.count(User.id)).scalar(),
        "inventory_items": db.query(func.count(Inventory.id)).scalar(),
        "treasury_transactions": db.query(func.count(TreasuryTransaction.id)).scalar(),
        "attendance_sessions": db.query(func.count(AttendanceSession.id)).scalar(),
        "loot_sessions": db.query(func.count(LootSession.id)).scalar(),
        "components": db.query(func.count(Component.id)).scalar(),
        "locations": db.query(func.count(Location.id)).scalar(),
    }


# ============== Datenbank-Download ==============

@router.get("/backup/database")
async def download_database(
    current_user: User = Depends(get_current_user)
):
    """Lädt die komplette SQLite-Datenbank herunter."""
    check_role(current_user, UserRole.ADMIN)

    # Pfad zur Datenbank
    db_path = Path("data/poison.db")

    if not db_path.exists():
        raise HTTPException(status_code=404, detail="Datenbank nicht gefunden")

    # Dateiname mit Datum
    filename = f"poison_backup_{datetime.now().strftime('%Y-%m-%d_%H-%M')}.db"

    return FileResponse(
        path=db_path,
        filename=filename,
        media_type="application/octet-stream"
    )


# ============== CSV-Export Funktionen ==============

def create_csv_response(rows: list, headers: list, filename: str) -> StreamingResponse:
    """Erstellt eine CSV-StreamingResponse."""
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')  # Semikolon für deutsche Excel-Kompatibilität
    writer.writerow(headers)
    writer.writerows(rows)

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@router.get("/export/users")
async def export_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exportiert alle Benutzer als CSV."""
    check_role(current_user, UserRole.ADMIN)

    users = db.query(User).all()

    headers = ["id", "username", "display_name", "role", "discord_id", "is_pioneer", "is_treasurer", "created_at"]
    rows = [
        [
            u.id,
            u.username,
            u.display_name or "",
            u.role.value if u.role else "",
            u.discord_id or "",
            "Ja" if u.is_pioneer else "Nein",
            "Ja" if u.is_treasurer else "Nein",
            u.created_at.strftime("%Y-%m-%d %H:%M") if u.created_at else ""
        ]
        for u in users
    ]

    return create_csv_response(rows, headers, f"users_{datetime.now().strftime('%Y-%m-%d')}.csv")


@router.get("/export/inventory")
async def export_inventory(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exportiert das gesamte Inventar als CSV."""
    check_role(current_user, UserRole.ADMIN)

    items = db.query(Inventory).all()

    headers = ["id", "user", "item", "quantity", "location", "created_at"]
    rows = [
        [
            i.id,
            i.user.display_name or i.user.username if i.user else "",
            i.component.name if i.component else "",
            i.quantity,
            i.location.name if i.location else "",
            i.created_at.strftime("%Y-%m-%d %H:%M") if i.created_at else ""
        ]
        for i in items
    ]

    return create_csv_response(rows, headers, f"inventory_{datetime.now().strftime('%Y-%m-%d')}.csv")


@router.get("/export/treasury")
async def export_treasury(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exportiert alle Kassen-Transaktionen als CSV."""
    check_role(current_user, UserRole.ADMIN)

    transactions = db.query(TreasuryTransaction).order_by(TreasuryTransaction.created_at.desc()).all()

    headers = ["id", "datum", "betrag", "typ", "beschreibung", "kategorie", "erstellt_von", "created_at"]
    rows = [
        [
            t.id,
            t.transaction_date.strftime("%Y-%m-%d") if t.transaction_date else "",
            t.amount,
            t.transaction_type.value if t.transaction_type else "",
            t.description or "",
            t.category or "",
            t.created_by.display_name or t.created_by.username if t.created_by else "",
            t.created_at.strftime("%Y-%m-%d %H:%M") if t.created_at else ""
        ]
        for t in transactions
    ]

    return create_csv_response(rows, headers, f"treasury_{datetime.now().strftime('%Y-%m-%d')}.csv")


@router.get("/export/attendance")
async def export_attendance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exportiert alle Staffelabende und Teilnehmer als CSV."""
    check_role(current_user, UserRole.ADMIN)

    records = db.query(AttendanceRecord).join(AttendanceSession).order_by(
        AttendanceSession.session_date.desc()
    ).all()

    headers = ["session_id", "session_datum", "session_titel", "user", "anwesend", "notizen"]
    rows = [
        [
            r.session_id,
            r.session.session_date.strftime("%Y-%m-%d") if r.session and r.session.session_date else "",
            r.session.title if r.session else "",
            r.user.display_name or r.user.username if r.user else r.unassigned_name or "",
            "Ja",
            r.notes or ""
        ]
        for r in records
    ]

    return create_csv_response(rows, headers, f"attendance_{datetime.now().strftime('%Y-%m-%d')}.csv")


@router.get("/export/loot")
async def export_loot(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exportiert alle Loot-Sessions und Verteilungen als CSV."""
    check_role(current_user, UserRole.ADMIN)

    distributions = db.query(LootDistribution).join(LootItem).join(LootSession).order_by(
        LootSession.session_date.desc()
    ).all()

    headers = ["session_id", "session_datum", "item", "empfaenger", "menge", "notizen"]
    rows = [
        [
            d.loot_item.session_id if d.loot_item else "",
            d.loot_item.session.session_date.strftime("%Y-%m-%d") if d.loot_item and d.loot_item.session and d.loot_item.session.session_date else "",
            d.loot_item.component.name if d.loot_item and d.loot_item.component else d.loot_item.custom_item_name if d.loot_item else "",
            d.user.display_name or d.user.username if d.user else "",
            d.quantity,
            d.notes or ""
        ]
        for d in distributions
    ]

    return create_csv_response(rows, headers, f"loot_{datetime.now().strftime('%Y-%m-%d')}.csv")
