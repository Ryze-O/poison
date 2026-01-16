from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.inventory import Inventory, InventoryTransfer
from app.models.component import Component
from app.schemas.inventory import InventoryResponse, InventoryUpdate, TransferCreate, TransferResponse
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


@router.get("/", response_model=List[InventoryResponse])
async def get_all_inventory(
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt das Lager zurück. Optional gefiltert nach Benutzer."""
    query = db.query(Inventory).filter(Inventory.quantity > 0)
    if user_id:
        query = query.filter(Inventory.user_id == user_id)
    return query.all()


@router.get("/my", response_model=List[InventoryResponse])
async def get_my_inventory(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt das eigene Lager zurück."""
    return db.query(Inventory).filter(
        Inventory.user_id == current_user.id,
        Inventory.quantity > 0
    ).all()


@router.post("/{component_id}/add")
async def add_to_inventory(
    component_id: int,
    quantity: int = 1,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fügt Komponenten zum eigenen Lager hinzu. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    if quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Menge muss positiv sein"
        )

    # Komponente prüfen
    component = db.query(Component).filter(Component.id == component_id).first()
    if not component:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Komponente nicht gefunden"
        )

    # Inventar-Eintrag suchen oder erstellen
    inventory = db.query(Inventory).filter(
        Inventory.user_id == current_user.id,
        Inventory.component_id == component_id
    ).first()

    if inventory:
        inventory.quantity += quantity
    else:
        inventory = Inventory(
            user_id=current_user.id,
            component_id=component_id,
            quantity=quantity
        )
        db.add(inventory)

    db.commit()
    db.refresh(inventory)
    return {"message": f"{quantity}x {component.name} hinzugefügt", "new_quantity": inventory.quantity}


@router.post("/{component_id}/remove")
async def remove_from_inventory(
    component_id: int,
    quantity: int = 1,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Entfernt Komponenten aus dem eigenen Lager. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    if quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Menge muss positiv sein"
        )

    inventory = db.query(Inventory).filter(
        Inventory.user_id == current_user.id,
        Inventory.component_id == component_id
    ).first()

    if not inventory or inventory.quantity < quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nicht genug Komponenten auf Lager"
        )

    inventory.quantity -= quantity
    db.commit()
    db.refresh(inventory)

    component = db.query(Component).filter(Component.id == component_id).first()
    return {"message": f"{quantity}x {component.name} entfernt", "new_quantity": inventory.quantity}


@router.post("/transfer", response_model=TransferResponse)
async def transfer_components(
    transfer: TransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Transferiert Komponenten zu einem anderen Benutzer. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    if transfer.quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Menge muss positiv sein"
        )

    # Eigenes Inventar prüfen
    from_inventory = db.query(Inventory).filter(
        Inventory.user_id == current_user.id,
        Inventory.component_id == transfer.component_id
    ).first()

    if not from_inventory or from_inventory.quantity < transfer.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nicht genug Komponenten auf Lager"
        )

    # Ziel-Benutzer prüfen
    to_user = db.query(User).filter(User.id == transfer.to_user_id).first()
    if not to_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ziel-Benutzer nicht gefunden"
        )

    # Komponente prüfen
    component = db.query(Component).filter(Component.id == transfer.component_id).first()
    if not component:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Komponente nicht gefunden"
        )

    # Transfer durchführen
    from_inventory.quantity -= transfer.quantity

    to_inventory = db.query(Inventory).filter(
        Inventory.user_id == transfer.to_user_id,
        Inventory.component_id == transfer.component_id
    ).first()

    if to_inventory:
        to_inventory.quantity += transfer.quantity
    else:
        to_inventory = Inventory(
            user_id=transfer.to_user_id,
            component_id=transfer.component_id,
            quantity=transfer.quantity
        )
        db.add(to_inventory)

    # Transfer protokollieren
    transfer_record = InventoryTransfer(
        from_user_id=current_user.id,
        to_user_id=transfer.to_user_id,
        component_id=transfer.component_id,
        quantity=transfer.quantity,
        notes=transfer.notes
    )
    db.add(transfer_record)

    db.commit()
    db.refresh(transfer_record)
    return transfer_record


@router.get("/transfers", response_model=List[TransferResponse])
async def get_transfers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Transfers zurück, an denen der aktuelle Benutzer beteiligt ist."""
    return db.query(InventoryTransfer).filter(
        (InventoryTransfer.from_user_id == current_user.id) |
        (InventoryTransfer.to_user_id == current_user.id)
    ).order_by(InventoryTransfer.created_at.desc()).all()
