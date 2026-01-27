from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models.user import User, UserRole
from app.models.inventory import Inventory, InventoryTransfer, TransferRequest, TransferRequestStatus
from app.models.inventory_log import InventoryLog, InventoryAction
from app.models.component import Component
from app.models.location import Location
from app.schemas.inventory import (
    InventoryResponse, InventoryUpdate, TransferCreate, TransferResponse,
    InventoryLogResponse, BulkLocationTransfer, BulkTransferToOfficer, PatchResetRequest,
    TransferRequestCreate, TransferRequestResponse, TransferRequestReject
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


@router.get("", response_model=List[InventoryResponse])
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


@router.post("/{item_id}/move-location")
async def move_item_location(
    item_id: int,
    to_location_id: Optional[int] = None,
    quantity: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Verschiebt ein Item (oder Teil davon) an einen anderen Standort. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    # Item finden
    item = db.query(Inventory).filter(
        Inventory.id == item_id,
        Inventory.user_id == current_user.id,
        Inventory.quantity > 0
    ).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item nicht gefunden oder gehört nicht dir"
        )

    # Ziel-Location prüfen (falls angegeben)
    if to_location_id:
        to_location = db.query(Location).filter(Location.id == to_location_id).first()
        if not to_location:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ziel-Standort nicht gefunden"
            )

    # Menge bestimmen (Standard: alles verschieben)
    move_quantity = quantity if quantity else item.quantity
    if move_quantity > item.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nicht genug Items vorhanden. Verfügbar: {item.quantity}"
        )

    # Standort-Namen für Log
    from_name = item.location.name if item.location else "Ohne Standort"
    to_name = to_location.name if to_location_id and to_location else "Ohne Standort"

    # Prüfen ob am Ziel bereits ein Eintrag existiert
    existing = db.query(Inventory).filter(
        Inventory.user_id == current_user.id,
        Inventory.component_id == item.component_id,
        Inventory.location_id == to_location_id
    ).first()

    if existing and existing.id != item.id:
        # Zusammenführen
        existing.quantity += move_quantity
        item.quantity -= move_quantity
        if item.quantity <= 0:
            db.delete(item)
    else:
        # Teilen oder komplett verschieben
        if move_quantity < item.quantity:
            # Teilen: neuen Eintrag erstellen
            new_item = Inventory(
                user_id=current_user.id,
                component_id=item.component_id,
                location_id=to_location_id,
                quantity=move_quantity
            )
            db.add(new_item)
            item.quantity -= move_quantity
        else:
            # Komplett verschieben
            item.location_id = to_location_id

    db.commit()

    return {
        "message": f"{move_quantity}x {item.component.name} von '{from_name}' nach '{to_name}' verschoben"
    }


