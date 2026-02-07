"""Meta-Loadout Endpoints: Schiffe, Hardpoints, Loadouts, UserLoadouts."""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role
from app.models.user import User, UserRole
from app.models.loadout import Ship, ShipHardpoint, MetaLoadout, MetaLoadoutItem, UserLoadout
from app.models.inventory import Inventory
from app.models.component import Component
from app.schemas.loadout import (
    ShipResponse, ShipWithHardpointsResponse, ShipCreate,
    MetaLoadoutResponse, MetaLoadoutListResponse,
    MetaLoadoutCreate, MetaLoadoutUpdate, MetaLoadoutItemsSet,
    LoadoutCheckResponse, LoadoutCheckItem,
    UserLoadoutCreate, UserLoadoutUpdate, UserLoadoutResponse, UserLoadoutWithUser,
)

router = APIRouter()


# ============== Schiffe ==============

@router.get("/ships", response_model=list[ShipResponse])
async def list_ships(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alle Schiffe auflisten."""
    ships = db.query(Ship).order_by(Ship.name).all()
    return ships


@router.get("/ships/search")
async def search_ships(
    q: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Schiff-Suche (lokal + FleetYards Fallback)."""
    # Erst lokal suchen
    local = db.query(Ship).filter(Ship.name.ilike(f"%{q}%")).order_by(Ship.name).limit(10).all()
    results = [{"id": s.id, "name": s.name, "slug": s.slug, "manufacturer": s.manufacturer, "source": "local"} for s in local]

    # FleetYards ergänzen wenn wenige lokale Ergebnisse
    if len(results) < 5 and q:
        from app.services.fleetyards_import import search_ships_fleetyards
        fy_results = search_ships_fleetyards(q)
        local_slugs = {s.slug for s in local}
        for fy in fy_results:
            if fy["slug"] not in local_slugs:
                results.append({**fy, "id": None, "source": "fleetyards"})

    return results


@router.get("/ships/{ship_id}", response_model=ShipWithHardpointsResponse)
async def get_ship(
    ship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Schiff mit Hardpoints laden."""
    ship = db.query(Ship).options(joinedload(Ship.hardpoints)).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Schiff nicht gefunden")
    return ship


@router.post("/ships", response_model=ShipWithHardpointsResponse)
async def create_ship(
    data: ShipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Schiff manuell anlegen (Officer+)."""
    check_role(current_user, UserRole.OFFICER)

    ship = Ship(**data.model_dump())
    db.add(ship)
    db.commit()
    db.refresh(ship)
    return ship


@router.post("/ships/{ship_id}/import-hardpoints", response_model=ShipWithHardpointsResponse)
async def import_hardpoints(
    ship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hardpoints von FleetYards importieren (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Schiff nicht gefunden")
    if not ship.slug:
        raise HTTPException(status_code=400, detail="Schiff hat keinen FleetYards-Slug")

    from app.services.fleetyards_import import import_ship_from_fleetyards
    try:
        ship = import_ship_from_fleetyards(db, ship.slug)
        db.commit()
        db.refresh(ship)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return db.query(Ship).options(joinedload(Ship.hardpoints)).filter(Ship.id == ship.id).first()


@router.post("/ships/import-by-slug", response_model=ShipWithHardpointsResponse)
async def import_ship_by_slug(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Schiff + Hardpoints direkt von FleetYards importieren (Officer+)."""
    check_role(current_user, UserRole.OFFICER)

    from app.services.fleetyards_import import import_ship_from_fleetyards
    try:
        ship = import_ship_from_fleetyards(db, slug)
        db.commit()
        db.refresh(ship)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return db.query(Ship).options(joinedload(Ship.hardpoints)).filter(Ship.id == ship.id).first()


# ============== Meine gefitteten Schiffe (UserLoadouts) ==============

@router.get("/my-ships", response_model=list[UserLoadoutResponse])
async def list_my_ships(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Eigene gefittete Schiffe auflisten."""
    check_role(current_user, UserRole.MEMBER)

    loadouts = db.query(UserLoadout).options(
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.ship),
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.created_by),
        joinedload(UserLoadout.ship),
    ).filter(
        UserLoadout.user_id == current_user.id
    ).order_by(UserLoadout.created_at.desc()).all()

    return loadouts


@router.post("/my-ships", response_model=UserLoadoutResponse)
async def create_my_ship(
    data: UserLoadoutCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gefittetes Schiff speichern."""
    check_role(current_user, UserRole.MEMBER)

    # Loadout muss existieren
    loadout = db.query(MetaLoadout).filter(MetaLoadout.id == data.loadout_id).first()
    if not loadout:
        raise HTTPException(status_code=404, detail="Loadout nicht gefunden")

    user_loadout = UserLoadout(
        user_id=current_user.id,
        loadout_id=data.loadout_id,
        ship_id=loadout.ship_id,
        ship_nickname=data.ship_nickname,
        is_ready=data.is_ready,
        notes=data.notes,
    )
    db.add(user_loadout)
    db.commit()
    db.refresh(user_loadout)

    return db.query(UserLoadout).options(
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.ship),
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.created_by),
        joinedload(UserLoadout.ship),
    ).filter(UserLoadout.id == user_loadout.id).first()


@router.patch("/my-ships/{user_loadout_id}", response_model=UserLoadoutResponse)
async def update_my_ship(
    user_loadout_id: int,
    data: UserLoadoutUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Eigenes gefittetes Schiff bearbeiten."""
    check_role(current_user, UserRole.MEMBER)

    ul = db.query(UserLoadout).filter(
        UserLoadout.id == user_loadout_id,
        UserLoadout.user_id == current_user.id,
    ).first()
    if not ul:
        raise HTTPException(status_code=404, detail="UserLoadout nicht gefunden")

    for field in data.model_fields_set:
        setattr(ul, field, getattr(data, field))

    db.commit()
    db.refresh(ul)

    return db.query(UserLoadout).options(
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.ship),
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.created_by),
        joinedload(UserLoadout.ship),
    ).filter(UserLoadout.id == ul.id).first()


@router.delete("/my-ships/{user_loadout_id}")
async def delete_my_ship(
    user_loadout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Eigenes gefittetes Schiff löschen."""
    check_role(current_user, UserRole.MEMBER)

    ul = db.query(UserLoadout).filter(
        UserLoadout.id == user_loadout_id,
        UserLoadout.user_id == current_user.id,
    ).first()
    if not ul:
        raise HTTPException(status_code=404, detail="UserLoadout nicht gefunden")

    db.delete(ul)
    db.commit()
    return {"detail": "Gelöscht"}


# ============== Officer/Admin: Alle UserLoadouts ==============

@router.get("/user-ships", response_model=list[UserLoadoutWithUser])
async def list_all_user_ships(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alle gefitteten Schiffe aller User (Officer+)."""
    check_role(current_user, UserRole.OFFICER)

    loadouts = db.query(UserLoadout).options(
        joinedload(UserLoadout.user),
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.ship),
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.created_by),
        joinedload(UserLoadout.ship),
    ).order_by(UserLoadout.user_id, UserLoadout.ship_id).all()

    return loadouts


@router.get("/user-ships/{user_id}", response_model=list[UserLoadoutWithUser])
async def list_user_ships(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gefittete Schiffe eines bestimmten Users (Officer+)."""
    check_role(current_user, UserRole.OFFICER)

    loadouts = db.query(UserLoadout).options(
        joinedload(UserLoadout.user),
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.ship),
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.created_by),
        joinedload(UserLoadout.ship),
    ).filter(
        UserLoadout.user_id == user_id
    ).order_by(UserLoadout.ship_id).all()

    return loadouts


# ============== Meta-Loadouts ==============

@router.get("/", response_model=list[MetaLoadoutListResponse])
async def list_loadouts(
    ship_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alle aktiven Meta-Loadouts auflisten."""
    query = db.query(MetaLoadout).options(
        joinedload(MetaLoadout.ship),
        joinedload(MetaLoadout.created_by),
    ).filter(MetaLoadout.is_active == True)

    if ship_id:
        query = query.filter(MetaLoadout.ship_id == ship_id)

    return query.order_by(MetaLoadout.ship_id, MetaLoadout.name).all()


@router.get("/{loadout_id}", response_model=MetaLoadoutResponse)
async def get_loadout(
    loadout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Loadout mit allen Items laden."""
    loadout = db.query(MetaLoadout).options(
        joinedload(MetaLoadout.ship).joinedload(Ship.hardpoints),
        joinedload(MetaLoadout.created_by),
        joinedload(MetaLoadout.items).joinedload(MetaLoadoutItem.component),
    ).filter(MetaLoadout.id == loadout_id).first()

    if not loadout:
        raise HTTPException(status_code=404, detail="Loadout nicht gefunden")
    return loadout


@router.post("/", response_model=MetaLoadoutResponse)
async def create_loadout(
    data: MetaLoadoutCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Neues Meta-Loadout erstellen (Officer+)."""
    check_role(current_user, UserRole.OFFICER)

    # Prüfe ob Schiff existiert
    ship = db.query(Ship).filter(Ship.id == data.ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Schiff nicht gefunden")

    loadout = MetaLoadout(
        **data.model_dump(),
        created_by_id=current_user.id,
    )
    db.add(loadout)
    db.commit()
    db.refresh(loadout)

    return db.query(MetaLoadout).options(
        joinedload(MetaLoadout.ship),
        joinedload(MetaLoadout.created_by),
        joinedload(MetaLoadout.items).joinedload(MetaLoadoutItem.component),
    ).filter(MetaLoadout.id == loadout.id).first()


@router.patch("/{loadout_id}", response_model=MetaLoadoutResponse)
async def update_loadout(
    loadout_id: int,
    data: MetaLoadoutUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Loadout bearbeiten (Officer+)."""
    check_role(current_user, UserRole.OFFICER)

    loadout = db.query(MetaLoadout).filter(MetaLoadout.id == loadout_id).first()
    if not loadout:
        raise HTTPException(status_code=404, detail="Loadout nicht gefunden")

    for field in data.model_fields_set:
        setattr(loadout, field, getattr(data, field))

    db.commit()
    db.refresh(loadout)

    return db.query(MetaLoadout).options(
        joinedload(MetaLoadout.ship).joinedload(Ship.hardpoints),
        joinedload(MetaLoadout.created_by),
        joinedload(MetaLoadout.items).joinedload(MetaLoadoutItem.component),
    ).filter(MetaLoadout.id == loadout.id).first()


@router.delete("/{loadout_id}")
async def delete_loadout(
    loadout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Loadout löschen (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    loadout = db.query(MetaLoadout).filter(MetaLoadout.id == loadout_id).first()
    if not loadout:
        raise HTTPException(status_code=404, detail="Loadout nicht gefunden")

    db.delete(loadout)
    db.commit()
    return {"detail": "Loadout gelöscht"}


@router.post("/{loadout_id}/items", response_model=MetaLoadoutResponse)
async def set_loadout_items(
    loadout_id: int,
    data: MetaLoadoutItemsSet,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Items in einem Loadout setzen (ersetzt alle) (Officer+)."""
    check_role(current_user, UserRole.OFFICER)

    loadout = db.query(MetaLoadout).filter(MetaLoadout.id == loadout_id).first()
    if not loadout:
        raise HTTPException(status_code=404, detail="Loadout nicht gefunden")

    # Alte Items löschen
    db.query(MetaLoadoutItem).filter(MetaLoadoutItem.loadout_id == loadout_id).delete()

    # Neue Items anlegen
    for item_data in data.items:
        # Prüfe ob Komponente existiert
        comp = db.query(Component).filter(Component.id == item_data.component_id).first()
        if not comp:
            raise HTTPException(status_code=404, detail=f"Komponente {item_data.component_id} nicht gefunden")

        item = MetaLoadoutItem(
            loadout_id=loadout_id,
            hardpoint_type=item_data.hardpoint_type,
            slot_index=item_data.slot_index,
            component_id=item_data.component_id,
            hardpoint_id=item_data.hardpoint_id,
        )
        db.add(item)

    db.commit()

    return db.query(MetaLoadout).options(
        joinedload(MetaLoadout.ship).joinedload(Ship.hardpoints),
        joinedload(MetaLoadout.created_by),
        joinedload(MetaLoadout.items).joinedload(MetaLoadoutItem.component),
    ).filter(MetaLoadout.id == loadout_id).first()


# ============== User-Aktionen ==============

@router.get("/{loadout_id}/check", response_model=LoadoutCheckResponse)
async def check_loadout(
    loadout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Prüfe was dem User für dieses Loadout fehlt."""
    loadout = db.query(MetaLoadout).options(
        joinedload(MetaLoadout.ship).joinedload(Ship.hardpoints),
        joinedload(MetaLoadout.created_by),
        joinedload(MetaLoadout.items).joinedload(MetaLoadoutItem.component),
    ).filter(MetaLoadout.id == loadout_id).first()

    if not loadout:
        raise HTTPException(status_code=404, detail="Loadout nicht gefunden")

    # User-Inventar laden
    user_inventory = db.query(Inventory).filter(
        Inventory.user_id == current_user.id
    ).all()
    user_stock = {}
    for inv in user_inventory:
        user_stock[inv.component_id] = user_stock.get(inv.component_id, 0) + inv.quantity

    # Pioneer-Inventar laden (alle Pioneers zusammen)
    pioneer_inventory = db.query(Inventory).join(
        User, Inventory.user_id == User.id
    ).filter(User.is_pioneer == True).all()
    pioneer_stock = {}
    for inv in pioneer_inventory:
        pioneer_stock[inv.component_id] = pioneer_stock.get(inv.component_id, 0) + inv.quantity

    # Items checken
    check_items = []
    total_owned = 0
    total_missing = 0

    # Zähle wie oft jede Komponente gebraucht wird
    component_needs: dict[int, int] = {}
    for item in loadout.items:
        component_needs[item.component_id] = component_needs.get(item.component_id, 0) + 1

    # Track wie viele wir schon "verbraucht" haben
    used_from_user: dict[int, int] = {}

    for item in loadout.items:
        comp_id = item.component_id
        already_used = used_from_user.get(comp_id, 0)
        available = user_stock.get(comp_id, 0) - already_used
        has = 1 if available > 0 else 0

        if has:
            used_from_user[comp_id] = already_used + 1
            total_owned += 1
        else:
            total_missing += 1

        check_items.append(LoadoutCheckItem(
            hardpoint_type=item.hardpoint_type,
            slot_index=item.slot_index,
            component=item.component,
            required=1,
            in_inventory=has,
            available_from_pioneers=pioneer_stock.get(comp_id, 0),
        ))

    return LoadoutCheckResponse(
        loadout=loadout,
        items=check_items,
        total_required=len(loadout.items),
        total_owned=total_owned,
        total_missing=total_missing,
    )


@router.post("/{loadout_id}/request-missing")
async def request_missing_items(
    loadout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Transfer-Requests für alle fehlenden Items generieren."""
    from app.models.inventory import TransferRequest, TransferRequestStatus

    loadout = db.query(MetaLoadout).options(
        joinedload(MetaLoadout.items).joinedload(MetaLoadoutItem.component),
    ).filter(MetaLoadout.id == loadout_id).first()

    if not loadout:
        raise HTTPException(status_code=404, detail="Loadout nicht gefunden")

    # User-Inventar
    user_inventory = db.query(Inventory).filter(
        Inventory.user_id == current_user.id
    ).all()
    user_stock = {}
    for inv in user_inventory:
        user_stock[inv.component_id] = user_stock.get(inv.component_id, 0) + inv.quantity

    # Pioneer-Inventar (pro Pioneer aufgeschlüsselt)
    pioneers = db.query(User).filter(User.is_pioneer == True).all()
    pioneer_stock: dict[int, list[tuple[int, int, int | None]]] = {}  # comp_id -> [(user_id, quantity, location_id)]
    for pioneer in pioneers:
        inv_items = db.query(Inventory).filter(Inventory.user_id == pioneer.id).all()
        for inv in inv_items:
            if inv.component_id not in pioneer_stock:
                pioneer_stock[inv.component_id] = []
            pioneer_stock[inv.component_id].append((pioneer.id, inv.quantity, inv.location_id))

    # Fehlende Items sammeln (nach Komponente gruppiert)
    used_from_user: dict[int, int] = {}
    missing_components: dict[int, int] = {}  # comp_id -> Anzahl

    for item in loadout.items:
        comp_id = item.component_id
        already_used = used_from_user.get(comp_id, 0)
        available = user_stock.get(comp_id, 0) - already_used

        if available > 0:
            used_from_user[comp_id] = already_used + 1
        else:
            missing_components[comp_id] = missing_components.get(comp_id, 0) + 1

    # Transfer-Requests erstellen
    created = 0
    for comp_id, needed in missing_components.items():
        # Finde Pioneer mit höchstem Bestand
        sources = pioneer_stock.get(comp_id, [])
        if not sources:
            continue  # Kein Pioneer hat diese Komponente

        # Sortiere nach Menge (höchste zuerst)
        sources.sort(key=lambda x: x[1], reverse=True)
        best_source = sources[0]
        owner_id, available_qty, location_id = best_source

        # Bestellnummer generieren
        from datetime import datetime
        year = datetime.now().year
        last_request = db.query(TransferRequest).filter(
            TransferRequest.order_number.ilike(f"VPR-{year}-%")
        ).order_by(TransferRequest.id.desc()).first()

        if last_request and last_request.order_number:
            last_num = int(last_request.order_number.split("-")[-1])
            new_num = last_num + 1
        else:
            new_num = 1
        order_number = f"VPR-{year}-{new_num:04d}"

        request = TransferRequest(
            order_number=order_number,
            requester_id=current_user.id,
            owner_id=owner_id,
            component_id=comp_id,
            quantity=min(needed, available_qty),
            from_location_id=location_id,
            status=TransferRequestStatus.PENDING,
            notes=f"Meta-Loadout: {loadout.name}",
        )
        db.add(request)
        created += 1

    db.commit()
    return {"detail": f"{created} Transfer-Anfragen erstellt", "created": created}
