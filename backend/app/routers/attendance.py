from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session
from io import BytesIO
import re
import json
import base64

from app.database import get_db
from app.models.user import User, UserRole, UserRequest
from app.models.attendance import AttendanceSession, AttendanceRecord
from app.models.loot import LootSession
from app.schemas.attendance import (
    AttendanceSessionCreate, AttendanceSessionResponse, AttendanceRecordCreate,
    AttendanceSessionUpdate, OCRDataResponse, UserRequestCreate, UserRequestResponse
)
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role
from app.ocr.scanner import extract_names_from_image

router = APIRouter()


def simplify_name(name: str) -> str:
    """Vereinfacht einen Namen für Fuzzy-Matching (entfernt _, -, Leerzeichen)."""
    return re.sub(r'[_\-\s]', '', name.lower())


def match_user_to_name(name: str, users: List[User]) -> Optional[User]:
    """
    Versucht einen OCR-erkannten Namen einem User zuzuordnen.

    Matching-Reihenfolge:
    1. Exakter Match mit username oder display_name
    2. Vereinfachter Match (ohne Sonderzeichen)
    3. Alias-Match (exakt und vereinfacht)
    """
    name_lower = name.lower()
    name_simplified = simplify_name(name)

    for user in users:
        # 1. Exakter Match mit username
        if user.username.lower() == name_lower:
            return user

        # 2. Exakter Match mit display_name
        if user.display_name and user.display_name.lower() == name_lower:
            return user

        # 3. Vereinfachter Match mit username (z.B. "ry-ze" → "ryze")
        if simplify_name(user.username) == name_simplified:
            return user

        # 4. Vereinfachter Match mit display_name
        if user.display_name and simplify_name(user.display_name) == name_simplified:
            return user

        # 5. Alias-Match
        if user.aliases:
            for alias in user.aliases.split(','):
                alias_clean = alias.strip()
                if not alias_clean:
                    continue

                # Exakter Alias-Match
                if alias_clean.lower() == name_lower:
                    return user

                # Vereinfachter Alias-Match
                if simplify_name(alias_clean) == name_simplified:
                    return user

    return None


def session_to_response(session: AttendanceSession) -> dict:
    """Konvertiert eine Session in ein Response-Dict mit zusätzlichen Feldern."""
    return {
        "id": session.id,
        "date": session.date,
        "session_type": session.session_type or "staffelabend",
        "notes": session.notes,
        "created_by": session.created_by,
        "records": session.records,
        "is_confirmed": session.is_confirmed or False,
        "has_screenshot": session.screenshot_data is not None,
        "has_loot_session": session.loot_session is not None,
        "loot_session_id": session.loot_session.id if session.loot_session else None,
        "created_at": session.created_at,
    }


@router.get("", response_model=List[AttendanceSessionResponse])
async def get_sessions(
    limit: int = 20,
    session_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt die letzten Anwesenheits-Sessions zurück. Optional gefiltert nach session_type."""
    query = db.query(AttendanceSession)

    if session_type:
        query = query.filter(AttendanceSession.session_type == session_type)

    sessions = query.order_by(AttendanceSession.date.desc()).limit(limit).all()
    return [session_to_response(s) for s in sessions]


# ===== User-Requests (Anträge für neue User) =====
# WICHTIG: Diese Routen MÜSSEN vor /{session_id} kommen, sonst werden sie als session_id gematcht

@router.get("/user-requests", response_model=List[UserRequestResponse])
async def get_user_requests(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle User-Anträge zurück. Admin sieht alle, andere nur eigene."""
    query = db.query(UserRequest)

    if current_user.role != UserRole.ADMIN:
        query = query.filter(UserRequest.requested_by_id == current_user.id)

    if status_filter:
        query = query.filter(UserRequest.status == status_filter)

    return query.order_by(UserRequest.created_at.desc()).all()


@router.post("/user-requests", response_model=UserRequestResponse)
async def create_user_request(
    request_data: UserRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Erstellt einen Loot-Gast User.
    Offiziere und Admins können direkt LOOT_GUEST User anlegen.
    """
    check_role(current_user, UserRole.OFFICER)

    # Prüfe ob Username bereits existiert
    existing = db.query(User).filter(User.username == request_data.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User '{request_data.username}' existiert bereits"
        )

    # Loot-Gast direkt anlegen (Offiziere und Admins)
    new_user = User(
        username=request_data.username,
        display_name=request_data.display_name,
        role=UserRole.LOOT_GUEST,  # Loot-Gast statt Member
        aliases=request_data.detected_name  # OCR-Name als erster Alias
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Response mit "approved" Status und user_id
    return {
        "id": 0,
        "username": new_user.username,
        "display_name": new_user.display_name,
        "detected_name": request_data.detected_name,
        "requested_by": current_user,
        "status": "approved",
        "created_at": new_user.created_at,
        "user_id": new_user.id
    }


@router.post("/user-requests/{request_id}/approve")
async def approve_user_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Genehmigt einen User-Antrag und legt den User an. Nur Admins."""
    check_role(current_user, UserRole.ADMIN)

    user_request = db.query(UserRequest).filter(UserRequest.id == request_id).first()
    if not user_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Antrag nicht gefunden"
        )

    if user_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Antrag wurde bereits bearbeitet (Status: {user_request.status})"
        )

    # Prüfe ob Username bereits existiert
    existing = db.query(User).filter(User.username == user_request.username).first()
    if existing:
        user_request.status = "rejected"
        user_request.notes = f"User '{user_request.username}' existiert bereits"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User '{user_request.username}' existiert bereits"
        )

    # User anlegen als Loot-Gast
    new_user = User(
        username=user_request.username,
        display_name=user_request.display_name,
        role=UserRole.LOOT_GUEST,
        aliases=user_request.detected_name
    )
    db.add(new_user)

    # Antrag als genehmigt markieren
    user_request.status = "approved"
    db.commit()
    db.refresh(new_user)

    return {
        "message": f"User '{new_user.username}' wurde angelegt",
        "user_id": new_user.id
    }


