"""
UEX API Import Service.
Importiert Preise und Shop-Standorte von der UEX API (uexcorp.space).
"""
import httpx
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.models.component import Component
from app.models.item_price import ItemPrice, UEXSyncLog


UEX_API_BASE = "https://api.uexcorp.uk/2.0"


class UEXImportService:
    """Service für den Import von UEX Preisdaten."""

    def __init__(self, db: Session):
        self.db = db
        self.client = httpx.Client(timeout=60.0, follow_redirects=True)
        self.log: Optional[UEXSyncLog] = None

    def __del__(self):
        if hasattr(self, 'client'):
            self.client.close()

    def sync_prices(self) -> UEXSyncLog:
        """Synchronisiert alle Preisdaten von UEX."""
        # Erstelle Log-Eintrag
        self.log = UEXSyncLog(status="running")
        self.db.add(self.log)
        self.db.commit()

        try:
            # Hole alle Preise von UEX
            prices_data = self._fetch_all_prices()

            if not prices_data:
                self.log.status = "failed"
                self.log.errors = "Keine Daten von UEX API erhalten"
                self.log.finished_at = func.now()
                self.db.commit()
                return self.log

            # Baue UUID -> Component Mapping für schnelles Matching
            uuid_to_component = self._build_uuid_mapping()

            # Lösche alte Preise (vollständiger Sync)
            self.db.query(ItemPrice).delete()
            self.db.commit()

            # Verarbeite Preisdaten
            items_matched = 0
            items_unmatched = 0

            for price_entry in prices_data:
                try:
                    component_id = self._match_component(price_entry, uuid_to_component)

                    item_price = ItemPrice(
                        component_id=component_id,
                        uex_id=price_entry.get("id"),
                        item_uuid=price_entry.get("item_uuid"),
                        item_name=price_entry.get("item_name", "Unknown"),
                        terminal_id=price_entry.get("id_terminal"),
                        terminal_name=price_entry.get("terminal_name", "Unknown"),
                        price_buy=price_entry.get("price_buy"),
                        price_sell=price_entry.get("price_sell"),
                        category_id=price_entry.get("id_category"),
                        date_added=self._parse_timestamp(price_entry.get("date_added")),
                        date_modified=self._parse_timestamp(price_entry.get("date_modified")),
                    )
                    self.db.add(item_price)

                    if component_id:
                        items_matched += 1
                    else:
                        items_unmatched += 1

                except Exception as e:
                    # Einzelne Fehler nicht abbrechen lassen
                    pass

            self.db.commit()

            # Update Log
            self.log.items_processed = len(prices_data)
            self.log.items_matched = items_matched
            self.log.items_unmatched = items_unmatched
            self.log.status = "completed"
            self.log.finished_at = func.now()
            self.db.commit()

        except Exception as e:
            self.log.status = "failed"
            self.log.errors = str(e)[:2000]
            self.log.finished_at = func.now()
            self.db.commit()
            raise

        return self.log

    def _fetch_all_prices(self) -> list:
        """Holt alle Preisdaten von der UEX API."""
        try:
            response = self.client.get(f"{UEX_API_BASE}/items_prices_all")

            if response.status_code != 200:
                return []

            data = response.json()

            if data.get("status") != "ok":
                return []

            return data.get("data", [])

        except Exception as e:
            if self.log:
                self.log.errors = f"API Fehler: {str(e)}"
            return []

    def _build_uuid_mapping(self) -> dict:
        """Erstellt ein Mapping von UUID (lowercase) -> Component ID."""
        components = self.db.query(Component.id, Component.sc_uuid).filter(
            Component.sc_uuid.isnot(None)
        ).all()

        # Lowercase für case-insensitive Matching
        return {comp.sc_uuid.lower(): comp.id for comp in components}

    def _match_component(self, price_entry: dict, uuid_mapping: dict) -> Optional[int]:
        """Versucht ein Price-Entry mit einer Komponente zu matchen."""
        item_uuid = price_entry.get("item_uuid")

        if item_uuid:
            # Lowercase für case-insensitive Matching
            uuid_lower = item_uuid.lower()
            if uuid_lower in uuid_mapping:
                return uuid_mapping[uuid_lower]

        return None

    def _parse_timestamp(self, timestamp: Optional[int]) -> Optional[datetime]:
        """Konvertiert Unix-Timestamp zu datetime."""
        if timestamp:
            try:
                return datetime.fromtimestamp(timestamp)
            except Exception:
                pass
        return None


def run_uex_import(db: Session) -> UEXSyncLog:
    """Führt den UEX-Import aus."""
    service = UEXImportService(db)
    return service.sync_prices()
