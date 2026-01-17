"""
Admin-Router für Star Citizen Daten-Import.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.component import Component, SCLocation
from app.schemas.component import (
    ComponentResponse,
    SCLocationResponse,
    SCImportStats
)
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role
from app.services.sc_import import run_sc_import

router = APIRouter()


@router.post("/sync", response_model=SCImportStats)
def sync_sc_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Synchronisiert Star Citizen Daten von der Wiki-API.
    Nur Admins können diesen Endpunkt aufrufen.
    """
    check_role(current_user, UserRole.ADMIN)

    try:
        stats = run_sc_import(db)
        return stats
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import fehlgeschlagen: {str(e)}"
        )


@router.get("/stats")
async def get_import_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt Statistiken über importierte SC-Daten zurück."""
    check_role(current_user, UserRole.ADMIN)

    # Zähle Komponenten nach Kategorie
    component_counts = {}
    categories = db.query(Component.category).distinct().filter(
        Component.category.isnot(None)
    ).all()

    for (cat,) in categories:
        count = db.query(Component).filter(Component.category == cat).count()
        component_counts[cat] = count

    # Zähle Locations
    location_count = db.query(SCLocation).count()

    # Hole letzte Version
    latest = db.query(Component.sc_version).filter(
        Component.sc_version.isnot(None)
    ).first()

    return {
        "total_components": db.query(Component).filter(Component.is_predefined == True).count(),
        "components_by_category": component_counts,
        "total_locations": location_count,
        "sc_version": latest[0] if latest else None
    }


@router.get("/locations", response_model=List[SCLocationResponse])
async def get_sc_locations(
    system: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle importierten SC-Locations zurück."""
    query = db.query(SCLocation)

    if system:
        query = query.filter(SCLocation.system_name == system)

    return query.order_by(SCLocation.system_name, SCLocation.name).all()


@router.get("/locations/systems")
async def get_sc_systems(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle verfügbaren Sternensysteme zurück."""
    systems = db.query(SCLocation.system_name).distinct().filter(
        SCLocation.system_name.isnot(None)
    ).all()
    return [s[0] for s in systems]
