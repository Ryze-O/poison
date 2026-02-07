"""
Bulk-Import 4.6 META Loadouts aus Erkul-Links.

Für jedes Loadout:
1. Erkul-API abrufen -> Schiffsdaten + Komponenten
2. Schiff in DB suchen oder von FleetYards importieren
3. Meta-Loadout anlegen
4. Komponenten aus Erkul matchen und importieren

Verwendung:
    cd backend
    python -m scripts.import_meta_loadouts

Hinweis: Bereits existierende Loadouts (gleicher Name) werden übersprungen.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
import base64
import json
import time
from datetime import date

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.loadout import Ship, ShipHardpoint, MetaLoadout, MetaLoadoutItem
from app.models.component import Component
from app.models.user import User
from app.services.fleetyards_import import import_ship_from_fleetyards, search_ships_fleetyards

# ============== Erkul Import Config ==============

ERKUL_TYPE_MAP = {
    "power-plant": "power_plant",
    "cooler": "cooler",
    "shield": "shield",
    "qdrive": "quantum_drive",
    "weapon": "weapon_gun",
    "mount": "weapon_gun",
    "turret": "turret",
    "missile-rack": "missile_launcher",
}

SKIP_TYPES = {"paint", "controller-flight", "radar", "life-support", "jumpdrive"}

# ============== Schiff-Suche Overrides ==============
# Für Schiffe wo der automatische Name-Match nicht klappt
SHIP_SEARCH_OVERRIDES = {
    "Connie Anti-Jäger": "constellation andromeda",
    "Connie Anti-GKS": "constellation andromeda",
    "A1 Bomber": "hercules a1",
    "A2 Bomber": "hercules a2",
    "Hercules": "hercules c2",
    "Ghost Mk2": "hornet ghost",
    "Ghost Mk2 E.W.": "hornet ghost",
    "Hornet Ghost Mk2": "hornet ghost",
    "Guardian MX B": "vanguard sentinel",
    "Guardian MX G-B": "vanguard sentinel",
    "Guardian G-B": "vanguard warden",
    "Guardian QI": "vanguard harbinger",
    "Razer EX B": "razor ex",
    "Scorpius Dual": "scorpius",
    "Scorpius Solo": "scorpius",
    "Scorpius Dual E.W.A.": "scorpius",
    "Cutlass": "cutlass black",
    "Pisces Medic": "pisces",
}

# ============== Loadout-Liste ==============

LOADOUTS = [
    # Ground
    {"name": "Storm", "category": "Ground", "code": "I9fdCPv1"},
    {"name": "Ballista", "category": "Ground", "code": "9KaUWLCy"},
    {"name": "Centurion B", "category": "Ground", "code": "GauxVzX6"},
    {"name": "Centurion L", "category": "Ground", "code": "V6FNfkKK"},
    {"name": "Nova", "category": "Ground", "code": "7jrKLPag"},
    # Snubs
    {"name": "Fury B", "category": "Snubs", "code": "00TNdg5h"},
    # Light Fighter
    {"name": "Wolf B", "category": "Light Fighter", "code": "NaKtAyUY"},
    {"name": "Arrow B", "category": "Light Fighter", "code": "qqIBE7Sz"},
    {"name": "Gladius B", "category": "Light Fighter", "code": "4ZwmqCps"},
    # Medium Fighter
    {"name": "Sabre Dogfight B", "category": "Medium Fighter", "code": "b2JX1q4Y"},
    {"name": "Hornet Mk2 L", "category": "Medium Fighter", "code": "b4DmpcHX"},
    {"name": "Hornet Mk2 B", "category": "Medium Fighter", "code": "FALlXCcY"},
    # Heavy Fighter
    {"name": "Guardian MX B", "category": "Heavy Fighter", "code": "OiwxD85J"},
    {"name": "Lightning B", "category": "Heavy Fighter", "code": "mZi1Ff47"},
    # Aufklärer
    {"name": "Sabre Scout", "category": "Aufklärer", "code": "lJszVNBT"},
    {"name": "Firebird", "category": "Aufklärer", "code": "9Re7IiuF"},
    {"name": "Hornet Ghost Mk2", "category": "Aufklärer", "code": "CkTcDqc4"},
    # Interceptor
    {"name": "Razer EX B", "category": "Interceptor", "code": "LNXi1HRd"},
    {"name": "Buccaneer B", "category": "Interceptor", "code": "93OIRD2j"},
    {"name": "Scorpius Dual", "category": "Interceptor", "code": "9nC2nHxq"},
    {"name": "Scorpius Solo", "category": "Interceptor", "code": "VO5O8oi5"},
    # Interdictor
    {"name": "Mantis", "category": "Interdictor", "code": "ApQr6v6D"},
    {"name": "Guardian QI", "category": "Interdictor", "code": "LYxmy343"},
    # Electronic Warfare
    {"name": "Avenger Warlock", "category": "Electronic Warfare", "code": "XwMtAmnq"},
    {"name": "Buccaneer E.W.", "category": "Electronic Warfare", "code": "EXX8RuOU"},
    {"name": "Hawk", "category": "Electronic Warfare", "code": "7qaP47Q0"},
    {"name": "Ghost Mk2 E.W.", "category": "Electronic Warfare", "code": "m18QAw0l"},
    {"name": "Lightning E.W.", "category": "Electronic Warfare", "code": "YKTSJ52h"},
    {"name": "Scorpius Dual E.W.A.", "category": "Electronic Warfare", "code": "ISdaTF5w"},
    # Anti-GKS Fighter
    {"name": "Hornet Mk2 G", "category": "Anti-GKS Fighter", "code": "8NbrlZto"},
    {"name": "Gladiator G", "category": "Anti-GKS Fighter", "code": "RVimgcYt"},
    {"name": "Lightning G-B", "category": "Anti-GKS Fighter", "code": "sf8tLVq0"},
    {"name": "Guardian G-B", "category": "Anti-GKS Fighter", "code": "PtLv9uLT"},
    {"name": "Guardian MX G-B", "category": "Anti-GKS Fighter", "code": "zW6Sr515"},
    {"name": "Ares", "category": "Anti-GKS Fighter", "code": "SjgJyn9U"},
    # Torpedo-/Bomber
    {"name": "Gladius Bomber", "category": "Torpedo-/Bomber", "code": "PMoxGGxB"},
    {"name": "Gladiator Bomber", "category": "Torpedo-/Bomber", "code": "RVimgcYt"},
    {"name": "Eclipse", "category": "Torpedo-/Bomber", "code": "gt6awdpg"},
    {"name": "A1 Bomber", "category": "Torpedo-/Bomber", "code": "FuYbLB3d"},
    {"name": "A2 Bomber", "category": "Torpedo-/Bomber", "code": "gufG0SkX"},
    # Gunships
    {"name": "Paladin Anti-Jäger", "category": "Gunships", "code": "XkMiwiO3"},
    {"name": "Paladin Anti-GKS", "category": "Gunships", "code": "PUoFLqBq"},
    {"name": "Connie Anti-Jäger", "category": "Gunships", "code": "vn1AruoT"},
    {"name": "Connie Anti-GKS", "category": "Gunships", "code": "sX95ssqV"},
    # Medics
    {"name": "Pisces Medic", "category": "Medics", "code": "5RoryXlj"},
    {"name": "Terrapin Medic", "category": "Medics", "code": "uYvqaOnK"},
    {"name": "Apollo", "category": "Medics", "code": "EORX2Esq"},
    # Transporter
    {"name": "Golem Ox", "category": "Transporter", "code": "AO77hrcP"},
    {"name": "Hermes", "category": "Transporter", "code": "p7i1Ytgv"},
    # Dropships
    {"name": "Cutlass", "category": "Dropships", "code": "DfkFh9xV"},
    {"name": "Asgard", "category": "Dropships", "code": "HH25hozS"},
    {"name": "Starlancer", "category": "Dropships", "code": "EINAMXT1"},
    {"name": "Hercules", "category": "Dropships", "code": "gufG0SkX"},
    # Sub GKS
    {"name": "Perseus", "category": "Sub GKS", "code": "vTlKX7PX",
     "notes": "Alle PDT auf Ballistic: Torrent"},
    {"name": "Hammerhead", "category": "Sub GKS", "code": "LibzVNdX"},
    # GKS
    {"name": "Polaris Mixed B/L", "category": "GKS", "code": "Abx7m701",
     "notes": "BB Breakneck, SB Attrition 4; Hinterer-BB Mantis, Hinterer-SB Ardor 3, R-Turret Suckerpunch XL. Alle PDT auf Ballistic: Torrent"},
    {"name": "Idris", "category": "GKS", "code": "qOGPMgZ8",
     "notes": "T1 Conqueror-7 oder Deadbolt V, T2/3 CF-557, T5/6 AD5B, T7/8 Attrition 5, T9 AD5B. Remote Turret 10/12 Breakneck, Remote Turret 11/14 Breakneck. Alle PDT auf Ballistic: Torrent"},
]


# ============== Erkul API ==============

def fetch_erkul(code: str) -> dict:
    """Erkul-Loadout abrufen und dekodieren."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            f"https://server.erkul.games/loadouts/{code}",
            headers={
                "Origin": "https://www.erkul.games",
                "Referer": "https://www.erkul.games/",
            }
        )
        resp.raise_for_status()
        data = resp.json()

    loadout_json = json.loads(base64.b64decode(data["loadout"]))

    return {
        "erkul_name": data.get("name", ""),
        "ship_local": loadout_json.get("ship", {}).get("localName", ""),
        "items": loadout_json.get("loadout", []),
    }


