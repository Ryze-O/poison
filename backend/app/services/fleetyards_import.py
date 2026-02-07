"""FleetYards API Import für Schiffsdaten und Hardpoints."""

import httpx
from sqlalchemy.orm import Session

from app.models.loadout import Ship, ShipHardpoint

FLEETYARDS_BASE = "https://api.fleetyards.net/v1"

# Mapping FleetYards hardpoint type → unsere Typen
HARDPOINT_TYPE_MAP = {
    "power_plants": "power_plant",
    "coolers": "cooler",
    "shields": "shield",
    "quantum_drives": "quantum_drive",
    "weapons": "weapon_gun",
    "turrets": "turret",
    "missiles": "missile_launcher",
}

# Hardpoint-Gruppen die wir importieren
RELEVANT_GROUPS = {"system", "weapon"}

# Hardpoint-Typen die wir importieren
RELEVANT_TYPES = set(HARDPOINT_TYPE_MAP.keys())


def _parse_size(size_value) -> int:
    """Parse FleetYards size (kann String oder Int sein)."""
    if isinstance(size_value, int):
        return size_value
    if isinstance(size_value, str):
        # z.B. "3" oder "S (1)"
        try:
            return int(size_value)
        except ValueError:
            # "S (1)" → versuche Zahl in Klammern
            import re
            match = re.search(r'\((\d+)\)', size_value)
            if match:
                return int(match.group(1))
    return 0


def fetch_ship_model(slug: str) -> dict | None:
    """Hole Schiffsdaten von FleetYards API."""
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        resp = client.get(f"{FLEETYARDS_BASE}/models/{slug}")
        if resp.status_code != 200:
            return None
        return resp.json()


def fetch_ship_hardpoints(slug: str) -> list[dict] | None:
    """Hole Hardpoints von FleetYards API."""
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        resp = client.get(f"{FLEETYARDS_BASE}/models/{slug}/hardpoints")
        if resp.status_code != 200:
            return None
        return resp.json()


def import_ship_from_fleetyards(db: Session, slug: str) -> Ship:
    """Importiere/aktualisiere Schiff + Hardpoints von FleetYards.

    Returns:
        Ship-Objekt (neues oder aktualisiertes)

    Raises:
        ValueError: Wenn Schiff nicht gefunden
    """
    model_data = fetch_ship_model(slug)
    if not model_data:
        raise ValueError(f"Schiff '{slug}' nicht bei FleetYards gefunden")

    hardpoint_data = fetch_ship_hardpoints(slug)
    if hardpoint_data is None:
        raise ValueError(f"Hardpoints für '{slug}' konnten nicht geladen werden")

    # Schiff finden oder anlegen
    ship = db.query(Ship).filter(Ship.slug == slug).first()
    if not ship:
        ship = Ship(slug=slug)
        db.add(ship)

    # Schiffsdaten aktualisieren
    ship.name = model_data.get("name", slug)
    ship.manufacturer = model_data.get("manufacturer", {}).get("name") if model_data.get("manufacturer") else None

    # Bild: angledView bevorzugt, dann storeImage
    media = model_data.get("media", {})
    image_url = None
    for view in ["angledView", "storeImage", "sideView", "frontView"]:
        view_data = media.get(view)
        if view_data and view_data.get("source"):
            image_url = view_data["source"]
            break
    ship.image_url = image_url

    # Size / Focus
    metrics = model_data.get("metrics", {})
    ship.size_class = metrics.get("size")
    ship.focus = model_data.get("focus")

    db.flush()  # Ship-ID generieren

    # Alte Hardpoints löschen
    db.query(ShipHardpoint).filter(ShipHardpoint.ship_id == ship.id).delete()

    # Neue Hardpoints importieren
    slot_counters: dict[str, int] = {}  # Pro Typ Slot-Counter

    for hp in hardpoint_data:
        hp_type = hp.get("type", "")
        hp_group = hp.get("group", "")

        if hp_type not in RELEVANT_TYPES:
            continue

        our_type = HARDPOINT_TYPE_MAP[hp_type]
        size = _parse_size(hp.get("size", 0))
        if size <= 0:
            continue

        # Component: kann direkt oder in loadouts verschachtelt sein
        component_name = None
        component = hp.get("component")
        if component:
            component_name = component.get("name")

        # Bei Waffen: echte Waffe ist oft in loadouts[0].component
        loadouts = hp.get("loadouts", [])
        if loadouts and loadouts[0].get("component"):
            component_name = loadouts[0]["component"].get("name") or component_name
            # Size der tatsächlichen Waffe
            loadout_size = _parse_size(loadouts[0].get("size", 0))
            if loadout_size > 0:
                size = loadout_size

        # Slot-Index zählen
        if our_type not in slot_counters:
            slot_counters[our_type] = 0
        slot_index = slot_counters[our_type]
        slot_counters[our_type] += 1

        hardpoint = ShipHardpoint(
            ship_id=ship.id,
            hardpoint_type=our_type,
            size=size,
            slot_index=slot_index,
            default_component_name=component_name,
        )
        db.add(hardpoint)

    db.flush()
    return ship


def search_ships_fleetyards(query: str) -> list[dict]:
    """Suche Schiffe auf FleetYards (für Autocomplete)."""
    with httpx.Client(timeout=15.0, follow_redirects=True) as client:
        resp = client.get(
            f"{FLEETYARDS_BASE}/models",
            params={"q[nameCont]": query, "perPage": 10},
        )
        if resp.status_code != 200:
            return []
        results = resp.json()
        return [
            {
                "name": m.get("name", ""),
                "slug": m.get("slug", ""),
                "manufacturer": m.get("manufacturer", {}).get("name", "") if m.get("manufacturer") else "",
            }
            for m in results
        ]
