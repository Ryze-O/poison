"""
Star Citizen Data Import Service.
Importiert Komponenten und Orte von der star-citizen.wiki API.
"""
import httpx
from typing import Optional
from sqlalchemy.orm import Session

from app.models.component import Component, SCLocation
from app.schemas.component import SCImportStats


SC_API_BASE = "https://api.star-citizen.wiki/api/v2"

# Mapping von SC-API Typen zu unseren Kategorien (englische Bezeichnungen)
COMPONENT_TYPE_MAPPING = {
    # Ship Components
    "Cooler": ("Ship Components", "Coolers"),
    "PowerPlant": ("Ship Components", "Power Plants"),
    "QuantumDrive": ("Ship Components", "Quantum Drives"),
    "Shield": ("Ship Components", "Shields"),
    "ShieldGenerator": ("Ship Components", "Shields"),
    "QuantumInterdictionGenerator": ("Ship Components", "Interdiction"),
    "Radar": ("Ship Components", "Radar"),
    "Computer": ("Ship Components", "Computers"),
    "MiningLaser": ("Ship Components", "Mining Lasers"),
    "FuelIntake": ("Ship Components", "Fuel Intakes"),
    "FuelTank": ("Ship Components", "Fuel Tanks"),
    "QuantumFuelTank": ("Ship Components", "Quantum Fuel Tanks"),
    "Relay": ("Ship Components", "Relays"),

    # Ship Weapons
    "WeaponGun": ("Ship Weapons", "Guns"),
    "WeaponMining": ("Ship Weapons", "Mining Weapons"),
    "Turret": ("Ship Weapons", "Turrets"),
    "TurretBase": ("Ship Weapons", "Turrets"),
    "MissileLauncher": ("Ship Weapons", "Missile Launchers"),
    "Missile": ("Ship Weapons", "Missiles"),
    "Bomb": ("Ship Weapons", "Bombs"),
    "WeaponDefensive": ("Ship Weapons", "Defensive"),

    # FPS Weapons & Equipment
    "WeaponPersonal": ("FPS Weapons", "Weapons"),
    "WeaponAttachment": ("FPS Weapons", "Attachments"),
    "Grenade": ("FPS Weapons", "Grenades"),
    "KnifeTool": ("FPS Weapons", "Knives"),
    "MedicalTool": ("FPS Equipment", "Medical"),

    # Armor
    "Char_Armor_Helmet": ("Armor", "Helmets"),
    "Char_Armor_Torso": ("Armor", "Torso"),
    "Char_Armor_Arms": ("Armor", "Arms"),
    "Char_Armor_Legs": ("Armor", "Legs"),
    "Char_Armor_Backpack": ("Armor", "Backpacks"),
    "Char_Armor_Undersuit": ("Armor", "Undersuits"),

    # Ammunition
    "AmmoContainer": ("Ammunition", "Magazines"),

    # Salvage
    "SalvageFillerStation": ("Salvage", "Filler Stations"),
    "SalvageInternalStorage": ("Salvage", "Internal Storage"),
}