def extract_components(erkul_items: list) -> list[tuple[str, str]]:
    """Erkul-Items in (hardpoint_type, local_name) Paare umwandeln."""
    result = []

    for item_data in (erkul_items or []):
        calc_type = item_data.get("item", {}).get("calculatorType", "")
        local_name = item_data.get("item", {}).get("localName", "")
        is_stock = item_data.get("item", {}).get("stock", False)

        if calc_type in SKIP_TYPES or not local_name:
            continue

        # Mount -> Unter-Waffe extrahieren
        if calc_type == "mount":
            sub_items = item_data.get("loadout", [])
            for sub in sub_items:
                sub_type = sub.get("item", {}).get("calculatorType", "")
                sub_name = sub.get("item", {}).get("localName", "")
                if sub_type == "weapon" and sub_name:
                    result.append(("weapon_gun", sub_name))
            continue

        # Missile-Rack: Rack selbst behalten, Einzelraketen ignorieren
        if calc_type == "missile-rack":
            if not is_stock:
                result.append(("missile_launcher", local_name))
            continue

        # Normale Komponente
        hp_type = ERKUL_TYPE_MAP.get(calc_type)
        if hp_type and not is_stock:
            result.append((hp_type, local_name))

    return result


# ============== Schiff-Auflösung ==============

