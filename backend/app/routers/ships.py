"""
User Ships Router

API-Endpoints für User-Schiffe (Flotten-Management).
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.mission import UserShip
from app.schemas.mission import UserShipCreate, UserShipUpdate, UserShipResponse
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


# ============== Own Ships ==============

@router.get("/me/ships", response_model=List[UserShipResponse])
async def get_my_ships(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt die eigenen Schiffe zurück."""
    return db.query(UserShip).filter(UserShip.user_id == current_user.id).order_by(UserShip.ship_name).all()


@router.post("/me/ships", response_model=UserShipResponse)
async def add_my_ship(
    ship_data: UserShipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fügt ein eigenes Schiff hinzu."""
    ship = UserShip(
        user_id=current_user.id,
        ship_name=ship_data.ship_name,
        is_fitted=ship_data.is_fitted,
        loadout_notes=ship_data.loadout_notes,
    )
    db.add(ship)
    db.commit()
    db.refresh(ship)
    return ship


@router.patch("/me/ships/{ship_id}", response_model=UserShipResponse)
async def update_my_ship(
    ship_id: int,
    ship_data: UserShipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktualisiert ein eigenes Schiff."""
    ship = db.query(UserShip).filter(
        UserShip.id == ship_id,
        UserShip.user_id == current_user.id
    ).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Schiff nicht gefunden")

    if ship_data.ship_name is not None:
        ship.ship_name = ship_data.ship_name
    if ship_data.is_fitted is not None:
        ship.is_fitted = ship_data.is_fitted
    if ship_data.loadout_notes is not None:
        ship.loadout_notes = ship_data.loadout_notes

    db.commit()
    db.refresh(ship)
    return ship


@router.delete("/me/ships/{ship_id}")
async def delete_my_ship(
    ship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht ein eigenes Schiff."""
    ship = db.query(UserShip).filter(
        UserShip.id == ship_id,
        UserShip.user_id == current_user.id
    ).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Schiff nicht gefunden")

    db.delete(ship)
    db.commit()
    return {"message": "Schiff gelöscht"}


# ============== View Other User's Ships (for Mission Planning) ==============

@router.get("/{user_id}/ships", response_model=List[UserShipResponse])
async def get_user_ships(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt die Schiffe eines anderen Users zurück. Nur für Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User nicht gefunden")

    return db.query(UserShip).filter(UserShip.user_id == user_id).order_by(UserShip.ship_name).all()
