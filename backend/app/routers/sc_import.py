"""
Admin-Router für Star Citizen Daten-Import.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.component import Component, SCLocation
from app.models.item_price import ItemPrice, UEXSyncLog
from app.schemas.component import (
    ComponentResponse,
    SCLocationResponse,
    SCImportStats,
    ItemPriceResponse,
    UEXSyncStats
)
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role
from app.services.sc_import import run_sc_import
from app.services.uex_import import run_uex_import

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


# ============= UEX API Endpoints =============

@router.post("/uex/sync", response_model=UEXSyncStats)
def sync_uex_prices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Synchronisiert Preisdaten von der UEX API (uexcorp.space).
    Nur Admins können diesen Endpunkt aufrufen.
    """
    check_role(current_user, UserRole.ADMIN)

    try:
        log = run_uex_import(db)
        return log
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"UEX Import fehlgeschlagen: {str(e)}"
        )


@router.get("/uex/stats", response_model=UEXSyncStats)
async def get_uex_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt Statistiken über den letzten UEX-Sync zurück."""
    # Letzter erfolgreicher Sync
    last_sync = db.query(UEXSyncLog).order_by(
        UEXSyncLog.started_at.desc()
    ).first()

    if not last_sync:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Noch kein UEX-Sync durchgeführt"
        )

    return last_sync


@router.get("/uex/prices", response_model=List[ItemPriceResponse])
async def get_all_prices(
    terminal: str = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Preise zurück, optional gefiltert nach Terminal."""
    query = db.query(ItemPrice)

    if terminal:
        query = query.filter(ItemPrice.terminal_name.ilike(f"%{terminal}%"))

    return query.limit(limit).all()


@router.get("/items/{component_id}/prices", response_model=List[ItemPriceResponse])
async def get_component_prices(
    component_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Preise/Shops für eine Komponente zurück."""
    # Prüfe ob Komponente existiert
    component = db.query(Component).filter(Component.id == component_id).first()
    if not component:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Komponente nicht gefunden"
        )

    prices = db.query(ItemPrice).filter(
        ItemPrice.component_id == component_id
    ).order_by(ItemPrice.price_buy.asc()).all()

    return prices


@router.get("/uex/terminals")
async def get_terminals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle verfügbaren Terminals/Shops zurück."""
    terminals = db.query(ItemPrice.terminal_name).distinct().order_by(
        ItemPrice.terminal_name
    ).all()
    return [t[0] for t in terminals]
