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
        self.client = httpx.Client(timeout=30.0, follow_redirects=True)

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
        consecutive_errors = 0

        while page <= min(total_pages, max_pages):
            try:
                response = self.client.get(
                    f"{SC_API_BASE}/items",
                    params={"page": page, "limit": 100}
                )

                if response.status_code != 200:
                    self.stats.errors.append(f"API-Fehler Seite {page}: {response.status_code}")
                    consecutive_errors += 1
                    page += 1
                    # Nach 3 aufeinanderfolgenden Fehlern abbrechen
                    if consecutive_errors >= 3:
                        self.stats.errors.append("Abbruch nach 3 aufeinanderfolgenden API-Fehlern")
                        break
                    continue

                consecutive_errors = 0  # Reset bei Erfolg
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
                consecutive_errors += 1
                page += 1
                if consecutive_errors >= 3:
                    self.stats.errors.append("Abbruch nach 3 aufeinanderfolgenden Fehlern")
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

        # Erweiterte Daten extrahieren
        class_name = item.get("class_name")
        if class_name and len(class_name) > 200:
            class_name = class_name[:200]

        grade = item.get("grade")
        if grade and len(str(grade)) > 10:
            grade = str(grade)[:10]

        item_class = item.get("class")
        if item_class and len(str(item_class)) > 50:
            item_class = str(item_class)[:50]

        size = item.get("size")

        # Dimension/Volume extrahieren
        volume = None
        dimension = item.get("dimension", {})
        if dimension:
            volume = dimension.get("volume")

        # Durability aus durability oder health
        durability = None
        durability_data = item.get("durability", {})
        if durability_data:
            durability = durability_data.get("health")

        # Power-Daten
        power_base = None
        power_draw = None

        # Typ-spezifische Stats
        cooling_rate = None
        shield_hp = None
        shield_regen = None
        power_output = None
        quantum_speed = None
        quantum_range = None
        quantum_fuel_rate = None

        # Shield-Daten
        shield_data = item.get("shield", {})
        if shield_data:
            shield_hp = shield_data.get("max_health")
            shield_regen = shield_data.get("regen_rate")
            power_base = shield_data.get("power_base")
            power_draw = shield_data.get("power_draw")

        # Cooler-Daten
        cooler_data = item.get("cooler", {})
        if cooler_data:
            cooling_rate = cooler_data.get("cooling_rate") or cooler_data.get("max_cooling_rate")
            power_base = power_base or cooler_data.get("power_base")
            power_draw = power_draw or cooler_data.get("power_draw")

        # Power Plant-Daten
        power_plant_data = item.get("power_plant", {})
        if power_plant_data:
            power_output = power_plant_data.get("power_output") or power_plant_data.get("power_generated")

        # Quantum Drive-Daten
        quantum_data = item.get("quantum_drive", {}) or item.get("quantum", {})
        if quantum_data:
            quantum_speed = quantum_data.get("quantum_speed") or quantum_data.get("speed")
            quantum_range = quantum_data.get("quantum_range") or quantum_data.get("range")
            quantum_fuel_rate = quantum_data.get("quantum_fuel_requirement") or quantum_data.get("fuel_rate")

        # Shop-Daten extrahieren
        shop_locations = None
        shops = item.get("shops", [])
        if shops:
            shop_names = [s.get("name", "") for s in shops if s.get("name")]
            if shop_names:
                shop_locations = ", ".join(shop_names[:10])  # Max 10 Shops

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
            # Erweiterte Felder
            existing.class_name = class_name
            existing.grade = grade
            existing.item_class = item_class
            existing.size = size
            existing.volume = volume
            existing.durability = durability
            existing.power_base = power_base
            existing.power_draw = power_draw
            existing.cooling_rate = cooling_rate
            existing.shield_hp = shield_hp
            existing.shield_regen = shield_regen
            existing.power_output = power_output
            existing.quantum_speed = quantum_speed
            existing.quantum_range = quantum_range
            existing.quantum_fuel_rate = quantum_fuel_rate
            existing.shop_locations = shop_locations
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
                is_predefined=True,
                # Erweiterte Felder
                class_name=class_name,
                grade=grade,
                item_class=item_class,
                size=size,
                volume=volume,
                durability=durability,
                power_base=power_base,
                power_draw=power_draw,
                cooling_rate=cooling_rate,
                shield_hp=shield_hp,
                shield_regen=shield_regen,
                power_output=power_output,
                quantum_speed=quantum_speed,
                quantum_range=quantum_range,
                quantum_fuel_rate=quantum_fuel_rate,
                shop_locations=shop_locations
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
