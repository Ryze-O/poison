from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.user import UserResponse, UserUpdate
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


@router.get("", response_model=List[UserResponse])
async def get_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Benutzer zurück."""
    return db.query(User).all()


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Gibt den aktuell eingeloggten Benutzer zurück."""
    return current_user


@router.get("/officers", response_model=List[UserResponse])
async def get_officers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Offiziere und höher zurück (für Lager-Übersicht)."""
    return db.query(User).filter(
        User.role.in_([UserRole.OFFICER, UserRole.TREASURER, UserRole.ADMIN])
    ).all()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt einen einzelnen Benutzer zurück."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktualisiert einen Benutzer. Nur Admins können Rollen ändern."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    # Eigenen Display-Namen darf jeder ändern
    if user_update.display_name is not None:
        if user.id != current_user.id:
            check_role(current_user, UserRole.ADMIN)
        user.display_name = user_update.display_name

    # Rollen dürfen nur Admins ändern
    if user_update.role is not None:
        check_role(current_user, UserRole.ADMIN)
        user.role = user_update.role

    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/aliases")
async def add_alias(
    user_id: int,
    alias: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fügt einen OCR-Alias zu einem Benutzer hinzu.
    Aliase werden für das automatische Matching bei der Anwesenheitserfassung verwendet.
    Nur Offiziere+ können Aliase hinzufügen.
    """
    check_role(current_user, UserRole.OFFICER)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    # Alias bereinigen
    alias = alias.strip()
    if not alias or len(alias) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Alias muss mindestens 2 Zeichen lang sein"
        )

    # Bestehende Aliase laden
    existing = user.aliases.split(',') if user.aliases else []
    existing = [a.strip() for a in existing if a.strip()]

    # Prüfen ob Alias bereits existiert (case-insensitive)
    if any(a.lower() == alias.lower() for a in existing):
        return {"message": "Alias existiert bereits", "aliases": existing}

    # Alias hinzufügen
    existing.append(alias)
    user.aliases = ','.join(existing)

    db.commit()
    return {"message": "Alias hinzugefügt", "aliases": existing}


@router.delete("/{user_id}/aliases/{alias}")
async def remove_alias(
    user_id: int,
    alias: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Entfernt einen OCR-Alias von einem Benutzer."""
    check_role(current_user, UserRole.OFFICER)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    if not user.aliases:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer hat keine Aliase"
        )

    # Alias entfernen (case-insensitive)
    existing = user.aliases.split(',')
    existing = [a.strip() for a in existing if a.strip()]
    new_aliases = [a for a in existing if a.lower() != alias.lower()]

    if len(new_aliases) == len(existing):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alias nicht gefunden"
        )

    user.aliases = ','.join(new_aliases) if new_aliases else None
    db.commit()

    return {"message": "Alias entfernt", "aliases": new_aliases}


@router.get("/{user_id}/aliases")
async def get_aliases(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle OCR-Aliase eines Benutzers zurück."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    aliases = user.aliases.split(',') if user.aliases else []
    aliases = [a.strip() for a in aliases if a.strip()]

    return {"user_id": user_id, "aliases": aliases}