@router.post("/patch-reset")
async def patch_reset(
    request: PatchResetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Nach einem Patch: Nicht mehr vorhandene Items entfernen,
    verbliebene Items an neue Homelocation verschieben.
    Nur Offiziere+.
    """
    check_role(current_user, UserRole.OFFICER)

    # Neue Location prüfen
    new_location = db.query(Location).filter(Location.id == request.new_location_id).first()
    if not new_location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Neue Location nicht gefunden"
        )

    # Alle eigenen Items laden
    all_items = db.query(Inventory).filter(
        Inventory.user_id == current_user.id,
        Inventory.quantity > 0
    ).all()

    if not all_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Keine Items im Inventar"
        )

    kept_ids = set(request.kept_item_ids)
    removed_count = 0
    moved_count = 0
    total_kept = 0

    for item in all_items:
        if item.id in kept_ids:
            # Item behalten und an neue Location verschieben
            quantity = item.quantity
            total_kept += quantity

            # Prüfen ob am Ziel bereits ein Eintrag existiert
            existing = db.query(Inventory).filter(
                Inventory.user_id == current_user.id,
                Inventory.component_id == item.component_id,
                Inventory.location_id == request.new_location_id
            ).first()

            if existing and existing.id != item.id:
                # Zusammenführen
                existing.quantity += item.quantity
                item.quantity = 0
            else:
                # Verschieben
                item.location_id = request.new_location_id

            moved_count += 1

            # Log: Patch-Move
            log_inventory_change(
                db=db,
                user_id=current_user.id,
                component_id=item.component_id,
                action=InventoryAction.ADD,  # Als "Add" loggen mit Note
                quantity=0,
                quantity_before=quantity,
                quantity_after=quantity,
                notes=f"Patch-Reset: Verschoben nach {new_location.name}"
            )
        else:
            # Item verloren (Patch-Wipe)
            quantity_before = item.quantity

            # Log: Patch-Verlust
            log_inventory_change(
                db=db,
                user_id=current_user.id,
                component_id=item.component_id,
                action=InventoryAction.REMOVE,
                quantity=-item.quantity,
                quantity_before=quantity_before,
                quantity_after=0,
                notes="Patch-Reset: Item verloren"
            )

            item.quantity = 0
            removed_count += 1

    db.commit()

    return {
        "message": f"Patch-Reset abgeschlossen: {moved_count} Item-Typen ({total_kept} Stück) nach '{new_location.name}' verschoben, {removed_count} Item-Typen entfernt",
        "kept_count": moved_count,
        "kept_total": total_kept,
        "removed_count": removed_count,
        "new_location": new_location.name
    }


@router.post("/bulk-transfer-to-officer")
async def bulk_transfer_to_officer(
    transfer: BulkTransferToOfficer,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Überträgt alle eigenen Items an einem Standort an einen anderen Offizier. Nur Offiziere+."""
    check_role(current_user, UserRole.OFFICER)

    # Ziel-User prüfen (muss Offizier+ sein)
    to_user = db.query(User).filter(User.id == transfer.to_user_id).first()
    if not to_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ziel-Benutzer nicht gefunden"
        )
    if to_user.role == UserRole.MEMBER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ziel-Benutzer muss mindestens Offizier sein"
        )

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

    transferred_count = 0
    total_items = 0

    for item in items:
        quantity = item.quantity
        total_items += quantity

        # Prüfen ob beim Empfänger bereits ein Eintrag existiert
        to_inventory = db.query(Inventory).filter(
            Inventory.user_id == transfer.to_user_id,
            Inventory.component_id == item.component_id,
            Inventory.location_id == transfer.to_location_id
        ).first()

        to_quantity_before = to_inventory.quantity if to_inventory else 0

        if to_inventory:
            to_inventory.quantity += quantity
        else:
            to_inventory = Inventory(
                user_id=transfer.to_user_id,
                component_id=item.component_id,
                location_id=transfer.to_location_id,
                quantity=quantity
            )
            db.add(to_inventory)
            db.flush()

        # Transfer protokollieren
        transfer_record = InventoryTransfer(
            from_user_id=current_user.id,
            to_user_id=transfer.to_user_id,
            component_id=item.component_id,
            from_location_id=item.location_id,
            to_location_id=transfer.to_location_id,
            quantity=quantity,
            notes="Bulk-Transfer"
        )
        db.add(transfer_record)

        # Historie für Sender
        log_inventory_change(
            db=db,
            user_id=current_user.id,
            component_id=item.component_id,
            action=InventoryAction.TRANSFER_OUT,
            quantity=-quantity,
            quantity_before=item.quantity,
            quantity_after=0,
            related_user_id=transfer.to_user_id,
            notes="Bulk-Transfer"
        )

        # Historie für Empfänger
        log_inventory_change(
            db=db,
            user_id=transfer.to_user_id,
            component_id=item.component_id,
            action=InventoryAction.TRANSFER_IN,
            quantity=quantity,
            quantity_before=to_quantity_before,
            quantity_after=to_inventory.quantity,
            related_user_id=current_user.id,
            notes="Bulk-Transfer"
        )

        # Sender-Item auf 0 setzen
        item.quantity = 0
        transferred_count += 1

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
        "message": f"{transferred_count} Item-Typen ({total_items} Stück) von '{from_name}' an {to_user.display_name or to_user.username} ({to_name}) übertragen",
        "transferred_types": transferred_count,
        "total_items": total_items
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


# ============== Admin-Endpoints ==============