class SCImportService:
    """Service für den Import von Star Citizen Daten."""

    def __init__(self, db: Session):
        self.db = db
        self.stats = SCImportStats()
        self.client = httpx.Client(timeout=30.0)

    def __del__(self):
        if hasattr(self, 'client'):
            self.client.close()

    def import_all(self) -> SCImportStats:
        """Importiert alle relevanten SC-Daten."""
        # Hole zuerst die aktuelle SC-Version
        version = self._get_sc_version()
        self.stats.sc_version = version

        # Importiere Komponenten
        self._import_components()

        # Importiere Orte mit Shops
        self._import_locations()

        return self.stats

    def _get_sc_version(self) -> Optional[str]:
        """Ermittelt die aktuelle SC-Version aus der API."""
        try:
            response = self.client.get(f"{SC_API_BASE}/vehicles?limit=1")
            if response.status_code == 200:
                data = response.json()
                if data.get("data") and len(data["data"]) > 0:
                    version = data["data"][0].get("version")
                    if version and len(version) > 20:
                        version = version[:20]
                    return version
        except Exception as e:
            self.stats.errors.append(f"Fehler beim Abrufen der SC-Version: {str(e)}")
        return None

    def _import_components(self):
        """Importiert Schiffskomponenten und Waffen."""
        page = 1
        total_pages = 1
        max_pages = 500  # Limit um Timeout zu vermeiden

        while page <= min(total_pages, max_pages):
            try:
                response = self.client.get(
                    f"{SC_API_BASE}/items",
                    params={"page": page, "limit": 100}
                )

                if response.status_code != 200:
                    self.stats.errors.append(f"API-Fehler Seite {page}: {response.status_code}")
                    break

                data = response.json()
                total_pages = data.get("meta", {}).get("last_page", 1)
                items = data.get("data", [])

                for item in items:
                    try:
                        self._process_item(item)
                    except Exception as item_error:
                        self.stats.errors.append(f"Fehler bei Item {item.get('name', 'Unknown')}: {str(item_error)}")

                # Commit jede Seite um Datenverlust bei Fehlern zu minimieren
                try:
                    self.db.commit()
                except Exception as commit_error:
                    self.db.rollback()
                    self.stats.errors.append(f"Commit-Fehler Seite {page}: {str(commit_error)}")

                page += 1

            except Exception as e:
                self.stats.errors.append(f"Fehler auf Seite {page}: {str(e)}")
                break

        # Finaler Commit (falls letzte Seite erfolgreich war)
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()

        if total_pages > max_pages:
            self.stats.errors.append(f"Import auf {max_pages} Seiten limitiert (von {total_pages})")

    def _process_item(self, item: dict):
        """Verarbeitet ein einzelnes Item aus der API."""
        sc_type = item.get("type", "")

        # Nur relevante Typen importieren
        if sc_type not in COMPONENT_TYPE_MAPPING:
            return

        category, sub_category = COMPONENT_TYPE_MAPPING[sc_type]
        uuid = item.get("uuid")

        # UUID ist Pflicht
        if not uuid:
            return

        name = item.get("name", "Unknown")

        # Namen auf maximale Länge beschränken
        if len(name) > 200:
            name = name[:200]

        # sc_uuid auf 50 Zeichen beschränken
        if len(uuid) > 50:
            uuid = uuid[:50]

        # Hersteller extrahieren
        manufacturer = None
        mfr_data = item.get("manufacturer")
        if mfr_data:
            manufacturer = mfr_data.get("name") or mfr_data.get("code")
            if manufacturer and len(manufacturer) > 100:
                manufacturer = manufacturer[:100]

        # sc_type beschränken
        if sc_type and len(sc_type) > 100:
            sc_type = sc_type[:100]

        # Prüfen ob bereits vorhanden (via UUID)
        existing = self.db.query(Component).filter(Component.sc_uuid == uuid).first()

        if existing:
            # Update
            existing.name = name
            existing.category = category
            existing.sub_category = sub_category
            existing.manufacturer = manufacturer
            existing.sc_type = sc_type
            existing.sc_version = self.stats.sc_version
            existing.is_predefined = True
            self.stats.components_updated += 1
        else:
            # Neu anlegen
            component = Component(
                name=name,
                category=category,
                sub_category=sub_category,
                sc_uuid=uuid,
                manufacturer=manufacturer,
                sc_type=sc_type,
                sc_version=self.stats.sc_version,
                is_predefined=True
            )
            self.db.add(component)
            self.stats.components_added += 1

    def _import_locations(self):
        """Importiert Orte mit Shops aus der Starmap."""
        try:
            # Hole alle Sternensysteme
            response = self.client.get(f"{SC_API_BASE}/starsystems?limit=100")
            if response.status_code != 200:
                self.stats.errors.append(f"Starmap API-Fehler: {response.status_code}")
                return

            data = response.json()
            systems = data.get("data", [])

            for system in systems:
                system_name = system.get("name")
                # Hole Details für jedes System
                self._import_system_locations(system_name)

            self.db.commit()

        except Exception as e:
            self.stats.errors.append(f"Fehler beim Location-Import: {str(e)}")

    def _import_system_locations(self, system_name: str):
        """Importiert Locations eines Sternensystems."""
        try:
            response = self.client.get(f"{SC_API_BASE}/starsystems/{system_name}")
            if response.status_code != 200:
                return

            data = response.json().get("data", {})

            # Celestial Objects (Planeten, Monde, Stationen)
            celestial_objects = data.get("celestial_objects", [])
            for obj in celestial_objects:
                self._process_celestial_object(obj, system_name, None)

        except Exception as e:
            self.stats.errors.append(f"Fehler bei System {system_name}: {str(e)}")

    def _process_celestial_object(self, obj: dict, system_name: str, parent_name: Optional[str]):
        """Verarbeitet ein celestial object rekursiv."""
        obj_type = obj.get("type", "")
        name = obj.get("name", "Unknown")
        designation = obj.get("designation")

        # Nur Stationen und ähnliche Orte mit Shops
        location_types = ["STATION", "LANDING_ZONE", "OUTPOST", "CITY", "SETTLEMENT"]

        if obj_type.upper() in location_types:
            display_name = designation or name
            if len(display_name) > 200:
                display_name = display_name[:200]

            existing = self.db.query(SCLocation).filter(
                SCLocation.name == display_name,
                SCLocation.system_name == system_name
            ).first()

            if existing:
                existing.location_type = obj_type
                existing.parent_name = parent_name
                existing.has_shops = True
                self.stats.locations_updated += 1
            else:
                location = SCLocation(
                    name=display_name,
                    location_type=obj_type,
                    parent_name=parent_name,
                    system_name=system_name,
                    has_shops=True
                )
                self.db.add(location)
                self.stats.locations_added += 1

        # Rekursiv für Kinder (Monde um Planeten, etc.)
        children = obj.get("children", [])
        current_name = obj.get("designation") or name
        for child in children:
            self._process_celestial_object(child, system_name, current_name)


def run_sc_import(db: Session) -> SCImportStats:
    """Führt den SC-Import aus."""
    service = SCImportService(db)
    return service.import_all()
