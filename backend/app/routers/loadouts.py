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
    ErkulImportRequest, ErkulImportResponse, ErkulImportedItem,
    ErkulBulkPreviewRequest, ErkulBulkPreviewResponse, ErkulBulkPreviewItem, ErkulBulkPreviewMatch,
    ErkulBulkImportRequest, ErkulBulkImportResponse, ErkulBulkImportResultItem,
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
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.items).joinedload(MetaLoadoutItem.component),
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
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.items).joinedload(MetaLoadoutItem.component),
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
        joinedload(UserLoadout.loadout).joinedload(MetaLoadout.items).joinedload(MetaLoadoutItem.component),
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

    # Pioneer-Lagerbestand für alle Komponenten im Loadout laden
    component_ids = [item.component_id for item in loadout.items]
    if component_ids:
        from sqlalchemy import func
        pioneer_stock_rows = db.query(
            Inventory.component_id,
            func.sum(Inventory.quantity).label("total")
        ).join(User, Inventory.user_id == User.id).filter(
            User.is_pioneer == True,
            Inventory.component_id.in_(component_ids)
        ).group_by(Inventory.component_id).all()
        pioneer_stock = {row.component_id: row.total for row in pioneer_stock_rows}
    else:
        pioneer_stock = {}

    # Items mit pioneer_stock anreichern
    for item in loadout.items:
        item.pioneer_stock = pioneer_stock.get(item.component_id, 0)

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


# ============== Erkul Import ==============