@router.post("/user-requests/{request_id}/reject")
async def reject_user_request(
    request_id: int,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lehnt einen User-Antrag ab. Nur Admins."""
    check_role(current_user, UserRole.ADMIN)

    user_request = db.query(UserRequest).filter(UserRequest.id == request_id).first()
    if not user_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Antrag nicht gefunden"
        )

    if user_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Antrag wurde bereits bearbeitet (Status: {user_request.status})"
        )

    user_request.status = "rejected"
    user_request.notes = reason
    db.commit()

    return {"message": "Antrag abgelehnt"}


# ===== Session-spezifische Routen =====

@router.get("/{session_id}", response_model=AttendanceSessionResponse)
async def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt eine einzelne Session zurück."""
    session = db.query(AttendanceSession).filter(
        AttendanceSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session nicht gefunden"
        )
    return session_to_response(session)


@router.post("", response_model=AttendanceSessionResponse)
async def create_session(
    session_data: AttendanceSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Erstellt eine neue Anwesenheits-Session. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    # Screenshot dekodieren falls vorhanden
    screenshot_bytes = None
    if session_data.screenshot_base64:
        try:
            screenshot_bytes = base64.b64decode(session_data.screenshot_base64)
        except Exception:
            pass  # Ignoriere ungültige Base64-Daten

    # OCR-Daten als JSON speichern
    ocr_json = None
    if session_data.ocr_data:
        ocr_json = json.dumps(session_data.ocr_data)

    session = AttendanceSession(
        session_type=session_data.session_type,
        notes=session_data.notes,
        created_by_id=current_user.id,
        screenshot_data=screenshot_bytes,
        ocr_data=ocr_json,
        is_confirmed=False  # Session startet als unbestätigt
    )
    db.add(session)
    db.flush()

    # Anwesenheits-Einträge hinzufügen
    for record_data in session_data.records:
        record = AttendanceRecord(
            session_id=session.id,
            user_id=record_data.user_id,
            detected_name=record_data.detected_name
        )
        db.add(record)

    db.commit()
    db.refresh(session)
    return session_to_response(session)


@router.post("/{session_id}/records")
async def add_record(
    session_id: int,
    record_data: AttendanceRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fügt einen Anwesenheits-Eintrag hinzu. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    session = db.query(AttendanceSession).filter(
        AttendanceSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session nicht gefunden"
        )

    record = AttendanceRecord(
        session_id=session_id,
        user_id=record_data.user_id,
        detected_name=record_data.detected_name
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"message": "Eintrag hinzugefügt", "id": record.id}


@router.delete("/{session_id}/records/{record_id}")
async def remove_record(
    session_id: int,
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Entfernt einen Anwesenheits-Eintrag. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.id == record_id,
        AttendanceRecord.session_id == session_id
    ).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Eintrag nicht gefunden"
        )

    db.delete(record)
    db.commit()
    return {"message": "Eintrag entfernt"}


@router.post("/scan")
async def scan_screenshot(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Scannt einen Screenshot und erkennt Namen via OCR.
    Das Bild wird nur im Speicher verarbeitet und danach verworfen.
    """
    check_role(current_user, UserRole.OFFICER)

    # Bildtyp prüfen
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nur Bilddateien sind erlaubt"
        )

    # Bild in Speicher lesen
    image_bytes = await file.read()
    image_buffer = BytesIO(image_bytes)

    # OCR durchführen
    detected_names = extract_names_from_image(image_buffer)

    # Bekannte Benutzer zuordnen mit Fuzzy-Matching
    all_users = db.query(User).all()
    matched_users = []
    unmatched_names = []
    matched_user_ids = set()  # Verhindere doppelte Zuordnungen

    for name in detected_names:
        user = match_user_to_name(name, all_users)

        if user and user.id not in matched_user_ids:
            matched_users.append({
                "user_id": user.id,
                "username": user.username,
                "display_name": user.display_name,
                "detected_name": name,
                "avatar": user.avatar
            })
            matched_user_ids.add(user.id)
        elif not user:
            unmatched_names.append(name)

    # Screenshot als Base64 für Frontend zurückgeben (wird erst bei Session-Erstellung gespeichert)
    screenshot_base64 = base64.b64encode(image_bytes).decode('utf-8')

    return {
        "matched": matched_users,
        "unmatched": unmatched_names,
        "total_detected": len(detected_names),
        "screenshot_base64": screenshot_base64,
        "all_users": [
            {
                "id": u.id,
                "username": u.username,
                "display_name": u.display_name
            }
            for u in all_users
        ]
    }


@router.delete("/{session_id}")
async def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht eine komplette Anwesenheits-Session. Nur Admins."""
    check_role(current_user, UserRole.ADMIN)

    session = db.query(AttendanceSession).filter(
        AttendanceSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session nicht gefunden"
        )

    # Zugehörige Loot-Session auch löschen falls vorhanden
    if session.loot_session:
        db.delete(session.loot_session)

    # Session löschen (Records werden durch CASCADE gelöscht)
    db.delete(session)
    db.commit()

    return {"message": "Session gelöscht"}


@router.patch("/{session_id}", response_model=AttendanceSessionResponse)
async def update_session(
    session_id: int,
    update_data: AttendanceSessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktualisiert eine Session (z.B. bestätigen). Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    session = db.query(AttendanceSession).filter(
        AttendanceSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session nicht gefunden"
        )

    if update_data.notes is not None:
        session.notes = update_data.notes
    if update_data.is_confirmed is not None:
        session.is_confirmed = update_data.is_confirmed
        # Bei Bestätigung: Screenshot löschen um Speicher zu sparen
        if update_data.is_confirmed:
            session.screenshot_data = None

    db.commit()
    db.refresh(session)
    return session_to_response(session)


@router.delete("/{session_id}/screenshot")
async def delete_session_screenshot(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht den Screenshot einer Session (Teilnehmer wurden übernommen)."""
    check_role(current_user, UserRole.OFFICER)

    session = db.query(AttendanceSession).filter(
        AttendanceSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session nicht gefunden"
        )

    session.screenshot_data = None
    db.commit()
    return {"message": "Screenshot gelöscht"}


@router.get("/{session_id}/screenshot")
async def get_session_screenshot(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt den Screenshot einer Session zurück (falls vorhanden)."""
    check_role(current_user, UserRole.OFFICER)

    session = db.query(AttendanceSession).filter(
        AttendanceSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session nicht gefunden"
        )

    if not session.screenshot_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kein Screenshot vorhanden"
        )

    return Response(
        content=session.screenshot_data,
        media_type="image/png"
    )


@router.get("/{session_id}/ocr-data", response_model=OCRDataResponse)
async def get_session_ocr_data(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt die OCR-Daten einer Session zurück für nachträgliche Bearbeitung."""
    check_role(current_user, UserRole.OFFICER)

    session = db.query(AttendanceSession).filter(
        AttendanceSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session nicht gefunden"
        )

    # OCR-Daten parsen
    ocr_data = {"matched": [], "unmatched": []}
    if session.ocr_data:
        try:
            ocr_data = json.loads(session.ocr_data)
        except json.JSONDecodeError:
            pass

    # Aktuelle User-Liste hinzufügen
    all_users = db.query(User).all()

    return {
        "matched": ocr_data.get("matched", []),
        "unmatched": ocr_data.get("unmatched", []),
        "all_users": [
            {
                "id": u.id,
                "username": u.username,
                "display_name": u.display_name
            }
            for u in all_users
        ]
    }
