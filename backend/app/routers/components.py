from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.component import Component
from app.schemas.component import ComponentCreate, ComponentResponse
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


@router.get("", response_model=List[ComponentResponse])
async def get_components(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Komponenten zurück, optional gefiltert nach Kategorie."""
    query = db.query(Component)
    if category:
        query = query.filter(Component.category == category)
    return query.order_by(Component.category, Component.name).all()


@router.get("/categories")
async def get_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle verfügbaren Kategorien zurück."""
    categories = db.query(Component.category).distinct().filter(
        Component.category.isnot(None)
    ).all()
    return [c[0] for c in categories]


@router.get("/manufacturers")
async def get_manufacturers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle verfügbaren Hersteller zurück."""
    manufacturers = db.query(Component.manufacturer).distinct().filter(
        Component.manufacturer.isnot(None)
    ).order_by(Component.manufacturer).all()
    return [m[0] for m in manufacturers]


@router.post("", response_model=ComponentResponse)
async def create_component(
    component: ComponentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Erstellt eine neue Komponente. Nur Offiziere+ können das."""
    check_role(current_user, UserRole.OFFICER)

    # Prüfen ob Komponente bereits existiert
    existing = db.query(Component).filter(Component.name == component.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Eine Komponente mit diesem Namen existiert bereits"
        )

    db_component = Component(**component.model_dump())
    db.add(db_component)
    db.commit()
    db.refresh(db_component)
    return db_component


@router.delete("/{component_id}")
async def delete_component(
    component_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht eine Komponente. Nur Admins können das, und nur nicht-vordefinierte."""
    check_role(current_user, UserRole.ADMIN)

    component = db.query(Component).filter(Component.id == component_id).first()
    if not component:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Komponente nicht gefunden"
        )

    if component.is_predefined:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vordefinierte Komponenten können nicht gelöscht werden"
        )

    db.delete(component)
    db.commit()
    return {"message": "Komponente gelöscht"}