@router.post("/{loadout_id}/import-erkul", response_model=ErkulImportResponse)
async def import_from_erkul(
    loadout_id: int,
    data: ErkulImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Loadout-Items von Erkul.games importieren (Officer+)."""
    import httpx
    import base64
    import json
    import re

    check_role(current_user, UserRole.OFFICER)

    loadout = db.query(MetaLoadout).filter(MetaLoadout.id == loadout_id).first()
    if not loadout:
        raise HTTPException(status_code=404, detail="Loadout nicht gefunden")

    # Erkul-Code aus URL extrahieren
    erkul_input = data.erkul_url.strip()
    match = re.search(r'(?:loadout/|calculator;loadout=)([a-zA-Z0-9]+)', erkul_input)
    code = match.group(1) if match else erkul_input

    # Erkul API abrufen
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://server.erkul.games/loadouts/{code}",
                headers={
                    "Origin": "https://www.erkul.games",
                    "Referer": "https://www.erkul.games/",
                },
            )
            resp.raise_for_status()
            erkul_data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erkul API Fehler: {str(e)}")

    # Base64-Loadout dekodieren
    try:
        loadout_json = json.loads(base64.b64decode(erkul_data["loadout"]))
    except Exception:
        raise HTTPException(status_code=502, detail="Erkul Loadout-Daten konnten nicht dekodiert werden")

    erkul_name = erkul_data.get("name", "Unbekannt")
    erkul_ship = loadout_json.get("ship", {}).get("localName", "Unbekannt")

    # Erkul calculatorType -> unsere hardpoint_type Zuordnung
    TYPE_MAP = {
        "power-plant": "power_plant",
        "cooler": "cooler",
        "shield": "shield",
        "qdrive": "quantum_drive",
        "weapon": "weapon_gun",
        "mount": "weapon_gun",  # Gimbal-Mount enthält Waffe
        "turret": "turret",
        "missile-rack": "missile_launcher",
    }

    # Ignorierte Typen (Stock-Items, nicht customizable)
    SKIP_TYPES = {"paint", "controller-flight", "radar", "life-support", "jumpdrive"}

    # Alle Komponenten aus dem Erkul-Loadout sammeln
    extracted_items = []

    def extract_components(items, parent_type=None):
        """Rekursiv Komponenten aus verschachteltem Erkul-Loadout extrahieren."""
        for item in (items or []):
            calc_type = item.get("item", {}).get("calculatorType", "")
            local_name = item.get("item", {}).get("localName", "")
            is_stock = item.get("item", {}).get("stock", False)

            if calc_type in SKIP_TYPES or not local_name:
                continue

            # Bei mount: die Unter-Waffe ist relevant, nicht der Mount selbst
            if calc_type == "mount":
                sub_items = item.get("loadout", [])
                if sub_items:
                    for sub in sub_items:
                        sub_type = sub.get("item", {}).get("calculatorType", "")
                        sub_name = sub.get("item", {}).get("localName", "")
                        if sub_type == "weapon" and sub_name:
                            extracted_items.append(("weapon_gun", sub_name))
                continue

            # Bei missile-rack: die Raketen einzeln ignorieren, nur den Rack nehmen
            if calc_type == "missile-rack":
                hp_type = TYPE_MAP.get(calc_type)
                if hp_type and not is_stock:
                    extracted_items.append((hp_type, local_name))
                continue

            # Normale Komponente
            hp_type = TYPE_MAP.get(calc_type)
            if hp_type and not is_stock:
                extracted_items.append((hp_type, local_name))

    extract_components(loadout_json.get("loadout", []))

    # Alte Items löschen
    db.query(MetaLoadoutItem).filter(MetaLoadoutItem.loadout_id == loadout_id).delete()

    # Komponenten matchen und Items erstellen
    slot_counters: dict[str, int] = {}
    imported_items = []
    unmatched_items = []

    for hp_type, erkul_local_name in extracted_items:
        slot_idx = slot_counters.get(hp_type, 0)
        slot_counters[hp_type] = slot_idx + 1

        # Case-insensitive Match gegen class_name
        component = db.query(Component).filter(
            Component.class_name.ilike(erkul_local_name)
        ).first()

        if component:
            # Hardpoint finden (wenn vorhanden)
            hardpoint = db.query(ShipHardpoint).filter(
                ShipHardpoint.ship_id == loadout.ship_id,
                ShipHardpoint.hardpoint_type == hp_type,
                ShipHardpoint.slot_index == slot_idx,
            ).first()

            item = MetaLoadoutItem(
                loadout_id=loadout_id,
                hardpoint_type=hp_type,
                slot_index=slot_idx,
                component_id=component.id,
                hardpoint_id=hardpoint.id if hardpoint else None,
            )
            db.add(item)

            imported_items.append(ErkulImportedItem(
                hardpoint_type=hp_type,
                slot_index=slot_idx,
                component_id=component.id,
                component_name=component.name,
                erkul_local_name=erkul_local_name,
                matched=True,
            ))
        else:
            unmatched_items.append(erkul_local_name)
            imported_items.append(ErkulImportedItem(
                hardpoint_type=hp_type,
                slot_index=slot_idx,
                erkul_local_name=erkul_local_name,
                matched=False,
            ))

    # Erkul-Link auf dem Loadout speichern
    erkul_url = f"https://www.erkul.games/loadout/{code}"
    loadout.erkul_link = erkul_url

    db.commit()

    return ErkulImportResponse(
        erkul_name=erkul_name,
        erkul_ship=erkul_ship,
        imported_count=len([i for i in imported_items if i.matched]),
        unmatched_count=len(unmatched_items),
        unmatched_items=unmatched_items,
        items=imported_items,
    )


# ============== Erkul Hilfsfunktionen ==============

import httpx as _httpx
import base64 as _base64
import json as _json
import re as _re
from datetime import date as _date

_ERKUL_TYPE_MAP = {
    "power-plant": "power_plant", "cooler": "cooler", "shield": "shield",
    "qdrive": "quantum_drive", "weapon": "weapon_gun", "mount": "weapon_gun",
    "turret": "turret", "missile-rack": "missile_launcher",
}
_ERKUL_SKIP_TYPES = {"paint", "controller-flight", "radar", "life-support", "jumpdrive"}


def _parse_erkul_code(url_or_code: str) -> str:
    """Erkul-Code aus URL oder direktem Code extrahieren."""
    match = _re.search(r'(?:loadout/|calculator;loadout=)([a-zA-Z0-9]+)', url_or_code.strip())
    return match.group(1) if match else url_or_code.strip()


async def _fetch_erkul(code: str) -> dict:
    """Erkul-Loadout abrufen und dekodieren."""
    async with _httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"https://server.erkul.games/loadouts/{code}",
            headers={"Origin": "https://www.erkul.games", "Referer": "https://www.erkul.games/"},
        )
        resp.raise_for_status()
        data = resp.json()
    loadout_json = _json.loads(_base64.b64decode(data["loadout"]))
    return {
        "erkul_name": data.get("name", ""),
        "ship_local": loadout_json.get("ship", {}).get("localName", ""),
        "items": loadout_json.get("loadout", []),
    }


def _extract_erkul_components(erkul_items: list) -> list[tuple[str, str]]:
    """Erkul-Items in (hardpoint_type, local_name) Paare umwandeln."""
    result = []
    for item_data in (erkul_items or []):
        calc_type = item_data.get("item", {}).get("calculatorType", "")
        local_name = item_data.get("item", {}).get("localName", "")
        is_stock = item_data.get("item", {}).get("stock", False)
        if calc_type in _ERKUL_SKIP_TYPES or not local_name:
            continue
        if calc_type == "mount":
            for sub in item_data.get("loadout", []):
                if sub.get("item", {}).get("calculatorType") == "weapon" and sub.get("item", {}).get("localName"):
                    result.append(("weapon_gun", sub["item"]["localName"]))
            continue
        if calc_type == "missile-rack" and not is_stock:
            result.append(("missile_launcher", local_name))
            continue
        hp_type = _ERKUL_TYPE_MAP.get(calc_type)
        if hp_type and not is_stock:
            result.append((hp_type, local_name))
    return result


def _resolve_ship_from_erkul(db: Session, ship_local: str) -> Ship | None:
    """Schiff anhand von Erkul localName in DB finden oder von FleetYards importieren."""
    # Aus localName ableiten (z.B. "aegs_gladius" -> "gladius")
    parts = ship_local.split("_", 1)
    search_term = parts[1].replace("_", " ") if len(parts) > 1 else ship_local

    # In DB suchen
    ship = db.query(Ship).filter(Ship.name.ilike(f"%{search_term}%")).first()
    if ship:
        return ship

    # FleetYards Fallback
    from app.services.fleetyards_import import search_ships_fleetyards, import_ship_from_fleetyards
    results = search_ships_fleetyards(search_term)
    if results:
        slug = results[0]["slug"]
        existing = db.query(Ship).filter(Ship.slug == slug).first()
        if existing:
            return existing
        try:
            ship = import_ship_from_fleetyards(db, slug)
            db.commit()
            return ship
        except Exception:
            pass
    return None


def _import_erkul_items_to_loadout(db: Session, loadout: MetaLoadout, erkul_items: list) -> tuple[int, int]:
    """Erkul-Items in ein Loadout importieren. Gibt (imported, unmatched) zurück."""
    extracted = _extract_erkul_components(erkul_items)
    db.query(MetaLoadoutItem).filter(MetaLoadoutItem.loadout_id == loadout.id).delete()

    slot_counters: dict[str, int] = {}
    imported = 0
    unmatched = 0

    for hp_type, erkul_local_name in extracted:
        slot_idx = slot_counters.get(hp_type, 0)
        slot_counters[hp_type] = slot_idx + 1

        component = db.query(Component).filter(Component.class_name.ilike(erkul_local_name)).first()
        if not component:
            unmatched += 1
            continue

        hardpoint = db.query(ShipHardpoint).filter(
            ShipHardpoint.ship_id == loadout.ship_id,
            ShipHardpoint.hardpoint_type == hp_type,
            ShipHardpoint.slot_index == slot_idx,
        ).first()

        db.add(MetaLoadoutItem(
            loadout_id=loadout.id,
            hardpoint_type=hp_type, slot_index=slot_idx,
            component_id=component.id,
            hardpoint_id=hardpoint.id if hardpoint else None,
        ))
        imported += 1

    return imported, unmatched


# ============== Erkul Bulk Import ==============

@router.post("/bulk-preview", response_model=ErkulBulkPreviewResponse)
async def bulk_preview_erkul(
    data: ErkulBulkPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vorschau für Bulk-Import von Erkul-Links (Officer+)."""
    check_role(current_user, UserRole.OFFICER)

    results = []
    for url in data.urls:
        code = _parse_erkul_code(url)
        if not code:
            results.append(ErkulBulkPreviewItem(
                erkul_url=url, erkul_code="", erkul_name="", ship_name="",
                ship_id=None, components_count=0, unmatched_count=0,
                existing_matches=[], error="Ungültiger Erkul-Link",
            ))
            continue

        try:
            erkul = await _fetch_erkul(code)
        except Exception as e:
            results.append(ErkulBulkPreviewItem(
                erkul_url=url, erkul_code=code, erkul_name="", ship_name="",
                ship_id=None, components_count=0, unmatched_count=0,
                existing_matches=[], error=f"Erkul-Fehler: {str(e)[:100]}",
            ))
            continue

        # Schiff auflösen
        ship = _resolve_ship_from_erkul(db, erkul["ship_local"])
        ship_name = ship.name if ship else erkul["ship_local"]
        ship_id = ship.id if ship else None

        # Komponenten zählen
        extracted = _extract_erkul_components(erkul["items"])
        matched = 0
        unmatched = 0
        for _, local_name in extracted:
            comp = db.query(Component).filter(Component.class_name.ilike(local_name)).first()
            if comp:
                matched += 1
            else:
                unmatched += 1

        # Existierende Loadouts für dieses Schiff finden
        existing = []
        if ship_id:
            existing_loadouts = db.query(MetaLoadout).filter(
                MetaLoadout.ship_id == ship_id, MetaLoadout.is_active == True
            ).all()
            existing = [
                ErkulBulkPreviewMatch(id=l.id, name=l.name, category=l.category)
                for l in existing_loadouts
            ]

        results.append(ErkulBulkPreviewItem(
            erkul_url=url,
            erkul_code=code,
            erkul_name=erkul["erkul_name"],
            ship_name=ship_name,
            ship_id=ship_id,
            components_count=matched + unmatched,
            unmatched_count=unmatched,
            existing_matches=existing,
        ))

    return ErkulBulkPreviewResponse(items=results)


@router.post("/bulk-import", response_model=ErkulBulkImportResponse)
async def bulk_import_erkul(
    data: ErkulBulkImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-Import von Erkul-Loadouts (Officer+). Kann neue erstellen oder bestehende ersetzen."""
    check_role(current_user, UserRole.OFFICER)

    results = []
    created = 0
    replaced = 0
    failed = 0

    for item in data.items:
        code = _parse_erkul_code(item.erkul_url)
        try:
            erkul = await _fetch_erkul(code)
        except Exception as e:
            results.append(ErkulBulkImportResultItem(
                name=item.name, ship_name="", imported_count=0,
                unmatched_count=0, replaced=False, error=str(e)[:100],
            ))
            failed += 1
            continue

        # Ersetzen oder neu?
        if item.replace_id:
            loadout = db.query(MetaLoadout).filter(MetaLoadout.id == item.replace_id).first()
            if not loadout:
                results.append(ErkulBulkImportResultItem(
                    name=item.name, ship_name="", imported_count=0,
                    unmatched_count=0, replaced=False, error="Loadout zum Ersetzen nicht gefunden",
                ))
                failed += 1
                continue

            # Loadout-Metadaten aktualisieren
            loadout.name = item.name
            if item.category:
                loadout.category = item.category
            loadout.erkul_link = f"https://www.erkul.games/loadout/{code}"
            loadout.version_date = _date.today()
            ship_name = loadout.ship.name if loadout.ship else ""
            is_replaced = True
        else:
            # Neues Loadout - Schiff auflösen
            ship = _resolve_ship_from_erkul(db, erkul["ship_local"])
            if not ship:
                results.append(ErkulBulkImportResultItem(
                    name=item.name, ship_name=erkul["ship_local"], imported_count=0,
                    unmatched_count=0, replaced=False, error="Schiff nicht gefunden",
                ))
                failed += 1
                continue

            loadout = MetaLoadout(
                ship_id=ship.id,
                name=item.name,
                category=item.category,
                erkul_link=f"https://www.erkul.games/loadout/{code}",
                is_active=True,
                version_date=_date.today(),
                created_by_id=current_user.id,
            )
            db.add(loadout)
            db.flush()
            ship_name = ship.name
            is_replaced = False

        # Items importieren
        imp_count, unm_count = _import_erkul_items_to_loadout(db, loadout, erkul["items"])
        db.commit()

        if is_replaced:
            replaced += 1
        else:
            created += 1

        results.append(ErkulBulkImportResultItem(
            name=item.name, ship_name=ship_name,
            imported_count=imp_count, unmatched_count=unm_count,
            replaced=is_replaced,
        ))

    return ErkulBulkImportResponse(
        results=results,
        total_created=created,
        total_replaced=replaced,
        total_failed=failed,
    )


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
