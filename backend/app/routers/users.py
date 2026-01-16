from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.user import UserResponse, UserUpdate
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


@router.get("/", response_model=List[UserResponse])
async def get_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Benutzer zurück."""
    return db.query(User).all()


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


@router.get("/officers/", response_model=List[UserResponse])
async def get_officers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Offiziere und höher zurück (für Lager-Übersicht)."""
    return db.query(User).filter(
        User.role.in_([UserRole.OFFICER, UserRole.TREASURER, UserRole.ADMIN])
    ).all()
