"""
Script zum Zuweisen der KG-Leiter zu den Einsatzrollen.

Voraussetzung: Migration j7k664061kk4 muss ausgeführt sein (erstellt die KG-Leiter Rollen).

Verwendung:
    cd backend
    alembic upgrade head  # Falls noch nicht geschehen
    python -m scripts.add_kg_leaders
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.user import User
from app.models.staffel import (
    CommandGroup, OperationalRole, UserOperationalRole
)


# KG-Leiter und Stellvertreter (aus Spreadsheet)
KG_LEADERS = {
    "CW": {"KG-Leiter": "SILVA-7", "Stellv. KG-Leiter": "Dwing86"},
    "SW": {"KG-Leiter": "DerMando69", "Stellv. KG-Leiter": None},
    "P": {"KG-Leiter": "moRytox", "Stellv. KG-Leiter": "Morphin93"},
}


def find_user_by_name(db: Session, name: str) -> User | None:
    """Findet User anhand von username, display_name oder Alias."""
    if not name:
        return None

    name_clean = name.strip()

    # Varianten probieren
    variants = [
        name_clean,
        name_clean.lower(),
        name_clean.replace("_", ""),
        name_clean.replace("-", "_"),
    ]

    for variant in variants:
        user = db.query(User).filter(User.username.ilike(variant)).first()
        if user:
            return user
        user = db.query(User).filter(User.display_name.ilike(variant)).first()
        if user:
            return user

    # In Aliases suchen
    users = db.query(User).filter(User.aliases.isnot(None)).all()
    for u in users:
        if u.aliases:
            aliases = [a.strip().lower() for a in u.aliases.split(',')]
            if name_clean.lower() in aliases:
                return u

    return None


def main():
    print("="*60)
    print("KG-LEITER ROLLEN HINZUFÜGEN")
    print("="*60)

    db = SessionLocal()

    try:
        for kg_name, leaders in KG_LEADERS.items():
            print(f"\n=== {kg_name} ===")

            group = db.query(CommandGroup).filter(CommandGroup.name == kg_name).first()
            if not group:
                print(f"  WARNUNG: KG '{kg_name}' nicht gefunden!")
                continue

            for role_name, username in leaders.items():
                if not username:
                    print(f"  {role_name}: Nicht besetzt")
                    continue

                # Rolle finden (sollte durch Migration existieren)
                role = db.query(OperationalRole).filter(
                    OperationalRole.command_group_id == group.id,
                    OperationalRole.name == role_name
                ).first()

                if not role:
                    print(f"  WARNUNG: Rolle '{role_name}' nicht gefunden!")
                    print(f"           Führe 'alembic upgrade head' aus.")
                    continue

                print(f"  {role_name}:")

                # User finden und zuweisen
                user = find_user_by_name(db, username)
                if not user:
                    print(f"    SKIP: User '{username}' nicht gefunden!")
                    continue

                # Prüfen ob bereits zugewiesen
                existing = db.query(UserOperationalRole).filter(
                    UserOperationalRole.user_id == user.id,
                    UserOperationalRole.operational_role_id == role.id
                ).first()

                if existing:
                    print(f"    EXISTS: {username} → {role_name}")
                else:
                    assignment = UserOperationalRole(
                        user_id=user.id,
                        operational_role_id=role.id,
                        is_training=False
                    )
                    db.add(assignment)
                    print(f"    ASSIGNED: {username} → {role_name}")

        db.commit()
        print("\n✅ KG-Leiter Rollen hinzugefügt!")

    except Exception as e:
        print(f"\n❌ FEHLER: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
