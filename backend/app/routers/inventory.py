from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.inventory import Inventory, InventoryTransfer
from app.models.inventory_log import InventoryLog, InventoryAction
from app.models.component import Component
from app.models.location import Location
from app.schemas.inventory import (
    InventoryResponse, InventoryUpdate, TransferCreate, TransferResponse,
    InventoryLogResponse, BulkLocationTransfer
)
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


def log_inventory_change(
    db: Session,
    user_id: int,
    component_id: int,
    action: InventoryAction,
    quantity: int,
    quantity_before: int,
    quantity_after: int,
    related_user_id: int = None,
    notes: str = None
):
    """Protokolliert eine Lager-Änderung."""
    log = InventoryLog(
        user_id=user_id,
        component_id=component_id,
        action=action,
        quantity=quantity,
        quantity_before=quantity_before,
        quantity_after=quantity_after,
        related_user_id=related_user_id,
        notes=notes
    )
    db.add(log)


@router.get("/", response_model=List[InventoryResponse])
async def get_all_inventory(
    user_id: Optional[int] = None,
    location_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt das Lager zurück. Optional gefiltert nach Benutzer und/oder Standort."""
    query = db.query(Inventory).filter(Inventory.quantity > 0)
    if user_id:
        query = query.filter(Inventory.user_id == user_id)
    if location_id is not None:
        if location_id == 0:
            # 0 = Items ohne Standort
            query = query.filter(Inventory.location_id.is_(None))
        else:
            query = query.filter(Inventory.location_id == location_id)
    return query.all()


@router.get("/my", response_model=List[InventoryResponse])
async def get_my_inventory(
    location_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt das eigene Lager zurück. Optional gefiltert nach Standort."""
    query = db.query(Inventory).filter(
        Inventory.user_id == current_user.id,
        Inventory.quantity > 0
    )
    if location_id is not None:
        if location_id == 0:
            query = query.filter(Inventory.location_id.is_(None))
        else:
            query = query.filter(Inventory.location_id == location_id)
    return query.all()


@router.get("/history", response_model=List[InventoryLogResponse])
async def get_inventory_history(
    user_id: Optional[int] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt die Lager-Historie zurück. Offiziere sehen nur eigene, Admins sehen alle."""
    query = db.query(InventoryLog)

    if user_id:
        # Spezifischer Benutzer angefragt
        if user_id != current_user.id:
            check_role(current_user, UserRole.ADMIN)
        query = query.filter(InventoryLog.user_id == user_id)
    elif not current_user.has_permission(UserRole.ADMIN):
        # Nicht-Admin sieht nur eigene Historie
        query = query.filter(InventoryLog.user_id == current_user.id)

    return query.order_by(InventoryLog.created_at.desc()).limit(limit).all()


@router.post("/{component_id}/add")
async def add_to_inventory(
    component_id: int,
    quantity: int = 1,
    location_id: Optional[int] = None,
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

    # Location prüfen (falls angegeben)
    if location_id:
        location = db.query(Location).filter(Location.id == location_id).first()
        if not location:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Standort nicht gefunden"
            )

    # Inventar-Eintrag suchen oder erstellen (mit Location)
    inventory = db.query(Inventory).filter(
        Inventory.user_id == current_user.id,
        Inventory.component_id == component_id,
        Inventory.location_id == location_id
    ).first()

    quantity_before = inventory.quantity if inventory else 0

    if inventory:
        inventory.quantity += quantity
    else:
        inventory = Inventory(
            user_id=current_user.id,
            component_id=component_id,
            location_id=location_id,
            quantity=quantity
        )
        db.add(inventory)
        db.flush()

    # Historie loggen
    log_inventory_change(
        db=db,
        user_id=current_user.id,
        component_id=component_id,
        action=InventoryAction.ADD,
        quantity=quantity,
        quantity_before=quantity_before,
        quantity_after=inventory.quantity
    )

    db.commit()
    db.refresh(inventory)
    return {"message": f"{quantity}x {component.name} hinzugefügt", "new_quantity": inventory.quantity}


@router.post("/{component_id}/remove")
async def remove_from_inventory(
    component_id: int,
    quantity: int = 1,
    location_id: Optional[int] = None,
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
        Inventory.component_id == component_id,
        Inventory.location_id == location_id
    ).first()

    if not inventory or inventory.quantity < quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nicht genug Komponenten auf Lager"
        )

    quantity_before = inventory.quantity
    inventory.quantity -= quantity

    # Historie loggen
    log_inventory_change(
        db=db,
        user_id=current_user.id,
        component_id=component_id,
        action=InventoryAction.REMOVE,
        quantity=-quantity,
        quantity_before=quantity_before,
        quantity_after=inventory.quantity
    )

    db.commit()
    db.refresh(inventory)

    component = db.query(Component).filter(Component.id == component_id).first()
    return {"message": f"{quantity}x {component.name} entfernt", "new_quantity": inventory.quantity}


@router.post("/{inventory_id}/set-location")
async def set_item_location(
    inventory_id: int,
    location_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Setzt den Standort eines Inventory-Items. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    inventory = db.query(Inventory).filter(Inventory.id == inventory_id).first()
    if not inventory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item nicht gefunden"
        )

    # Nur eigene Items oder Admin
    if inventory.user_id != current_user.id:
        check_role(current_user, UserRole.ADMIN)

    # Location prüfen (falls angegeben)
    if location_id:
        location = db.query(Location).filter(Location.id == location_id).first()
        if not location:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Standort nicht gefunden"
            )

    inventory.location_id = location_id
    db.commit()
    return {"message": "Standort aktualisiert"}


@router.post("/bulk-move-location")
async def bulk_move_location(
    transfer: BulkLocationTransfer,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Verschiebt alle eigenen Items von einem Standort zu einem anderen. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    # Ziel-Location prüfen (falls angegeben)
    if transfer.to_location_id:
        to_location = db.query(Location).filter(Location.id == transfer.to_location_id).first()
        if not to_location:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ziel-Standort nicht gefunden"
            )

    # Alle Items am Quell-Standort finden
    query = db.query(Inventory).filter(
        Inventory.user_id == current_user.id,
        Inventory.quantity > 0
    )

    if transfer.from_location_id is None:
        query = query.filter(Inventory.location_id.is_(None))
    else:
        query = query.filter(Inventory.location_id == transfer.from_location_id)

    items = query.all()

    if not items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Keine Items am Quell-Standort gefunden"
        )

    # Items mit gleichem Ziel zusammenführen oder verschieben
    moved_count = 0
    for item in items:
        # Prüfen ob am Ziel bereits ein Eintrag existiert
        existing = db.query(Inventory).filter(
            Inventory.user_id == current_user.id,
            Inventory.component_id == item.component_id,
            Inventory.location_id == transfer.to_location_id
        ).first()

        if existing and existing.id != item.id:
            # Zusammenführen
            existing.quantity += item.quantity
            item.quantity = 0
        else:
            # Einfach verschieben
            item.location_id = transfer.to_location_id

        moved_count += 1

    db.commit()

    from_name = "Ohne Standort"
    to_name = "Ohne Standort"
    if transfer.from_location_id:
        from_loc = db.query(Location).filter(Location.id == transfer.from_location_id).first()
        from_name = from_loc.name if from_loc else "Unbekannt"
    if transfer.to_location_id:
        to_loc = db.query(Location).filter(Location.id == transfer.to_location_id).first()
        to_name = to_loc.name if to_loc else "Unbekannt"

    return {
        "message": f"{moved_count} Item-Typen von '{from_name}' nach '{to_name}' verschoben",
        "moved_count": moved_count
    }


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

    # Eigenes Inventar prüfen (Komponente, egal welcher Standort)
    from_inventory = db.query(Inventory).filter(
        Inventory.user_id == current_user.id,
        Inventory.component_id == transfer.component_id,
        Inventory.quantity >= transfer.quantity
    ).first()

    if not from_inventory:
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

    # Ziel-Location prüfen (falls angegeben)
    if transfer.to_location_id:
        to_location = db.query(Location).filter(Location.id == transfer.to_location_id).first()
        if not to_location:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ziel-Standort nicht gefunden"
            )

    # Mengen vorher speichern
    from_quantity_before = from_inventory.quantity
    from_location_id = from_inventory.location_id

    to_inventory = db.query(Inventory).filter(
        Inventory.user_id == transfer.to_user_id,
        Inventory.component_id == transfer.component_id,
        Inventory.location_id == transfer.to_location_id
    ).first()
    to_quantity_before = to_inventory.quantity if to_inventory else 0

    # Transfer durchführen
    from_inventory.quantity -= transfer.quantity

    if to_inventory:
        to_inventory.quantity += transfer.quantity
    else:
        to_inventory = Inventory(
            user_id=transfer.to_user_id,
            component_id=transfer.component_id,
            location_id=transfer.to_location_id,
            quantity=transfer.quantity
        )
        db.add(to_inventory)
        db.flush()

    # Transfer protokollieren
    transfer_record = InventoryTransfer(
        from_user_id=current_user.id,
        to_user_id=transfer.to_user_id,
        component_id=transfer.component_id,
        from_location_id=from_location_id,
        to_location_id=transfer.to_location_id,
        quantity=transfer.quantity,
        notes=transfer.notes
    )
    db.add(transfer_record)

    # Historie für Sender
    log_inventory_change(
        db=db,
        user_id=current_user.id,
        component_id=transfer.component_id,
        action=InventoryAction.TRANSFER_OUT,
        quantity=-transfer.quantity,
        quantity_before=from_quantity_before,
        quantity_after=from_inventory.quantity,
        related_user_id=transfer.to_user_id,
        notes=transfer.notes
    )

    # Historie für Empfänger
    log_inventory_change(
        db=db,
        user_id=transfer.to_user_id,
        component_id=transfer.component_id,
        action=InventoryAction.TRANSFER_IN,
        quantity=transfer.quantity,
        quantity_before=to_quantity_before,
        quantity_after=to_inventory.quantity,
        related_user_id=current_user.id,
        notes=transfer.notes
    )

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