@router.post("/admin/{user_id}/{component_id}/add")
async def admin_add_to_inventory(
    user_id: int,
    component_id: int,
    quantity: int = 1,
    location_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Admin: Fügt Komponenten zum Lager eines anderen Users hinzu."""
    check_role(current_user, UserRole.ADMIN)

    if quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Menge muss positiv sein"
        )

    # User prüfen
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
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

    # Inventar-Eintrag suchen oder erstellen
    inventory = db.query(Inventory).filter(
        Inventory.user_id == user_id,
        Inventory.component_id == component_id,
        Inventory.location_id == location_id
    ).first()

    quantity_before = inventory.quantity if inventory else 0

    if inventory:
        inventory.quantity += quantity
    else:
        inventory = Inventory(
            user_id=user_id,
            component_id=component_id,
            location_id=location_id,
            quantity=quantity
        )
        db.add(inventory)
        db.flush()

    # Historie loggen
    log_inventory_change(
        db=db,
        user_id=user_id,
        component_id=component_id,
        action=InventoryAction.ADD,
        quantity=quantity,
        quantity_before=quantity_before,
        quantity_after=inventory.quantity,
        related_user_id=current_user.id,
        notes=f"Admin-Hinzufügung durch {current_user.display_name or current_user.username}"
    )

    db.commit()
    db.refresh(inventory)
    return {"message": f"{quantity}x {component.name} zu {target_user.display_name or target_user.username} hinzugefügt", "new_quantity": inventory.quantity}


@router.post("/admin/{user_id}/{component_id}/remove")
async def admin_remove_from_inventory(
    user_id: int,
    component_id: int,
    quantity: int = 1,
    location_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Admin: Entfernt Komponenten aus dem Lager eines anderen Users."""
    check_role(current_user, UserRole.ADMIN)

    if quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Menge muss positiv sein"
        )

    # User prüfen
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    inventory = db.query(Inventory).filter(
        Inventory.user_id == user_id,
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
        user_id=user_id,
        component_id=component_id,
        action=InventoryAction.REMOVE,
        quantity=-quantity,
        quantity_before=quantity_before,
        quantity_after=inventory.quantity,
        related_user_id=current_user.id,
        notes=f"Admin-Entfernung durch {current_user.display_name or current_user.username}"
    )

    db.commit()
    db.refresh(inventory)

    component = db.query(Component).filter(Component.id == component_id).first()
    return {"message": f"{quantity}x {component.name} von {target_user.display_name or target_user.username} entfernt", "new_quantity": inventory.quantity}


# ============== Transfer Request Endpoints ==============

