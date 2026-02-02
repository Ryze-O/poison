from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User, UserRole, PendingMerge
from app.schemas.user import UserResponse, UserUpdate
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role


class UserMergeRequest(BaseModel):
    """Request zum Zusammenführen zweier User."""
    source_user_id: int  # Wird gelöscht
    target_user_id: int  # Behält alle Daten


class PendingMergeResponse(BaseModel):
    """Response für Merge-Vorschläge."""
    id: int
    discord_user: UserResponse
    existing_user: UserResponse
    match_reason: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


router = APIRouter()


@router.get("", response_model=List[UserResponse])
async def get_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Benutzer zurück."""
    return db.query(User).all()


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Gibt den aktuell eingeloggten Benutzer zurück."""
    return current_user


@router.get("/officers", response_model=List[UserResponse])
async def get_officers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Offiziere und höher zurück (für Lager-Übersicht)."""
    return db.query(User).filter(
        User.role.in_([UserRole.OFFICER, UserRole.TREASURER, UserRole.ADMIN])
    ).all()


@router.get("/pioneers", response_model=List[UserResponse])
async def get_pioneers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Pioneers zurück (für Loot-Verteilung)."""
    return db.query(User).filter(User.is_pioneer == True).all()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt einen einzelnen Benutzer zurück."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktualisiert einen Benutzer. Nur Admins können Rollen ändern."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    # Eigenen Display-Namen darf jeder ändern
    if user_update.display_name is not None:
        if user.id != current_user.id:
            check_role(current_user, UserRole.ADMIN)
        user.display_name = user_update.display_name

    # Username darf nur Admin ändern
    if user_update.username is not None:
        check_role(current_user, UserRole.ADMIN)
        # Prüfen ob Username bereits vergeben
        existing = db.query(User).filter(User.username == user_update.username, User.id != user_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username bereits vergeben"
            )
        user.username = user_update.username

    # Rollen dürfen nur Admins ändern
    if user_update.role is not None:
        check_role(current_user, UserRole.ADMIN)
        user.role = user_update.role

    # Pioneer-Status darf nur Admin ändern
    if user_update.is_pioneer is not None:
        check_role(current_user, UserRole.ADMIN)
        user.is_pioneer = user_update.is_pioneer

    # Kassenwart-Status darf nur Admin ändern
    if user_update.is_treasurer is not None:
        check_role(current_user, UserRole.ADMIN)
        user.is_treasurer = user_update.is_treasurer

    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/aliases")
async def add_alias(
    user_id: int,
    alias: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fügt einen OCR-Alias zu einem Benutzer hinzu.
    Aliase werden für das automatische Matching bei der Anwesenheitserfassung verwendet.
    Nur Offiziere+ können Aliase hinzufügen.
    """
    check_role(current_user, UserRole.OFFICER)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    # Alias bereinigen
    alias = alias.strip()
    if not alias or len(alias) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Alias muss mindestens 2 Zeichen lang sein"
        )

    # Bestehende Aliase laden
    existing = user.aliases.split(',') if user.aliases else []
    existing = [a.strip() for a in existing if a.strip()]

    # Prüfen ob Alias bereits existiert (case-insensitive)
    if any(a.lower() == alias.lower() for a in existing):
        return {"message": "Alias existiert bereits", "aliases": existing}

    # Alias hinzufügen
    existing.append(alias)
    user.aliases = ','.join(existing)

    db.commit()
    return {"message": "Alias hinzugefügt", "aliases": existing}


@router.delete("/{user_id}/aliases/{alias}")
async def remove_alias(
    user_id: int,
    alias: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Entfernt einen OCR-Alias von einem Benutzer."""
    check_role(current_user, UserRole.OFFICER)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    if not user.aliases:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer hat keine Aliase"
        )

    # Alias entfernen (case-insensitive)
    existing = user.aliases.split(',')
    existing = [a.strip() for a in existing if a.strip()]
    new_aliases = [a for a in existing if a.lower() != alias.lower()]

    if len(new_aliases) == len(existing):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alias nicht gefunden"
        )

    user.aliases = ','.join(new_aliases) if new_aliases else None
    db.commit()

    return {"message": "Alias entfernt", "aliases": new_aliases}


