from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
import httpx
import re

from app.database import get_db
from app.models.user import User, UserRole
from app.models.component import Component
from app.models.item_price import ItemPrice
from app.schemas.component import (
    ComponentCreate, ComponentResponse, ComponentDetailResponse,
    ShieldStats, PowerStats, CoolerStats, QuantumDriveStats, WeaponStats,
    ItemPriceResponse
)
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()

SC_API_BASE = "https://api.star-citizen.wiki/api/v2"


def normalize_search(text: str) -> str:
    """Normalisiert Suchtext für fuzzy matching (entfernt Trennzeichen)."""
    return re.sub(r'[-_\s.]', '', text.lower())


@router.get("", response_model=List[ComponentResponse])
async def get_components(
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Komponenten zurück, optional gefiltert nach Kategorie/Sub-Kategorie."""
    query = db.query(Component)
    # PLACEHOLDER-Einträge ausfiltern (Fehler in SC-Wiki Daten)
    query = query.filter(Component.name != "<= PLACEHOLDER =>")
    if category:
        query = query.filter(Component.category == category)
    if sub_category:
        query = query.filter(Component.sub_category == sub_category)
    return query.order_by(Component.category, Component.sub_category, Component.name).all()


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


@router.get("/sub-categories")
async def get_sub_categories(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle verfügbaren Unterkategorien zurück, optional gefiltert nach Hauptkategorie."""
    query = db.query(Component.sub_category).distinct().filter(
        Component.sub_category.isnot(None)
    )
    if category:
        query = query.filter(Component.category == category)
    return [s[0] for s in query.order_by(Component.sub_category).all()]


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


@router.get("/search", response_model=List[ComponentResponse])
async def search_components(
    q: str = Query(..., min_length=2, description="Suchbegriff (min. 2 Zeichen)"),
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Sucht Komponenten mit Fuzzy-Matching.
    'TS2' findet auch 'TS-2', 'ts_2', 'TS 2' etc.
    """
    # Basis-Query
    query = db.query(Component).filter(Component.name != "<= PLACEHOLDER =>")

    if category:
        query = query.filter(Component.category == category)
    if sub_category:
        query = query.filter(Component.sub_category == sub_category)

    # Alle laden und clientseitig filtern für Fuzzy-Search
    all_components = query.all()

    # Fuzzy-Matching
    normalized_search = normalize_search(q)
    search_lower = q.lower()

    results = []
    for comp in all_components:
        # Normale Suche
        if search_lower in comp.name.lower():
            results.append(comp)
            continue

        # Fuzzy-Suche (ohne Trennzeichen)
        if normalized_search in normalize_search(comp.name):
            results.append(comp)
            continue

        # Hersteller-Suche
        if comp.manufacturer and search_lower in comp.manufacturer.lower():
            results.append(comp)

    # Sortieren: Exakte Matches zuerst, dann alphabetisch
    def sort_key(c):
        name_lower = c.name.lower()
        if name_lower.startswith(search_lower):
            return (0, c.name)
        if search_lower in name_lower:
            return (1, c.name)
        return (2, c.name)

    results.sort(key=sort_key)
    return results[:limit]


@router.get("/{component_id}/details", response_model=ComponentDetailResponse)
async def get_component_details(
    component_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Gibt detaillierte Komponenten-Daten zurück.
    Nutzt primär die in der DB gespeicherten Stats (vom SC-Import).
    Fällt bei fehlenden Daten auf Live-API-Call zurück.
    """
    component = db.query(Component).filter(Component.id == component_id).first()
    if not component:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Komponente nicht gefunden"
        )

    # Basis-Response
    response = ComponentDetailResponse(
        id=component.id,
        name=component.name,
        category=component.category,
        sub_category=component.sub_category,
        manufacturer=component.manufacturer,
        size=component.size,
        grade=component.grade,
        item_class=component.item_class
    )

    # Prüfen ob wir gespeicherte Stats haben
    sc_type = component.sc_type or ""

    # Shield Stats aus DB
    if sc_type in ("Shield", "ShieldGenerator") and component.shield_hp:
        response.shield = ShieldStats(
            max_shield_health=component.shield_hp,
            max_shield_regen=component.shield_regen,
            decay_ratio=None,
            downed_delay=None,
            damage_delay=None
        )

    # Power Stats aus DB
    if component.power_base or component.power_draw:
        response.power = PowerStats(
            power_base=component.power_base,
            power_draw=component.power_draw,
            em_min=None,
            em_max=None
        )

    # Cooler Stats aus DB
    if sc_type == "Cooler" and component.cooling_rate:
        response.cooler = CoolerStats(
            cooling_rate=component.cooling_rate,
            suppression_ir_factor=None,
            suppression_heat_factor=None
        )

    # Quantum Drive Stats aus DB
    if sc_type == "QuantumDrive" and (component.quantum_speed or component.quantum_range):
        response.quantum_drive = QuantumDriveStats(
            quantum_speed=component.quantum_speed,
            quantum_spool_time=None,
            quantum_cooldown_time=None,
            quantum_range=component.quantum_range,
            quantum_fuel_requirement=component.quantum_fuel_rate
        )

    # Raw Stats mit unseren gespeicherten Daten
    response.raw_stats = {}
    if component.durability:
        response.raw_stats["durability"] = {"health": component.durability}
    if component.volume:
        response.raw_stats["dimension"] = {"volume": component.volume}
    if component.class_name:
        response.raw_stats["class_name"] = component.class_name
    if component.shop_locations:
        response.raw_stats["shop_locations"] = component.shop_locations

    # Wenn wir keine gespeicherten Stats haben UND eine SC UUID existiert,
    # versuchen wir die API (nur als Fallback)
    has_any_stats = (response.shield or response.cooler or
                     response.power or response.quantum_drive)

    if not has_any_stats and component.sc_uuid:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                api_response = await client.get(f"{SC_API_BASE}/items/{component.sc_uuid}")

                if api_response.status_code == 200:
                    data = api_response.json().get("data", {})

                    # Beschreibung holen
                    desc = data.get("description")
                    if desc:
                        if isinstance(desc, dict):
                            response.description = desc.get("en_EN") or desc.get("de_DE")
                        elif isinstance(desc, str):
                            response.description = desc

                    # Stats aus API holen
                    if sc_type in ("Shield", "ShieldGenerator") and data.get("shield"):
                        shield_data = data["shield"]
                        regen_delay = shield_data.get("regen_delay", {})
                        response.shield = ShieldStats(
                            max_shield_health=shield_data.get("max_shield_health"),
                            max_shield_regen=shield_data.get("max_shield_regen"),
                            decay_ratio=shield_data.get("decay_ratio"),
                            downed_delay=regen_delay.get("downed"),
                            damage_delay=regen_delay.get("damage")
                        )

                    if data.get("power"):
                        power_data = data["power"]
                        response.power = PowerStats(
                            power_base=power_data.get("power_base"),
                            power_draw=power_data.get("power_draw"),
                            em_min=power_data.get("em_min"),
                            em_max=power_data.get("em_max")
                        )

                    if sc_type == "Cooler" and data.get("cooler"):
                        cooler_data = data["cooler"]
                        response.cooler = CoolerStats(
                            cooling_rate=cooler_data.get("cooling_rate"),
                            suppression_ir_factor=cooler_data.get("suppression_ir_factor"),
                            suppression_heat_factor=cooler_data.get("suppression_heat_factor")
                        )

                    if sc_type == "QuantumDrive" and data.get("quantum"):
                        quantum_data = data["quantum"]
                        response.quantum_drive = QuantumDriveStats(
                            quantum_speed=quantum_data.get("quantum_speed"),
                            quantum_spool_time=quantum_data.get("quantum_spool_time"),
                            quantum_cooldown_time=quantum_data.get("quantum_cooldown_time"),
                            quantum_range=quantum_data.get("quantum_range"),
                            quantum_fuel_requirement=quantum_data.get("quantum_fuel_requirement")
                        )

                    # Raw Stats erweitern
                    raw_keys = ["shield", "power", "heat", "distortion", "durability", "cooler", "quantum"]
                    for k in raw_keys:
                        if data.get(k):
                            response.raw_stats[k] = data[k]

        except Exception:
            # Bei API-Fehler einfach mit lokalen Daten weitermachen
            pass

    return response