@router.post("/transfer-request", response_model=TransferRequestResponse)
async def create_transfer_request(
    request: TransferRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Erstellt eine Transfer-Anfrage an einen anderen User."""
    check_role(current_user, UserRole.OFFICER)

    if request.quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Menge muss positiv sein"
        )

    # Prüfen ob Besitzer existiert
    owner = db.query(User).filter(User.id == request.owner_id).first()
    if not owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Besitzer nicht gefunden"
        )

    # Kann nicht von sich selbst anfragen
    if request.owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Du kannst keine Anfrage an dein eigenes Lager stellen"
        )

    # Prüfen ob Item im Lager des Besitzers existiert
    inventory = db.query(Inventory).filter(
        Inventory.user_id == request.owner_id,
        Inventory.component_id == request.component_id,
        Inventory.location_id == request.from_location_id
    ).first()

    if not inventory or inventory.quantity < request.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nicht genug Items im Lager des Besitzers"
        )

    # Bestellnummer generieren (TR-YYYY-NNNN)
    from datetime import datetime
    year = datetime.now().year
    # Finde die höchste Nummer dieses Jahres
    last_request = db.query(TransferRequest).filter(
        TransferRequest.order_number.like(f"TR-{year}-%")
    ).order_by(TransferRequest.id.desc()).first()

    if last_request and last_request.order_number:
        try:
            last_num = int(last_request.order_number.split("-")[-1])
            next_num = last_num + 1
        except ValueError:
            next_num = 1
    else:
        next_num = 1

    order_number = f"VPR-{year}-{next_num:04d}"

    # Anfrage erstellen
    transfer_request = TransferRequest(
        order_number=order_number,
        requester_id=current_user.id,
        owner_id=request.owner_id,
        component_id=request.component_id,
        from_location_id=request.from_location_id,
        to_location_id=request.to_location_id,
        quantity=request.quantity,
        notes=request.notes,
        status=TransferRequestStatus.PENDING
    )
    db.add(transfer_request)
    db.commit()
    db.refresh(transfer_request)
    return transfer_request


@router.get("/transfer-requests", response_model=List[TransferRequestResponse])
async def get_transfer_requests(
    status_filter: Optional[TransferRequestStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt Transfer-Anfragen zurück (eigene als Empfänger/Besitzer oder alle für Admin)."""
    query = db.query(TransferRequest)

    # Admin sieht alle, andere nur eigene
    if not current_user.has_permission(UserRole.ADMIN):
        query = query.filter(
            (TransferRequest.requester_id == current_user.id) |
            (TransferRequest.owner_id == current_user.id)
        )

    if status_filter:
        query = query.filter(TransferRequest.status == status_filter)

    return query.order_by(TransferRequest.created_at.desc()).all()


@router.get("/transfer-requests/pending/count")
async def get_pending_requests_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt die Anzahl offener Anfragen zurück (für Benachrichtigungs-Badge)."""
    # Als Besitzer/Pioneer: Anfragen die ich freigeben muss (PENDING)
    # Pioneers sehen auch Anfragen für andere Pioneer-Lager
    if current_user.is_pioneer:
        # Pioneer: eigene + andere Pioneer-Anfragen (PENDING)
        owner_pending = db.query(TransferRequest).join(
            User, TransferRequest.owner_id == User.id
        ).filter(
            TransferRequest.status == TransferRequestStatus.PENDING,
            or_(
                TransferRequest.owner_id == current_user.id,
                User.is_pioneer == True
            )
        ).count()
        # Pioneer: Anfragen die ich ausliefern muss (APPROVED)
        owner_approved = db.query(TransferRequest).join(
            User, TransferRequest.owner_id == User.id
        ).filter(
            TransferRequest.status == TransferRequestStatus.APPROVED,
            or_(
                TransferRequest.owner_id == current_user.id,
                User.is_pioneer == True
            )
        ).count()
    else:
        # Normale User: nur eigene
        owner_pending = db.query(TransferRequest).filter(
            TransferRequest.owner_id == current_user.id,
            TransferRequest.status == TransferRequestStatus.PENDING
        ).count()
        owner_approved = db.query(TransferRequest).filter(
            TransferRequest.owner_id == current_user.id,
            TransferRequest.status == TransferRequestStatus.APPROVED
        ).count()

    # Als Anfragender: Meine Anfragen die noch auf Freigabe warten (PENDING)
    requester_pending = db.query(TransferRequest).filter(
        TransferRequest.requester_id == current_user.id,
        TransferRequest.status == TransferRequestStatus.PENDING
    ).count()

    # Als Anfragender: Meine Anfragen die freigegeben wurden - Discord-Koordination (APPROVED)
    requester_approved = db.query(TransferRequest).filter(
        TransferRequest.requester_id == current_user.id,
        TransferRequest.status == TransferRequestStatus.APPROVED
    ).count()

    # Als Empfänger: Anfragen wo ich Erhalt bestätigen muss (AWAITING_RECEIPT)
    awaiting_receipt = db.query(TransferRequest).filter(
        TransferRequest.requester_id == current_user.id,
        TransferRequest.status == TransferRequestStatus.AWAITING_RECEIPT
    ).count()

    # Als Owner: Anfragen die ich ausgeliefert habe, warte auf Empfängerbestätigung
    owner_awaiting = db.query(TransferRequest).filter(
        TransferRequest.owner_id == current_user.id,
        TransferRequest.status == TransferRequestStatus.AWAITING_RECEIPT
    ).count()

    # Admin sieht auch AWAITING_RECEIPT von anderen (falls User inaktiv)
    admin_awaiting = 0
    if current_user.has_permission(UserRole.ADMIN):
        admin_awaiting = db.query(TransferRequest).filter(
            TransferRequest.requester_id != current_user.id,
            TransferRequest.status == TransferRequestStatus.AWAITING_RECEIPT
        ).count()

    return {
        "as_owner_pending": owner_pending,
        "as_owner_approved": owner_approved,
        "as_owner_awaiting": owner_awaiting,
        "as_requester_pending": requester_pending,
        "as_requester_approved": requester_approved,
        "awaiting_receipt": awaiting_receipt,
        "admin_awaiting": admin_awaiting,
        "total": owner_pending + owner_approved + owner_awaiting + requester_pending + requester_approved + awaiting_receipt + admin_awaiting
    }


@router.post("/transfer-requests/{request_id}/approve")
async def approve_transfer_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt eine Transfer-Anfrage frei (Besitzer, Admin, oder Pioneer für Pioneer-Lager).
    Setzt Status auf APPROVED - jetzt muss über Discord ein Übergabetermin vereinbart werden."""
    transfer_request = db.query(TransferRequest).filter(TransferRequest.id == request_id).first()
    if not transfer_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anfrage nicht gefunden"
        )

    if transfer_request.status != TransferRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anfrage wurde bereits bearbeitet"
        )

    # Wer darf freigeben?
    # - Owner selbst
    # - Admin
    # - Pioneer kann andere Pioneer-Lager freigeben
    owner = db.query(User).filter(User.id == transfer_request.owner_id).first()
    can_approve = (
        transfer_request.owner_id == current_user.id or  # Owner selbst
        current_user.has_permission(UserRole.ADMIN) or   # Admin
        (current_user.is_pioneer and owner and owner.is_pioneer)  # Pioneer approves Pioneer
    )

    if not can_approve:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Keine Berechtigung zum Freigeben"
        )

    # Prüfen ob noch genug im Lager ist
    inventory = db.query(Inventory).filter(
        Inventory.user_id == transfer_request.owner_id,
        Inventory.component_id == transfer_request.component_id,
        Inventory.location_id == transfer_request.from_location_id
    ).first()

    if not inventory or inventory.quantity < transfer_request.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nicht mehr genug Items im Lager"
        )

    # Status auf APPROVED setzen - Discord-Koordination beginnt
    transfer_request.status = TransferRequestStatus.APPROVED
    transfer_request.approved_by_id = current_user.id

    db.commit()
    return {
        "message": "Anfrage freigegeben - bitte Übergabetermin über Discord vereinbaren",
        "order_number": transfer_request.order_number
    }