@router.get("/{user_id}/aliases")
async def get_aliases(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle OCR-Aliase eines Benutzers zurück."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    aliases = user.aliases.split(',') if user.aliases else []
    aliases = [a.strip() for a in aliases if a.strip()]

    return {"user_id": user_id, "aliases": aliases}


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Löscht einen Benutzer. Nur Admins.
    ACHTUNG: Kann nicht rückgängig gemacht werden!
    Prüft ob der User noch Referenzen hat (Inventar, Transaktionen, etc.)
    """
    check_role(current_user, UserRole.ADMIN)

    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Du kannst dich nicht selbst löschen"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    # Prüfen ob User noch Referenzen hat
    from app.models.inventory import Inventory
    from app.models.treasury import TreasuryTransaction
    from app.models.attendance import AttendanceRecord
    from app.models.loot import LootDistribution

    inventory_count = db.query(Inventory).filter(Inventory.user_id == user_id).count()
    transaction_count = db.query(TreasuryTransaction).filter(TreasuryTransaction.created_by_id == user_id).count()
    attendance_count = db.query(AttendanceRecord).filter(AttendanceRecord.user_id == user_id).count()
    loot_count = db.query(LootDistribution).filter(LootDistribution.user_id == user_id).count()

    if inventory_count > 0 or transaction_count > 0 or attendance_count > 0 or loot_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User hat noch Referenzen: {inventory_count} Inventar, {transaction_count} Transaktionen, {attendance_count} Anwesenheiten, {loot_count} Loot-Verteilungen. Erst zusammenführen oder Daten löschen."
        )

    username = user.username
    db.delete(user)
    db.commit()

    return {"message": f"Benutzer '{username}' gelöscht"}


@router.post("/merge")
async def merge_users(
    merge_request: UserMergeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Führt zwei Benutzer zusammen. Nur Admins.
    - Alle Referenzen vom source_user werden auf target_user übertragen
    - source_user wird gelöscht
    - Nützlich um importierte User mit Discord-Usern zu verknüpfen
    """
    check_role(current_user, UserRole.ADMIN)

    if merge_request.source_user_id == merge_request.target_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source und Target dürfen nicht gleich sein"
        )

    source = db.query(User).filter(User.id == merge_request.source_user_id).first()
    target = db.query(User).filter(User.id == merge_request.target_user_id).first()

    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source-Benutzer nicht gefunden"
        )

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target-Benutzer nicht gefunden"
        )

    # Alle Referenzen übertragen
    from app.models.inventory import Inventory, InventoryTransfer, TransferRequest
    from app.models.treasury import TreasuryTransaction
    from app.models.attendance import AttendanceRecord, AttendanceSession
    from app.models.loot import LootSession, LootDistribution
    from app.models.staffel import UserCommandGroup, UserOperationalRole, UserFunctionRole
    from app.models.location import Location
    from app.models.inventory_log import InventoryLog
    from app.models.officer_account import OfficerAccount, OfficerTransaction
    from app.models.user import GuestToken, UserRequest

    # Pending Merges die diesen User betreffen löschen
    db.query(PendingMerge).filter(
        (PendingMerge.discord_user_id == source.id) | (PendingMerge.existing_user_id == source.id)
    ).delete(synchronize_session=False)

    # Staffel-Zuordnungen übertragen oder löschen (bei Duplikaten)
    # KG-Mitgliedschaften
    source_kg_memberships = db.query(UserCommandGroup).filter(UserCommandGroup.user_id == source.id).all()
    for membership in source_kg_memberships:
        # Prüfe ob target bereits in dieser KG ist
        existing = db.query(UserCommandGroup).filter(
            UserCommandGroup.user_id == target.id,
            UserCommandGroup.command_group_id == membership.command_group_id
        ).first()
        if existing:
            # Target ist bereits Mitglied, lösche source-Eintrag
            db.delete(membership)
        else:
            # Übertrage zum target
            membership.user_id = target.id

    # Einsatzrollen
    source_op_roles = db.query(UserOperationalRole).filter(UserOperationalRole.user_id == source.id).all()
    for role in source_op_roles:
        existing = db.query(UserOperationalRole).filter(
            UserOperationalRole.user_id == target.id,
            UserOperationalRole.operational_role_id == role.operational_role_id
        ).first()
        if existing:
            db.delete(role)
        else:
            role.user_id = target.id

    # Funktionsrollen
    source_func_roles = db.query(UserFunctionRole).filter(UserFunctionRole.user_id == source.id).all()
    for role in source_func_roles:
        existing = db.query(UserFunctionRole).filter(
            UserFunctionRole.user_id == target.id,
            UserFunctionRole.function_role_id == role.function_role_id
        ).first()
        if existing:
            db.delete(role)
        else:
            role.user_id = target.id

    # Inventar übertragen
    db.query(Inventory).filter(Inventory.user_id == source.id).update(
        {Inventory.user_id: target.id}
    )

    # Inventar-Transfers (from und to)
    db.query(InventoryTransfer).filter(InventoryTransfer.from_user_id == source.id).update(
        {InventoryTransfer.from_user_id: target.id}
    )
    db.query(InventoryTransfer).filter(InventoryTransfer.to_user_id == source.id).update(
        {InventoryTransfer.to_user_id: target.id}
    )

    # Treasury-Transaktionen
    db.query(TreasuryTransaction).filter(TreasuryTransaction.created_by_id == source.id).update(
        {TreasuryTransaction.created_by_id: target.id}
    )

    # Anwesenheits-Records
    db.query(AttendanceRecord).filter(AttendanceRecord.user_id == source.id).update(
        {AttendanceRecord.user_id: target.id}
    )

    # Anwesenheits-Sessions (created_by)
    db.query(AttendanceSession).filter(AttendanceSession.created_by_id == source.id).update(
        {AttendanceSession.created_by_id: target.id}
    )

    # Loot-Sessions (created_by)
    db.query(LootSession).filter(LootSession.created_by_id == source.id).update(
        {LootSession.created_by_id: target.id}
    )

    # Loot-Verteilungen
    db.query(LootDistribution).filter(LootDistribution.user_id == source.id).update(
        {LootDistribution.user_id: target.id}
    )

    # Transfer-Requests (alle User-Referenzen)
    db.query(TransferRequest).filter(TransferRequest.requester_id == source.id).update(
        {TransferRequest.requester_id: target.id}
    )
    db.query(TransferRequest).filter(TransferRequest.owner_id == source.id).update(
        {TransferRequest.owner_id: target.id}
    )
    db.query(TransferRequest).filter(TransferRequest.approved_by_id == source.id).update(
        {TransferRequest.approved_by_id: target.id}
    )
    db.query(TransferRequest).filter(TransferRequest.delivered_by_id == source.id).update(
        {TransferRequest.delivered_by_id: target.id}
    )
    db.query(TransferRequest).filter(TransferRequest.confirmed_by_id == source.id).update(
        {TransferRequest.confirmed_by_id: target.id}
    )

    # Locations (created_by)
    db.query(Location).filter(Location.created_by_id == source.id).update(
        {Location.created_by_id: target.id}
    )

    # Inventory Logs
    db.query(InventoryLog).filter(InventoryLog.user_id == source.id).update(
        {InventoryLog.user_id: target.id}
    )
    db.query(InventoryLog).filter(InventoryLog.related_user_id == source.id).update(
        {InventoryLog.related_user_id: target.id}
    )

    # Officer Account - prüfe ob target bereits eins hat
    source_officer_account = db.query(OfficerAccount).filter(OfficerAccount.user_id == source.id).first()
    target_officer_account = db.query(OfficerAccount).filter(OfficerAccount.user_id == target.id).first()
    if source_officer_account and not target_officer_account:
        source_officer_account.user_id = target.id
    elif source_officer_account and target_officer_account:
        # Beide haben ein Konto - Source-Konto-Transaktionen zum Target übertragen
        db.query(OfficerTransaction).filter(OfficerTransaction.officer_account_id == source_officer_account.id).update(
            {OfficerTransaction.officer_account_id: target_officer_account.id}
        )
        # Guthaben addieren
        target_officer_account.balance += source_officer_account.balance
        db.delete(source_officer_account)

    # Officer Transactions (created_by)
    db.query(OfficerTransaction).filter(OfficerTransaction.created_by_id == source.id).update(
        {OfficerTransaction.created_by_id: target.id}
    )

    # Guest Tokens (created_by)
    db.query(GuestToken).filter(GuestToken.created_by_id == source.id).update(
        {GuestToken.created_by_id: target.id}
    )

    # User Requests (requested_by)
    db.query(UserRequest).filter(UserRequest.requested_by_id == source.id).update(
        {UserRequest.requested_by_id: target.id}
    )

    # Source-Username als Alias zum Target hinzufügen
    existing_aliases = target.aliases.split(',') if target.aliases else []
    existing_aliases = [a.strip() for a in existing_aliases if a.strip()]
    if source.username not in existing_aliases:
        existing_aliases.append(source.username)
    if source.display_name and source.display_name not in existing_aliases:
        existing_aliases.append(source.display_name)
    target.aliases = ','.join(existing_aliases) if existing_aliases else None

    # Falls target keinen display_name hat, vom source übernehmen
    if not target.display_name and source.display_name:
        target.display_name = source.display_name

    # Falls target keine Discord-ID hat aber source schon
    if not target.discord_id and source.discord_id:
        target.discord_id = source.discord_id
        target.avatar = source.avatar

    # Flags übertragen (OR-Logik: wenn source True hat, übernehmen)
    if source.is_pioneer:
        target.is_pioneer = True
    if source.is_treasurer:
        target.is_treasurer = True
    if source.is_kg_verwalter:
        target.is_kg_verwalter = True

    # Source-User löschen
    source_username = source.username
    db.delete(source)
    db.commit()
    db.refresh(target)

    return {
        "message": f"Benutzer '{source_username}' wurde mit '{target.username}' zusammengeführt",
        "target_user": UserResponse.model_validate(target)
    }


