"""
Erstellt Test-Transfer-Anfragen von verschiedenen Usern an Pioneers.
Ausführen: cd backend && python -m scripts.create_test_requests
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.user import User
from app.models.inventory import Inventory, TransferRequest, TransferRequestStatus
from app.models.component import Component

def create_test_requests():
    db = SessionLocal()

    try:
        # Finde Pioneers (haben Lager)
        pioneers = db.query(User).filter(User.is_pioneer == True).all()
        print(f"Gefundene Pioneers: {[p.username for p in pioneers]}")

        if not pioneers:
            print("Keine Pioneers gefunden! Bitte zuerst Pioneers einrichten.")
            return

        # Finde normale User (nicht Pioneer) als Anfragende
        requesters = db.query(User).filter(
            User.is_pioneer == False,
            User.role != 'guest',
            User.role != 'loot_guest'
        ).limit(5).all()
        print(f"Gefundene Anfragende: {[r.username for r in requesters]}")

        if not requesters:
            print("Keine normalen User gefunden!")
            return

        # Finde Items im Pioneer-Inventar
        for pioneer in pioneers:
            inventory_items = db.query(Inventory).filter(
                Inventory.user_id == pioneer.id,
                Inventory.quantity > 0
            ).limit(10).all()

            print(f"\n{pioneer.username} hat {len(inventory_items)} Items im Lager")

            # Erstelle Anfragen von verschiedenen Usern
            for i, item in enumerate(inventory_items[:5]):  # Max 5 Anfragen pro Pioneer
                requester = requesters[i % len(requesters)]

                # Nicht vom selben User anfragen
                if requester.id == pioneer.id:
                    continue

                # Prüfe ob schon eine Anfrage existiert
                existing = db.query(TransferRequest).filter(
                    TransferRequest.requester_id == requester.id,
                    TransferRequest.owner_id == pioneer.id,
                    TransferRequest.component_id == item.component_id,
                    TransferRequest.status == TransferRequestStatus.PENDING
                ).first()

                if existing:
                    print(f"  Anfrage existiert bereits: {requester.username} -> {item.component.name}")
                    continue

                # Menge: 1 oder maximal die Hälfte des Bestands
                qty = min(1, item.quantity // 2) if item.quantity > 1 else 1
                if qty > item.quantity:
                    qty = item.quantity

                # Test-Notizen
                notes_options = [
                    "Brauche das für meine Constellation",
                    "Für die nächste Mining-Session",
                    "Würde ich gern für die Staffel nutzen",
                    "Upgrade für meine Cutlass",
                    "Test-Anfrage",
                ]

                request = TransferRequest(
                    requester_id=requester.id,
                    owner_id=pioneer.id,
                    component_id=item.component_id,
                    from_location_id=item.location_id,
                    to_location_id=None,
                    quantity=qty,
                    notes=notes_options[i % len(notes_options)],
                    status=TransferRequestStatus.PENDING
                )
                db.add(request)
                print(f"  + Anfrage: {requester.username} fragt {pioneer.username} nach {qty}x {item.component.name}")

        db.commit()
        print("\n✓ Test-Anfragen erstellt!")

        # Zusammenfassung
        pending_count = db.query(TransferRequest).filter(
            TransferRequest.status == TransferRequestStatus.PENDING
        ).count()
        print(f"Gesamt pending Anfragen: {pending_count}")

    except Exception as e:
        print(f"Fehler: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    create_test_requests()
