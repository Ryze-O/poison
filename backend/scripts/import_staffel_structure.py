"""
Einmaliges Import-Script für Staffelstruktur aus Google Spreadsheet.

Dieses Script importiert:
- KG-Mitgliedschaften (User → CommandGroup)
- Einsatzrollen-Zuweisungen (User → OperationalRole, mit is_training)
- Funktionsrollen-Zuweisungen (User → FunctionRole, inkl. Leadership)

Verwendung:
    cd backend
    python -m scripts.import_staffel_structure

Hinweis: Script ist idempotent - bereits existierende Zuweisungen werden übersprungen.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models.user import User
from app.models.staffel import (
    CommandGroup, OperationalRole, FunctionRole,
    UserCommandGroup, UserOperationalRole, UserFunctionRole,
    MemberStatus
)


# ============== DATEN AUS SPREADSHEET ==============

# Staffelleitung (Leadership Roles)
LEADERSHIP = {
    "Staffelleiter": ["ry_ze"],
    "Stellvertreter": ["DerMando69"],
    "Vereinslegende": ["SILVA-7"],
}

# KG-Mitgliedschaften (aus "Zugehörigkeit" Sektion)
KG_MEMBERS = {
    "CW": [
        "Clearity", "Niox", "CptUseless", "Pantergraph", "CuteRichBoy",
        "Thomas", "D1sturbed", "RagnarSeven", "Dwing86", "Freudenfeuer",
        "KingSword_HD", "Malibu", "Morphin93", "MrSilent",
        # Aus Kommandogruppen-Führung
        "SILVA-7",
    ],
    "SW": [
        "Clearity", "JustCallMeRobin", "RagnarSeven", "Chuckxn", "CptUseless",
        "KingSword_HD", "Cpt-Yolo", "CuteRichBoy", "Lanije", "EchoFX",
        "D1sturbed", "Morphin93", "M1rmel", "DaWu", "Morytox", "Mastersinflare",
        "Dwing86", "MrSilent", "Sektin", "Freudenfeuer", "Niox", "Thundergod",
        "Gehsi", "Pantergraph", "xX_Droxz_Xx", "Gejeeto", "Selbstlos2110",
        "Jan097", "St0092",
        # Aus Kommandogruppen-Führung
        "DerMando69",
    ],
    "P": [
        "Clearity", "MrSilent89", "Beros", "CuteRichBoy", "Niox", "Com_CAPS",
        "DaWu", "Panthergraph", "Cpt-Yolo", "Dwing", "St0092", "Mastersinflare",
        "Freudenfeuer", "RagnarSeven", "Gejeeto", "JustCallMeRobin", "Malibu",
        "Morphin93", "moRytox",
    ],
}

# Einsatzrollen-Zuweisungen
# Format: (KG, Rolle) -> [Username, ...] - mit * für "in Ausbildung"
OPERATIONAL_ROLES = {
    # ===== CW ROLLEN =====
    ("CW", "GKS-Besatzung"): [
        "Panthergraph", "Niox", "MrSilent", "CuteRichBoy", "Freudenfeuer",
        "D1sturbed", "KingSword_HD", "Clearity", "Malibu", "YugoBoss",
        "Selbstlos2110", "CptUseless", "RagnarSeven"
    ],
    ("CW", "Waffenmeister"): [
        "Dwing86", "Thomas", "Panthergraph", "Morphin93"
    ],
    ("CW", "Feuerleiter"): [
        "Dwing86", "Thomas"
    ],
    ("CW", "Schiffsmeister"): [
        "Thomas", "Dwing", "Panthergraph"
    ],
    ("CW", "Boardingmeister"): [
        "Morphin"
    ],
    ("CW", "GKS-Pilot"): [
        "Panthergraph", "Dwing86", "Thomas"
    ],
    ("CW", "1.Offizier"): [
        "Dwing86", "Thomas", "Morphin93"
    ],
    ("CW", "GKS-Kommandant"): [
        "Dwing86", "Thomas"
    ],

    # ===== SW ROLLEN =====
    ("SW", "Dogfighter"): [
        "Lanije", "KingSword_HD", "DaWu", "Gehsi", "Jan097", "D1sturbed",
        "Stoo92*", "Freudenfeuer*", "Selbstlos2110*", "CptUseless*",
        "RagnarSeven*"
    ],
    ("SW", "Aufklärer"): [
        "DaWu", "Niox", "Clarity*", "Freudenfeuer*"
    ],
    ("SW", "Interceptor"): [
        "Lanije", "Jan097", "JustCallMeRobin", "CptUseless*"
    ],
    ("SW", "E.W.A."): [
        "KingSword_HD", "Morytox", "Niox", "Pantergraph", "JustCallMeRobin", "Jan097"
    ],
    ("SW", "D.E.A.L.S."): [
        "DaWu", "Morphin93", "Morytox", "Niox", "CuteRichBoy", "JustCallMeRobin",
        "Freudenfeuer", "Panthergraph", "Mastersinflare", "Stoo92", "MrSilent",
        "Clearity", "CptUseless*", "RagnarSeven*"
    ],
    ("SW", "Anti-GKS"): [
        "DaWu", "Dwing86", "Morytox", "Niox", "Pantergraph", "CuteRichBoy", "Gejeeto"
    ],
    ("SW", "Gunships"): [
        "DaWu", "Dwing86", "Morytox", "Niox", "Pantergraph", "CuteRichBoy", "Gejeeto"
    ],
    ("SW", "Torpedo-/Bomber"): [
        "KingSword_HD", "Morphin", "JustCallMeRobin*"
    ],

    # ===== P ROLLEN =====
    ("P", "Logistik"): [
        "moRytox", "Morphin93", "MrSilent89", "Niox", "Dwing86", "Gejeeto*",
        "JustCallMeRobin*"
    ],
    ("P", "Mechaniker"): [
        "Morytox", "Morphin93"
    ],
    ("P", "Engineer"): [
        "Morytox", "Morphin", "Freudenfeuer*"
    ],
    ("P", "Medic & Supply"): [
        "moRytox", "Morphin93", "Niox", "MrSilent*", "Freudenfeuer*"
    ],
    ("P", "Hangarmeister"): [
        "moRytox", "Morphin93", "DaWu"
    ],
    ("P", "Dropship"): [
        "moRytox", "Morphin93", "CuteRichBoy*", "Gejeeto*", "RagnarSeven*"
    ],
    ("P", "B.E.A.S.T."): [
        "moRytox", "Morphin93", "MrSilent89", "CuteRichBoy*", "Panthergraph*",
        "Gejeeto*", "RagnarSeven*"
    ],
    ("P", "Basebuilder"): [],  # Noch keine Zuweisungen
}

# Funktionsrollen (nicht-Leadership)
FUNCTION_ROLES = {
    "Schatzmeister": ["Morytox", "Morphin"],
    "Forschung": ["DerMando69"],
    "Einsatzleiter": ["ry_ze", "DerMando69", "DaWu"],
    "Logistikmeister": ["Morytox", "Morphin", "DaWu"],
    "Flottenkommandant": ["DerMando69", "Dwing"],
    "Winglead (Jäger)": ["Lanije", "DaWu", "KingSword_HD"],
    "Squadlead (FPS)": ["DerMando69", "DaWu", "Morphin", "Niox"],
}

# KG-Verwalter (Kommandogruppen-Leiter und Stellvertreter)
KG_VERWALTER = {
    "CW": {"leader": "SILVA-7", "deputy": "Dwing86"},
    "SW": {"leader": "DerMando69", "deputy": None},
    "P": {"leader": "moRytox", "deputy": "Morphin93"},
}


def find_user_by_name(db: Session, name: str) -> User | None:
    """Findet User anhand von username, display_name oder Alias."""
    # Name normalisieren
    name_clean = name.strip()

    # Varianten probieren
    variants = [
        name_clean,
        name_clean.lower(),
        name_clean.replace("_", ""),
        name_clean.replace("-", "_"),
    ]

    for variant in variants:
        # Nach username suchen
        user = db.query(User).filter(User.username.ilike(variant)).first()
        if user:
            return user

        # Nach display_name suchen
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


def import_kg_memberships(db: Session) -> dict:
    """Importiert KG-Mitgliedschaften."""
    print("\n=== KG-Mitgliedschaften importieren ===")
    stats = {"added": 0, "exists": 0, "not_found": []}

    for kg_name, usernames in KG_MEMBERS.items():
        group = db.query(CommandGroup).filter(CommandGroup.name == kg_name).first()
        if not group:
            print(f"  WARNUNG: KG '{kg_name}' nicht gefunden!")
            continue

        print(f"\n  {kg_name} ({group.full_name}):")

        for username in usernames:
            user = find_user_by_name(db, username)
            if not user:
                print(f"    SKIP: User '{username}' nicht gefunden")
                stats["not_found"].append(username)
                continue

            # Prüfen ob bereits zugewiesen
            existing = db.query(UserCommandGroup).filter(
                UserCommandGroup.user_id == user.id,
                UserCommandGroup.command_group_id == group.id
            ).first()

            if existing:
                print(f"    EXISTS: {username}")
                stats["exists"] += 1
                continue

            # Zuweisen
            membership = UserCommandGroup(
                user_id=user.id,
                command_group_id=group.id,
                status=MemberStatus.ACTIVE
            )
            db.add(membership)
            print(f"    ADD: {username}")
            stats["added"] += 1

    db.commit()
    print(f"\n  KG-Mitgliedschaften: {stats['added']} hinzugefügt, {stats['exists']} existierten bereits")
    return stats


def import_operational_roles(db: Session) -> dict:
    """Importiert Einsatzrollen-Zuweisungen."""
    print("\n=== Einsatzrollen importieren ===")
    stats = {"added": 0, "updated": 0, "exists": 0, "not_found": []}

    for (kg_name, role_name), users in OPERATIONAL_ROLES.items():
        if not users:
            continue

        group = db.query(CommandGroup).filter(CommandGroup.name == kg_name).first()
        if not group:
            print(f"  WARNUNG: KG '{kg_name}' nicht gefunden!")
            continue

        role = db.query(OperationalRole).filter(
            OperationalRole.command_group_id == group.id,
            OperationalRole.name == role_name
        ).first()

        if not role:
            print(f"  WARNUNG: Rolle '{role_name}' in {kg_name} nicht gefunden!")
            continue

        print(f"\n  {kg_name} → {role_name}:")

        for username_raw in users:
            # * am Ende = in Ausbildung
            is_training = username_raw.endswith('*')
            username = username_raw.rstrip('*')

            user = find_user_by_name(db, username)
            if not user:
                print(f"    SKIP: User '{username}' nicht gefunden")
                if username not in stats["not_found"]:
                    stats["not_found"].append(username)
                continue

            # Prüfen ob bereits zugewiesen
            existing = db.query(UserOperationalRole).filter(
                UserOperationalRole.user_id == user.id,
                UserOperationalRole.operational_role_id == role.id
            ).first()

            if existing:
                # Update is_training falls unterschiedlich
                if existing.is_training != is_training:
                    existing.is_training = is_training
                    print(f"    UPDATE: {username} (training={is_training})")
                    stats["updated"] += 1
                else:
                    print(f"    EXISTS: {username}")
                    stats["exists"] += 1
                continue

            # Zuweisen
            assignment = UserOperationalRole(
                user_id=user.id,
                operational_role_id=role.id,
                is_training=is_training
            )
            db.add(assignment)
            suffix = " (A)" if is_training else ""
            print(f"    ADD: {username}{suffix}")
            stats["added"] += 1

    db.commit()
    print(f"\n  Einsatzrollen: {stats['added']} hinzugefügt, {stats['updated']} aktualisiert, {stats['exists']} existierten bereits")
    return stats


def import_function_roles(db: Session) -> dict:
    """Importiert Funktionsrollen (inkl. Leadership)."""
    print("\n=== Funktionsrollen importieren ===")
    stats = {"added": 0, "exists": 0, "not_found": []}

    # Leadership
    print("\n  -- Staffelleitung --")
    for role_name, usernames in LEADERSHIP.items():
        role = db.query(FunctionRole).filter(
            FunctionRole.name == role_name,
            FunctionRole.is_leadership == True
        ).first()

        if not role:
            print(f"  WARNUNG: Leadership-Rolle '{role_name}' nicht gefunden!")
            continue

        for username in usernames:
            user = find_user_by_name(db, username)
            if not user:
                print(f"    SKIP: User '{username}' nicht gefunden")
                stats["not_found"].append(username)
                continue

            existing = db.query(UserFunctionRole).filter(
                UserFunctionRole.user_id == user.id,
                UserFunctionRole.function_role_id == role.id
            ).first()

            if existing:
                print(f"    EXISTS: {role_name} → {username}")
                stats["exists"] += 1
                continue

            assignment = UserFunctionRole(
                user_id=user.id,
                function_role_id=role.id
            )
            db.add(assignment)
            print(f"    ADD: {role_name} → {username}")
            stats["added"] += 1

    # Normale Funktionsrollen
    print("\n  -- Funktionsrollen --")
    for role_name, usernames in FUNCTION_ROLES.items():
        role = db.query(FunctionRole).filter(
            FunctionRole.name == role_name,
            FunctionRole.is_leadership == False
        ).first()

        if not role:
            print(f"  WARNUNG: Funktionsrolle '{role_name}' nicht gefunden!")
            continue

        for username in usernames:
            user = find_user_by_name(db, username)
            if not user:
                print(f"    SKIP: User '{username}' nicht gefunden")
                if username not in stats["not_found"]:
                    stats["not_found"].append(username)
                continue

            existing = db.query(UserFunctionRole).filter(
                UserFunctionRole.user_id == user.id,
                UserFunctionRole.function_role_id == role.id
            ).first()

            if existing:
                print(f"    EXISTS: {role_name} → {username}")
                stats["exists"] += 1
                continue

            assignment = UserFunctionRole(
                user_id=user.id,
                function_role_id=role.id
            )
            db.add(assignment)
            print(f"    ADD: {role_name} → {username}")
            stats["added"] += 1

    db.commit()
    print(f"\n  Funktionsrollen: {stats['added']} hinzugefügt, {stats['exists']} existierten bereits")
    return stats


def set_kg_verwalter(db: Session) -> dict:
    """Setzt is_kg_verwalter Flag für KG-Leiter und Stellvertreter."""
    print("\n=== KG-Verwalter setzen ===")
    stats = {"set": 0, "not_found": []}

    for kg_name, leaders in KG_VERWALTER.items():
        for role, username in leaders.items():
            if not username:
                continue

            user = find_user_by_name(db, username)
            if not user:
                print(f"  SKIP: {username} nicht gefunden")
                stats["not_found"].append(username)
                continue

            if not user.is_kg_verwalter:
                user.is_kg_verwalter = True
                print(f"  SET: {username} ist jetzt KG-Verwalter ({kg_name} {role})")
                stats["set"] += 1
            else:
                print(f"  EXISTS: {username} war bereits KG-Verwalter")

    db.commit()
    return stats


def print_summary(db: Session):
    """Gibt eine Zusammenfassung aus."""
    print("\n" + "="*60)
    print("ZUSAMMENFASSUNG")
    print("="*60)

    # KG-Mitgliedschaften
    print("\nKG-Mitgliedschaften:")
    for kg_name in ["CW", "SW", "P"]:
        group = db.query(CommandGroup).filter(CommandGroup.name == kg_name).first()
        if group:
            count = db.query(UserCommandGroup).filter(
                UserCommandGroup.command_group_id == group.id
            ).count()
            print(f"  {kg_name}: {count} Mitglieder")

    # Einsatzrollen
    op_count = db.query(UserOperationalRole).count()
    training_count = db.query(UserOperationalRole).filter(
        UserOperationalRole.is_training == True
    ).count()
    print(f"\nEinsatzrollen-Zuweisungen: {op_count} (davon {training_count} in Ausbildung)")

    # Funktionsrollen
    func_count = db.query(UserFunctionRole).count()
    print(f"Funktionsrollen-Zuweisungen: {func_count}")

    # KG-Verwalter
    verwalter_count = db.query(User).filter(User.is_kg_verwalter == True).count()
    print(f"KG-Verwalter: {verwalter_count}")

    print("="*60)


def main():
    print("="*60)
    print("STAFFELSTRUKTUR IMPORT")
    print("="*60)
    print("\nDieses Script importiert die Staffelstruktur aus dem Viper-Spreadsheet.")
    print("Bereits existierende Zuweisungen werden übersprungen.\n")

    db = SessionLocal()
    all_not_found = set()

    try:
        # Import durchführen
        kg_stats = import_kg_memberships(db)
        all_not_found.update(kg_stats.get("not_found", []))

        op_stats = import_operational_roles(db)
        all_not_found.update(op_stats.get("not_found", []))

        func_stats = import_function_roles(db)
        all_not_found.update(func_stats.get("not_found", []))

        verwalter_stats = set_kg_verwalter(db)
        all_not_found.update(verwalter_stats.get("not_found", []))

        print_summary(db)

        # Nicht gefundene User auflisten
        if all_not_found:
            print("\n⚠️  NICHT GEFUNDENE USER:")
            for name in sorted(all_not_found):
                print(f"   - {name}")
            print("\nDiese User müssen ggf. manuell angelegt oder Aliase ergänzt werden.")

        print("\n✅ Import abgeschlossen!")

    except Exception as e:
        print(f"\n❌ FEHLER: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