def resolve_ship(db: Session, display_name: str, erkul_ship_local: str) -> Ship | None:
    """Schiff in DB finden oder von FleetYards importieren."""

    # 1. Override-Map prüfen
    search_term = SHIP_SEARCH_OVERRIDES.get(display_name)

    # 2. Aus Erkul localName ableiten (z.B. "aegs_gladius" -> "gladius")
    if not search_term:
        parts = erkul_ship_local.split("_", 1)
        search_term = parts[1].replace("_", " ") if len(parts) > 1 else erkul_ship_local

    # 3. In DB suchen (case-insensitive, flexible Suche)
    for term in [search_term, search_term.split()[0] if " " in search_term else None]:
        if not term:
            continue
        ship = db.query(Ship).filter(
            Ship.name.ilike(f"%{term}%")
        ).first()
        if ship:
            return ship

    # 4. FleetYards durchsuchen
    for term in [search_term, display_name.split()[0]]:
        results = search_ships_fleetyards(term)
        if results:
            slug = results[0]["slug"]
            # Prüfen ob wir das Schiff schon haben
            existing = db.query(Ship).filter(Ship.slug == slug).first()
            if existing:
                return existing
            try:
                ship = import_ship_from_fleetyards(db, slug)
                db.commit()
                print(f"  -> Von FleetYards importiert: {ship.name} (slug={slug})")
                return ship
            except Exception as e:
                print(f"  -> FleetYards-Import fehlgeschlagen für '{slug}': {e}")

    # 5. Fallback: Minimalen Ship-Eintrag anlegen
    ship_name = display_name.split()[0]
    print(f"  -> Neues Schiff angelegt (ohne FleetYards): {ship_name}")
    ship = Ship(name=ship_name, slug=None)
    db.add(ship)
    db.flush()
    return ship


# ============== Komponenten-Import ==============

