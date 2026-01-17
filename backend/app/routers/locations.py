from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.location import Location
from app.models.inventory import Inventory
from app.schemas.location import LocationCreate, LocationResponse
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


@router.get("", response_model=List[LocationResponse])
async def get_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Lager-Standorte zurück."""
    return db.query(Location).order_by(Location.name).all()


@router.get("/{location_id}", response_model=LocationResponse)
async def get_location(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt einen einzelnen Standort zurück."""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Standort nicht gefunden"
        )
    return location


@router.post("", response_model=LocationResponse)
async def create_location(
    location: LocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Erstellt einen neuen Standort. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    # Prüfen ob Name bereits existiert
    existing = db.query(Location).filter(Location.name == location.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ein Standort mit diesem Namen existiert bereits"
        )

    db_location = Location(
        name=location.name,
        description=location.description,
        created_by_id=current_user.id
    )
    db.add(db_location)
    db.commit()
    db.refresh(db_location)
    return db_location


@router.patch("/{location_id}", response_model=LocationResponse)
async def update_location(
    location_id: int,
    location: LocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktualisiert einen Standort. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    db_location = db.query(Location).filter(Location.id == location_id).first()
    if not db_location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Standort nicht gefunden"
        )

    # Prüfen ob Name bereits von anderem Standort verwendet wird
    existing = db.query(Location).filter(
        Location.name == location.name,
        Location.id != location_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ein Standort mit diesem Namen existiert bereits"
        )

    db_location.name = location.name
    db_location.description = location.description
    db.commit()
    db.refresh(db_location)
    return db_location


@router.delete("/{location_id}")
async def delete_location(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht einen Standort. Nur Admins. Items werden auf 'kein Ort' gesetzt."""
    check_role(current_user, UserRole.ADMIN)

    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Standort nicht gefunden"
        )

    # Items auf "kein Ort" setzen
    db.query(Inventory).filter(Inventory.location_id == location_id).update(
        {Inventory.location_id: None}
    )

    db.delete(location)
    db.commit()
    return {"message": f"Standort '{location.name}' gelöscht"}


@router.get("/{location_id}/inventory")
async def get_location_inventory(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Items an einem Standort zurück."""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Standort nicht gefunden"
        )

    items = db.query(Inventory).filter(
        Inventory.location_id == location_id,
        Inventory.quantity > 0
    ).all()

    return {
        "location": location,
        "items": items,
        "total_items": sum(item.quantity for item in items)
    }
