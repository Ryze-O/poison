from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.loot import LootSession, LootItem, LootDistribution
from app.models.attendance import AttendanceSession
from app.models.inventory import Inventory
from app.models.component import Component
from app.schemas.loot import LootSessionCreate, LootSessionResponse, LootItemCreate, LootDistributionCreate
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


@router.get("", response_model=List[LootSessionResponse])
async def get_loot_sessions(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt die letzten Loot-Sessions zurück."""
    return db.query(LootSession).order_by(
        LootSession.created_at.desc()
    ).limit(limit).all()


@router.get("/{session_id}", response_model=LootSessionResponse)
async def get_loot_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt eine einzelne Loot-Session zurück."""
    session = db.query(LootSession).filter(LootSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loot-Session nicht gefunden"
        )
    return session


@router.post("", response_model=LootSessionResponse)
async def create_loot_session(
    session_data: LootSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Erstellt eine neue Loot-Session. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    # Anwesenheits-Session prüfen
    attendance = db.query(AttendanceSession).filter(
        AttendanceSession.id == session_data.attendance_session_id
    ).first()
    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anwesenheits-Session nicht gefunden"
        )

    # Prüfen ob bereits eine Loot-Session existiert
    existing = db.query(LootSession).filter(
        LootSession.attendance_session_id == session_data.attendance_session_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Für diese Anwesenheits-Session existiert bereits eine Loot-Session"
        )

    session = LootSession(
        attendance_session_id=session_data.attendance_session_id,
        created_by_id=current_user.id
    )
    db.add(session)
    db.flush()

    # Loot-Items hinzufügen
    for item_data in session_data.items:
        component = db.query(Component).filter(Component.id == item_data.component_id).first()
        if not component:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Komponente {item_data.component_id} nicht gefunden"
            )

        item = LootItem(
            loot_session_id=session.id,
            component_id=item_data.component_id,
            quantity=item_data.quantity
        )
        db.add(item)

    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/items", response_model=LootSessionResponse)
async def add_loot_item(
    session_id: int,
    item_data: LootItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fügt ein Loot-Item zu einer Session hinzu. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    session = db.query(LootSession).filter(LootSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loot-Session nicht gefunden"
        )

    component = db.query(Component).filter(Component.id == item_data.component_id).first()
    if not component:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Komponente nicht gefunden"
        )

    item = LootItem(
        loot_session_id=session_id,
        component_id=item_data.component_id,
        quantity=item_data.quantity
    )
    db.add(item)
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/items/{item_id}/distribute")
async def distribute_loot_item(
    session_id: int,
    item_id: int,
    distribution: LootDistributionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Verteilt ein Loot-Item an einen Spieler. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    item = db.query(LootItem).filter(
        LootItem.id == item_id,
        LootItem.loot_session_id == session_id
    ).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loot-Item nicht gefunden"
        )

    # Prüfen ob genug übrig ist
    already_distributed = sum(d.quantity for d in item.distributions)
    remaining = item.quantity - already_distributed
    if distribution.quantity > remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nur noch {remaining} verfügbar"
        )

    # Verteilung erstellen
    dist = LootDistribution(
        loot_item_id=item_id,
        user_id=distribution.user_id,
        quantity=distribution.quantity
    )
    db.add(dist)

    # Automatisch ins Inventar des Empfängers
    inventory = db.query(Inventory).filter(
        Inventory.user_id == distribution.user_id,
        Inventory.component_id == item.component_id
    ).first()

    if inventory:
        inventory.quantity += distribution.quantity
    else:
        inventory = Inventory(
            user_id=distribution.user_id,
            component_id=item.component_id,
            quantity=distribution.quantity
        )
        db.add(inventory)

    db.commit()

    component = db.query(Component).filter(Component.id == item.component_id).first()
    return {
        "message": f"{distribution.quantity}x {component.name} an Spieler verteilt",
        "remaining": remaining - distribution.quantity
    }


@router.delete("/{session_id}/items/{item_id}")
async def remove_loot_item(
    session_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Entfernt ein Loot-Item. Nur wenn noch nicht verteilt. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    item = db.query(LootItem).filter(
        LootItem.id == item_id,
        LootItem.loot_session_id == session_id
    ).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loot-Item nicht gefunden"
        )

    if item.distributions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kann nicht gelöscht werden - bereits teilweise verteilt"
        )

    db.delete(item)
    db.commit()
    return {"message": "Loot-Item entfernt"}