@router.post("/transfer-requests/{request_id}/deliver")
async def mark_as_delivered(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Markiert eine Anfrage als ausgeliefert (Besitzer, Admin, oder Pioneer für Pioneer-Lager).
    Setzt Status auf AWAITING_RECEIPT - Empfänger muss noch Erhalt bestätigen."""
    transfer_request = db.query(TransferRequest).filter(TransferRequest.id == request_id).first()
    if not transfer_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anfrage nicht gefunden"
        )

    if transfer_request.status != TransferRequestStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anfrage muss erst freigegeben werden (Status: APPROVED)"
        )

    # Wer darf als ausgeliefert markieren?
    # - Owner selbst
    # - Admin
    # - Pioneer kann andere Pioneer-Lager markieren
    owner = db.query(User).filter(User.id == transfer_request.owner_id).first()
    can_deliver = (
        transfer_request.owner_id == current_user.id or  # Owner selbst
        current_user.has_permission(UserRole.ADMIN) or   # Admin
        (current_user.is_pioneer and owner and owner.is_pioneer)  # Pioneer delivers Pioneer
    )

    if not can_deliver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Keine Berechtigung zum Markieren als ausgeliefert"
        )

    # Prüfen ob noch genug im Lager ist
    inventory = db.query(Inventory).filter(
        Inventory.user_id == transfer_request.owner_id,
        Inventory.component_id == transfer_request.component_id,
        Inventory.location_id == transfer_request.from_location_id
    ).first()

    if not inventory or inventory.quantity < transfer_request.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nicht mehr genug Items im Lager"
        )

    # Status auf AWAITING_RECEIPT setzen - Empfänger muss bestätigen
    transfer_request.status = TransferRequestStatus.AWAITING_RECEIPT
    transfer_request.delivered_by_id = current_user.id

    db.commit()
    return {"message": "Als ausgeliefert markiert - wartet auf Empfänger-Bestätigung"}


@router.post("/transfer-requests/{request_id}/confirm-receipt")
async def confirm_receipt(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Empfänger bestätigt Erhalt - führt den tatsächlichen Transfer durch.
    Kann vom Requester selbst oder von einem Admin bestätigt werden."""
    transfer_request = db.query(TransferRequest).filter(TransferRequest.id == request_id).first()
    if not transfer_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anfrage nicht gefunden"
        )

    if transfer_request.status != TransferRequestStatus.AWAITING_RECEIPT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anfrage ist nicht im Status 'Warte auf Erhalt-Bestätigung'"
        )

    # Wer darf Erhalt bestätigen?
    # - Requester selbst (der Empfänger)
    # - Admin (falls Empfänger inaktiv)
    can_confirm = (
        transfer_request.requester_id == current_user.id or
        current_user.has_permission(UserRole.ADMIN)
    )

    if not can_confirm:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nur der Empfänger oder ein Admin kann den Erhalt bestätigen"
        )

    # Nochmal prüfen ob noch genug im Lager ist
    inventory = db.query(Inventory).filter(
        Inventory.user_id == transfer_request.owner_id,
        Inventory.component_id == transfer_request.component_id,
        Inventory.location_id == transfer_request.from_location_id
    ).first()

    if not inventory or inventory.quantity < transfer_request.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nicht mehr genug Items im Lager - Transfer kann nicht abgeschlossen werden"
        )

    # Jetzt Transfer durchführen
    quantity_before_sender = inventory.quantity
    inventory.quantity -= transfer_request.quantity

    # Beim Empfänger hinzufügen
    to_inventory = db.query(Inventory).filter(
        Inventory.user_id == transfer_request.requester_id,
        Inventory.component_id == transfer_request.component_id,
        Inventory.location_id == transfer_request.to_location_id
    ).first()

    quantity_before_receiver = to_inventory.quantity if to_inventory else 0

    if to_inventory:
        to_inventory.quantity += transfer_request.quantity
    else:
        to_inventory = Inventory(
            user_id=transfer_request.requester_id,
            component_id=transfer_request.component_id,
            location_id=transfer_request.to_location_id,
            quantity=transfer_request.quantity
        )
        db.add(to_inventory)
        db.flush()

    # Transfer-Log erstellen
    transfer_record = InventoryTransfer(
        from_user_id=transfer_request.owner_id,
        to_user_id=transfer_request.requester_id,
        component_id=transfer_request.component_id,
        from_location_id=transfer_request.from_location_id,
        to_location_id=transfer_request.to_location_id,
        quantity=transfer_request.quantity,
        notes=f"Transfer-Anfrage #{transfer_request.id}" + (f" - {transfer_request.notes}" if transfer_request.notes else "")
    )
    db.add(transfer_record)

    # Historie loggen
    log_inventory_change(
        db=db,
        user_id=transfer_request.owner_id,
        component_id=transfer_request.component_id,
        action=InventoryAction.TRANSFER_OUT,
        quantity=-transfer_request.quantity,
        quantity_before=quantity_before_sender,
        quantity_after=inventory.quantity,
        related_user_id=transfer_request.requester_id,
        notes=f"Transfer-Anfrage abgeschlossen"
    )

    log_inventory_change(
        db=db,
        user_id=transfer_request.requester_id,
        component_id=transfer_request.component_id,
        action=InventoryAction.TRANSFER_IN,
        quantity=transfer_request.quantity,
        quantity_before=quantity_before_receiver,
        quantity_after=to_inventory.quantity,
        related_user_id=transfer_request.owner_id,
        notes=f"Transfer-Anfrage abgeschlossen"
    )

    # Anfrage als abgeschlossen markieren
    transfer_request.status = TransferRequestStatus.COMPLETED
    transfer_request.confirmed_by_id = current_user.id

    db.commit()
    return {"message": "Erhalt bestätigt - Transfer abgeschlossen"}


