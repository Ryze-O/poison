from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from io import BytesIO

from app.database import get_db
from app.models.user import User, UserRole
from app.models.attendance import AttendanceSession, AttendanceRecord
from app.schemas.attendance import AttendanceSessionCreate, AttendanceSessionResponse, AttendanceRecordCreate
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role
from app.ocr.scanner import extract_names_from_image

router = APIRouter()


@router.get("/", response_model=List[AttendanceSessionResponse])
async def get_sessions(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt die letzten Anwesenheits-Sessions zurück."""
    return db.query(AttendanceSession).order_by(
        AttendanceSession.date.desc()
    ).limit(limit).all()


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
    return session


@router.post("/", response_model=AttendanceSessionResponse)
async def create_session(
    session_data: AttendanceSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Erstellt eine neue Anwesenheits-Session. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    session = AttendanceSession(
        notes=session_data.notes,
        created_by_id=current_user.id
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
    return session


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

    # Bekannte Benutzer zuordnen
    all_users = db.query(User).all()
    matched_users = []
    unmatched_names = []

    for name in detected_names:
        name_lower = name.lower()
        matched = False
        for user in all_users:
            if (user.username.lower() == name_lower or
                (user.display_name and user.display_name.lower() == name_lower)):
                matched_users.append({
                    "user_id": user.id,
                    "username": user.username,
                    "display_name": user.display_name,
                    "detected_name": name
                })
                matched = True
                break
        if not matched:
            unmatched_names.append(name)

    # Bild wird nicht gespeichert - Buffer wird nach Request verworfen

    return {
        "matched": matched_users,
        "unmatched": unmatched_names,
        "total_detected": len(detected_names)
    }