def import_loadout_items(
    db: Session,
    loadout: MetaLoadout,
    erkul_items: list,
) -> tuple[int, list[str]]:
    """Erkul-Items als MetaLoadoutItems importieren. Gibt (imported, unmatched) zurück."""
    extracted = extract_components(erkul_items)

    slot_counters: dict[str, int] = {}
    imported = 0
    unmatched = []

    for hp_type, erkul_local_name in extracted:
        slot_idx = slot_counters.get(hp_type, 0)
        slot_counters[hp_type] = slot_idx + 1

        # Case-insensitive Match gegen class_name
        component = db.query(Component).filter(
            Component.class_name.ilike(erkul_local_name)
        ).first()

        if not component:
            unmatched.append(erkul_local_name)
            continue

        # Hardpoint finden (wenn vorhanden)
        hardpoint = db.query(ShipHardpoint).filter(
            ShipHardpoint.ship_id == loadout.ship_id,
            ShipHardpoint.hardpoint_type == hp_type,
            ShipHardpoint.slot_index == slot_idx,
        ).first()

        item = MetaLoadoutItem(
            loadout_id=loadout.id,
            hardpoint_type=hp_type,
            slot_index=slot_idx,
            component_id=component.id,
            hardpoint_id=hardpoint.id if hardpoint else None,
        )
        db.add(item)
        imported += 1

    return imported, unmatched


# ============== Hauptprogramm ==============

def main():
    db = SessionLocal()

    # Admin-User für created_by
    admin = db.query(User).filter(User.role == "admin").first()
    if not admin:
        print("FEHLER: Kein Admin-User gefunden!")
        return

    print(f"Admin: {admin.username} (ID {admin.id})")
    today = date.today()

    created = 0
    skipped = 0
    failed = 0
    total_items = 0
    all_unmatched = []

    for entry in LOADOUTS:
        name = entry["name"]
        category = entry["category"]
        code = entry["code"]
        notes = entry.get("notes")

        print(f"\n{'='*50}")
        print(f"  {name} [{category}]")
        print(f"  erkul.games/loadout/{code}")

        # Duplikat-Check
        existing = db.query(MetaLoadout).filter(MetaLoadout.name == name).first()
        if existing:
            print(f"  SKIP: Existiert bereits (ID {existing.id})")
            skipped += 1
            continue

        # Erkul abrufen
        try:
            erkul = fetch_erkul(code)
            print(f"  Erkul: '{erkul['erkul_name']}' -> ship={erkul['ship_local']}")
        except Exception as e:
            print(f"  FAIL: Erkul-Abruf fehlgeschlagen: {e}")
            failed += 1
            continue

        # Schiff auflösen
        ship = resolve_ship(db, name, erkul["ship_local"])
        if not ship:
            print(f"  FAIL: Schiff nicht gefunden")
            failed += 1
            continue

        print(f"  Schiff: {ship.name} (ID {ship.id})")

        # Meta-Loadout anlegen
        desc_parts = [category]
        if notes:
            desc_parts.append(notes)

        loadout = MetaLoadout(
            ship_id=ship.id,
            name=name,
            description=" | ".join(desc_parts),
            erkul_link=f"https://www.erkul.games/loadout/{code}",
            is_active=True,
            version_date=today,
            created_by_id=admin.id,
        )
        db.add(loadout)
        db.flush()

        # Komponenten importieren
        num_imported, unmatched = import_loadout_items(db, loadout, erkul["items"])
        total_items += num_imported

        if unmatched:
            all_unmatched.extend(unmatched)
            print(f"  OK ID {loadout.id}: {num_imported} Items | {len(unmatched)} unmatched: {', '.join(unmatched[:3])}")
        else:
            print(f"  OK ID {loadout.id}: {num_imported} Items importiert")

        db.commit()
        created += 1

        # API-Rate-Limit respektieren
        time.sleep(0.3)

    # Zusammenfassung
    print(f"\n{'='*50}")
    print(f"FERTIG:")
    print(f"  {created} Loadouts erstellt ({total_items} Items)")
    print(f"  {skipped} übersprungen (existierten bereits)")
    print(f"  {failed} fehlgeschlagen")

    if all_unmatched:
        unique_unmatched = sorted(set(all_unmatched))
        print(f"\n  {len(unique_unmatched)} einzigartige unmatched Komponenten:")
        for name in unique_unmatched:
            print(f"    - {name}")

    db.close()


if __name__ == "__main__":
    main()