@router.get("/pending-merges", response_model=List[PendingMergeResponse])
async def get_pending_merges(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle offenen Merge-Vorschläge zurück. Nur Admins."""
    check_role(current_user, UserRole.ADMIN)

    pending = db.query(PendingMerge).filter(PendingMerge.status == "pending").all()

    # Manuell die Relationships laden und Response erstellen
    result = []
    for p in pending:
        discord_user = db.query(User).filter(User.id == p.discord_user_id).first()
        existing_user = db.query(User).filter(User.id == p.existing_user_id).first()
        if discord_user and existing_user:
            result.append(PendingMergeResponse(
                id=p.id,
                discord_user=UserResponse.model_validate(discord_user),
                existing_user=UserResponse.model_validate(existing_user),
                match_reason=p.match_reason,
                status=p.status,
                created_at=p.created_at
            ))

    return result


@router.post("/pending-merges/{merge_id}/approve")
async def approve_pending_merge(
    merge_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Genehmigt einen Merge-Vorschlag.
    Der Discord-User übernimmt alle Daten vom existierenden User.
    """
    check_role(current_user, UserRole.ADMIN)

    pending = db.query(PendingMerge).filter(PendingMerge.id == merge_id).first()
    if not pending:
        raise HTTPException(status_code=404, detail="Merge-Vorschlag nicht gefunden")

    if pending.status != "pending":
        raise HTTPException(status_code=400, detail="Merge-Vorschlag wurde bereits bearbeitet")

    discord_user = db.query(User).filter(User.id == pending.discord_user_id).first()
    existing_user = db.query(User).filter(User.id == pending.existing_user_id).first()

    if not discord_user or not existing_user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    # Alle Referenzen vom existierenden User auf Discord-User übertragen
    from app.models.inventory import Inventory, InventoryTransfer, TransferRequest
    from app.models.treasury import TreasuryTransaction
    from app.models.attendance import AttendanceRecord, AttendanceSession
    from app.models.loot import LootSession, LootDistribution
    from app.models.staffel import UserCommandGroup, UserOperationalRole, UserFunctionRole
    from app.models.location import Location
    from app.models.inventory_log import InventoryLog
    from app.models.officer_account import OfficerAccount, OfficerTransaction
    from app.models.user import GuestToken, UserRequest

    # Andere Pending Merges die existing_user betreffen löschen (außer dem aktuellen)
    db.query(PendingMerge).filter(
        PendingMerge.id != merge_id,
        (PendingMerge.discord_user_id == existing_user.id) | (PendingMerge.existing_user_id == existing_user.id)
    ).delete(synchronize_session=False)

    # Staffel-Zuordnungen übertragen oder löschen (bei Duplikaten)
    # KG-Mitgliedschaften
    source_kg_memberships = db.query(UserCommandGroup).filter(UserCommandGroup.user_id == existing_user.id).all()
    for membership in source_kg_memberships:
        existing = db.query(UserCommandGroup).filter(
            UserCommandGroup.user_id == discord_user.id,
            UserCommandGroup.command_group_id == membership.command_group_id
        ).first()
        if existing:
            db.delete(membership)
        else:
            membership.user_id = discord_user.id

    # Einsatzrollen
    source_op_roles = db.query(UserOperationalRole).filter(UserOperationalRole.user_id == existing_user.id).all()
    for role in source_op_roles:
        existing = db.query(UserOperationalRole).filter(
            UserOperationalRole.user_id == discord_user.id,
            UserOperationalRole.operational_role_id == role.operational_role_id
        ).first()
        if existing:
            db.delete(role)
        else:
            role.user_id = discord_user.id

    # Funktionsrollen
    source_func_roles = db.query(UserFunctionRole).filter(UserFunctionRole.user_id == existing_user.id).all()
    for role in source_func_roles:
        existing = db.query(UserFunctionRole).filter(
            UserFunctionRole.user_id == discord_user.id,
            UserFunctionRole.function_role_id == role.function_role_id
        ).first()
        if existing:
            db.delete(role)
        else:
            role.user_id = discord_user.id

    # Inventar übertragen
    db.query(Inventory).filter(Inventory.user_id == existing_user.id).update(
        {Inventory.user_id: discord_user.id}
    )

    # Inventar-Transfers
    db.query(InventoryTransfer).filter(InventoryTransfer.from_user_id == existing_user.id).update(
        {InventoryTransfer.from_user_id: discord_user.id}
    )
    db.query(InventoryTransfer).filter(InventoryTransfer.to_user_id == existing_user.id).update(
        {InventoryTransfer.to_user_id: discord_user.id}
    )

    # Treasury-Transaktionen
    db.query(TreasuryTransaction).filter(TreasuryTransaction.created_by_id == existing_user.id).update(
        {TreasuryTransaction.created_by_id: discord_user.id}
    )

    # Anwesenheits-Records
    db.query(AttendanceRecord).filter(AttendanceRecord.user_id == existing_user.id).update(
        {AttendanceRecord.user_id: discord_user.id}
    )

    # Anwesenheits-Sessions (created_by)
    db.query(AttendanceSession).filter(AttendanceSession.created_by_id == existing_user.id).update(
        {AttendanceSession.created_by_id: discord_user.id}
    )

    # Loot-Sessions (created_by)
    db.query(LootSession).filter(LootSession.created_by_id == existing_user.id).update(
        {LootSession.created_by_id: discord_user.id}
    )

    # Loot-Verteilungen
    db.query(LootDistribution).filter(LootDistribution.user_id == existing_user.id).update(
        {LootDistribution.user_id: discord_user.id}
    )

    # Transfer-Requests (alle User-Referenzen)
    db.query(TransferRequest).filter(TransferRequest.requester_id == existing_user.id).update(
        {TransferRequest.requester_id: discord_user.id}
    )
    db.query(TransferRequest).filter(TransferRequest.owner_id == existing_user.id).update(
        {TransferRequest.owner_id: discord_user.id}
    )
    db.query(TransferRequest).filter(TransferRequest.approved_by_id == existing_user.id).update(
        {TransferRequest.approved_by_id: discord_user.id}
    )
    db.query(TransferRequest).filter(TransferRequest.delivered_by_id == existing_user.id).update(
        {TransferRequest.delivered_by_id: discord_user.id}
    )
    db.query(TransferRequest).filter(TransferRequest.confirmed_by_id == existing_user.id).update(
        {TransferRequest.confirmed_by_id: discord_user.id}
    )

    # Locations (created_by)
    db.query(Location).filter(Location.created_by_id == existing_user.id).update(
        {Location.created_by_id: discord_user.id}
    )

    # Inventory Logs
    db.query(InventoryLog).filter(InventoryLog.user_id == existing_user.id).update(
        {InventoryLog.user_id: discord_user.id}
    )
    db.query(InventoryLog).filter(InventoryLog.related_user_id == existing_user.id).update(
        {InventoryLog.related_user_id: discord_user.id}
    )

    # Officer Account - prüfe ob discord_user bereits eins hat
    source_officer_account = db.query(OfficerAccount).filter(OfficerAccount.user_id == existing_user.id).first()
    target_officer_account = db.query(OfficerAccount).filter(OfficerAccount.user_id == discord_user.id).first()
    if source_officer_account and not target_officer_account:
        source_officer_account.user_id = discord_user.id
    elif source_officer_account and target_officer_account:
        # Beide haben ein Konto - Source-Konto-Transaktionen zum Target übertragen
        db.query(OfficerTransaction).filter(OfficerTransaction.officer_account_id == source_officer_account.id).update(
            {OfficerTransaction.officer_account_id: target_officer_account.id}
        )
        # Guthaben addieren
        target_officer_account.balance += source_officer_account.balance
        db.delete(source_officer_account)

    # Officer Transactions (created_by)
    db.query(OfficerTransaction).filter(OfficerTransaction.created_by_id == existing_user.id).update(
        {OfficerTransaction.created_by_id: discord_user.id}
    )

    # Guest Tokens (created_by)
    db.query(GuestToken).filter(GuestToken.created_by_id == existing_user.id).update(
        {GuestToken.created_by_id: discord_user.id}
    )

    # User Requests (requested_by)
    db.query(UserRequest).filter(UserRequest.requested_by_id == existing_user.id).update(
        {UserRequest.requested_by_id: discord_user.id}
    )

    # Aliase vom existierenden User übernehmen
    existing_aliases = discord_user.aliases.split(',') if discord_user.aliases else []
    existing_aliases = [a.strip() for a in existing_aliases if a.strip()]
    if existing_user.username not in existing_aliases:
        existing_aliases.append(existing_user.username)
    if existing_user.display_name and existing_user.display_name not in existing_aliases:
        existing_aliases.append(existing_user.display_name)
    if existing_user.aliases:
        for alias in existing_user.aliases.split(','):
            alias = alias.strip()
            if alias and alias not in existing_aliases:
                existing_aliases.append(alias)
    discord_user.aliases = ','.join(existing_aliases) if existing_aliases else None

    # Rolle vom existierenden User übernehmen (falls höher)
    role_hierarchy = {
        UserRole.GUEST: -1,
        UserRole.LOOT_GUEST: 0,
        UserRole.MEMBER: 1,
        UserRole.OFFICER: 2,
        UserRole.TREASURER: 3,
        UserRole.ADMIN: 4,
    }
    if role_hierarchy.get(existing_user.role, 0) > role_hierarchy.get(discord_user.role, 0):
        discord_user.role = existing_user.role

    # Pioneer/Kassenwart/KG-Verwalter-Status übernehmen
    if existing_user.is_pioneer:
        discord_user.is_pioneer = True
    if existing_user.is_treasurer:
        discord_user.is_treasurer = True
    if existing_user.is_kg_verwalter:
        discord_user.is_kg_verwalter = True

    # Display-Name übernehmen falls nicht vorhanden
    if not discord_user.display_name and existing_user.display_name:
        discord_user.display_name = existing_user.display_name

    # Existierenden User löschen
    existing_username = existing_user.username
    db.delete(existing_user)

    # Merge-Vorschlag als erledigt markieren
    pending.status = "approved"
    pending.resolved_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(discord_user)

    return {
        "message": f"Benutzer '{existing_username}' wurde mit '{discord_user.username}' zusammengeführt",
        "user": UserResponse.model_validate(discord_user)
    }


@router.post("/pending-merges/{merge_id}/reject")
async def reject_pending_merge(
    merge_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lehnt einen Merge-Vorschlag ab."""
    check_role(current_user, UserRole.ADMIN)

    pending = db.query(PendingMerge).filter(PendingMerge.id == merge_id).first()
    if not pending:
        raise HTTPException(status_code=404, detail="Merge-Vorschlag nicht gefunden")

    if pending.status != "pending":
        raise HTTPException(status_code=400, detail="Merge-Vorschlag wurde bereits bearbeitet")

    pending.status = "rejected"
    pending.resolved_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Merge-Vorschlag abgelehnt"}