@router.post("/transfer-requests/{request_id}/reject")
async def reject_transfer_request(
    request_id: int,
    rejection: TransferRequestReject,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lehnt eine Transfer-Anfrage ab (Besitzer, Admin, oder Pioneer für Pioneer-Lager).
    Erfordert eine Begründung für die Ablehnung."""
    transfer_request = db.query(TransferRequest).filter(TransferRequest.id == request_id).first()
    if not transfer_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anfrage nicht gefunden"
        )

    if transfer_request.status != TransferRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anfrage wurde bereits bearbeitet"
        )

    # Begründung ist Pflicht
    if not rejection.reason or not rejection.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bitte gib eine Begründung für die Ablehnung an"
        )

    # Wer darf ablehnen?
    owner = db.query(User).filter(User.id == transfer_request.owner_id).first()
    can_reject = (
        transfer_request.owner_id == current_user.id or
        current_user.has_permission(UserRole.ADMIN) or
        (current_user.is_pioneer and owner and owner.is_pioneer)
    )

    if not can_reject:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Keine Berechtigung zum Ablehnen"
        )

    transfer_request.status = TransferRequestStatus.REJECTED
    transfer_request.approved_by_id = current_user.id
    transfer_request.rejection_reason = rejection.reason.strip()

    db.commit()
    return {"message": "Transfer-Anfrage abgelehnt"}
