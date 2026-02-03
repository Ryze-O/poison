"""
Staffelstruktur API Router

Endpoints für:
- Kommandogruppen (CRUD)
- Einsatzrollen (CRUD)
- Funktionsrollen (CRUD)
- User-Zuordnungen
- Schiffe
- Übersicht
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.staffel import (
    CommandGroup, OperationalRole, FunctionRole,
    UserCommandGroup, UserOperationalRole, UserFunctionRole,
    CommandGroupShip, MemberStatus
)
from app.schemas.staffel import (
    CommandGroupCreate, CommandGroupUpdate, CommandGroupResponse, CommandGroupDetailResponse,
    OperationalRoleCreate, OperationalRoleUpdate, OperationalRoleResponse, OperationalRoleWithUsersResponse,
    FunctionRoleCreate, FunctionRoleUpdate, FunctionRoleResponse, FunctionRoleWithUsersResponse,
    ShipCreate, ShipUpdate, ShipResponse,
    UserCommandGroupCreate, AddMemberToGroup, UserCommandGroupResponse, MemberStatusUpdate,
    UserOperationalRoleCreate, UserOperationalRoleResponse, UserOperationalRoleUpdate,
    UserFunctionRoleCreate, UserFunctionRoleResponse,
    StaffelOverviewResponse, UserStaffelProfile,
    # Self-Service & Matrix
    MyCommandGroupsResponse, MyCommandGroupsUpdate,
    AssignmentMatrixResponse, AssignmentMatrixUser, AssignmentMatrixRole, AssignmentCell,
    BulkAssignmentUpdate
)
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


def is_staffel_manager(user: User, db: Session) -> bool:
    """Prüft ob User Admin ist oder KG-Verwalter Flag hat."""
    if user.role == UserRole.ADMIN:
        return True

    # Prüfe das is_kg_verwalter Flag
    if hasattr(user, 'is_kg_verwalter') and user.is_kg_verwalter:
        return True

    return False


def check_staffel_manager(user: User, db: Session):
    """Wirft Exception wenn User kein Staffel-Manager ist."""
    if not is_staffel_manager(user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nur Admins oder KG-Verwalter können diese Aktion ausführen"
        )


# ============== Kommandogruppen ==============

@router.get("/command-groups", response_model=List[CommandGroupResponse])
async def get_command_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Alle Kommandogruppen abrufen."""
    return db.query(CommandGroup).order_by(CommandGroup.sort_order).all()


@router.get("/command-groups/{group_id}", response_model=CommandGroupDetailResponse)
async def get_command_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Kommandogruppe mit Details abrufen."""
    group = db.query(CommandGroup).filter(CommandGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Kommandogruppe nicht gefunden")
    return group


@router.post("/command-groups", response_model=CommandGroupResponse)
async def create_command_group(
    data: CommandGroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Neue Kommandogruppe erstellen (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    existing = db.query(CommandGroup).filter(CommandGroup.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Name bereits vergeben")

    group = CommandGroup(**data.dict())
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.patch("/command-groups/{group_id}", response_model=CommandGroupResponse)
async def update_command_group(
    group_id: int,
    data: CommandGroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Kommandogruppe bearbeiten (Admin/KG-Verwalter)."""
    check_staffel_manager(current_user, db)

    group = db.query(CommandGroup).filter(CommandGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Kommandogruppe nicht gefunden")

    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(group, key, value)

    db.commit()
    db.refresh(group)
    return group


# ============== Mitglieder ==============

@router.get("/command-groups/{group_id}/members", response_model=List[UserCommandGroupResponse])
async def get_group_members(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mitglieder einer Kommandogruppe abrufen."""
    return db.query(UserCommandGroup).filter(
        UserCommandGroup.command_group_id == group_id
    ).all()


@router.post("/command-groups/{group_id}/members", response_model=UserCommandGroupResponse)
async def add_member_to_group(
    group_id: int,
    data: AddMemberToGroup,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """User zu Kommandogruppe hinzufügen (Admin/KG-Verwalter)."""
    check_staffel_manager(current_user, db)

    # Prüfen ob User existiert
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User nicht gefunden")

    # Prüfen ob Gruppe existiert
    group = db.query(CommandGroup).filter(CommandGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Kommandogruppe nicht gefunden")

    # Prüfen ob bereits Mitglied
    existing = db.query(UserCommandGroup).filter(
        UserCommandGroup.user_id == data.user_id,
        UserCommandGroup.command_group_id == group_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User ist bereits Mitglied dieser Gruppe")

    membership = UserCommandGroup(
        user_id=data.user_id,
        command_group_id=group_id,
        status=data.status,
        notes=data.notes
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


@router.patch("/members/{membership_id}", response_model=UserCommandGroupResponse)
async def update_member_status(
    membership_id: int,
    data: MemberStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mitgliedsstatus ändern (Admin/KG-Verwalter)."""
    check_staffel_manager(current_user, db)

    membership = db.query(UserCommandGroup).filter(UserCommandGroup.id == membership_id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Mitgliedschaft nicht gefunden")

    membership.status = data.status
    if data.notes is not None:
        membership.notes = data.notes

    db.commit()
    db.refresh(membership)
    return membership


@router.delete("/members/{membership_id}")
async def remove_member(
    membership_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """User aus Kommandogruppe entfernen (Admin/KG-Verwalter)."""
    check_staffel_manager(current_user, db)

    membership = db.query(UserCommandGroup).filter(UserCommandGroup.id == membership_id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Mitgliedschaft nicht gefunden")

    db.delete(membership)
    db.commit()
    return {"message": "Mitglied entfernt"}


# ============== Einsatzrollen ==============

@router.get("/operational-roles", response_model=List[OperationalRoleResponse])
async def get_operational_roles(
    command_group_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Alle Einsatzrollen abrufen, optional gefiltert nach KG."""
    query = db.query(OperationalRole)
    if command_group_id:
        query = query.filter(OperationalRole.command_group_id == command_group_id)
    return query.order_by(OperationalRole.command_group_id, OperationalRole.sort_order).all()


@router.post("/operational-roles", response_model=OperationalRoleResponse)
async def create_operational_role(
    data: OperationalRoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Neue Einsatzrolle erstellen (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    # Prüfen ob Gruppe existiert
    group = db.query(CommandGroup).filter(CommandGroup.id == data.command_group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Kommandogruppe nicht gefunden")

    role = OperationalRole(**data.dict())
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.patch("/operational-roles/{role_id}", response_model=OperationalRoleResponse)
async def update_operational_role(
    role_id: int,
    data: OperationalRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Einsatzrolle bearbeiten (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    role = db.query(OperationalRole).filter(OperationalRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Einsatzrolle nicht gefunden")

    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(role, key, value)

    db.commit()
    db.refresh(role)
    return role


@router.delete("/operational-roles/{role_id}")
async def delete_operational_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Einsatzrolle löschen (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    role = db.query(OperationalRole).filter(OperationalRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Einsatzrolle nicht gefunden")

    db.delete(role)
    db.commit()
    return {"message": "Einsatzrolle gelöscht"}


# ============== User Einsatzrollen ==============

@router.post("/users/{user_id}/operational-roles", response_model=UserOperationalRoleResponse)
async def assign_operational_role(
    user_id: int,
    data: UserOperationalRoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Einsatzrolle einem User zuweisen (Admin/KG-Verwalter)."""
    check_staffel_manager(current_user, db)

    # Prüfen ob User existiert
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User nicht gefunden")

    # Prüfen ob Rolle existiert
    role = db.query(OperationalRole).filter(OperationalRole.id == data.operational_role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Einsatzrolle nicht gefunden")

    # Prüfen ob bereits zugewiesen
    existing = db.query(UserOperationalRole).filter(
        UserOperationalRole.user_id == user_id,
        UserOperationalRole.operational_role_id == data.operational_role_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Rolle bereits zugewiesen")

    assignment = UserOperationalRole(
        user_id=user_id,
        operational_role_id=data.operational_role_id,
        is_training=data.is_training
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.patch("/user-operational-roles/{assignment_id}", response_model=UserOperationalRoleResponse)
async def update_operational_role_assignment(
    assignment_id: int,
    data: UserOperationalRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Einsatzrollen-Zuweisung bearbeiten (Admin/KG-Verwalter)."""
    check_staffel_manager(current_user, db)

    assignment = db.query(UserOperationalRole).filter(UserOperationalRole.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Zuweisung nicht gefunden")

    if data.is_training is not None:
        assignment.is_training = data.is_training

    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/user-operational-roles/{assignment_id}")
async def remove_operational_role(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Einsatzrolle entfernen (Admin/KG-Verwalter)."""
    check_staffel_manager(current_user, db)

    assignment = db.query(UserOperationalRole).filter(UserOperationalRole.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Zuweisung nicht gefunden")

    db.delete(assignment)
    db.commit()
    return {"message": "Einsatzrolle entfernt"}


# ============== Funktionsrollen ==============

@router.get("/function-roles", response_model=List[FunctionRoleResponse])
async def get_function_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Alle Funktionsrollen abrufen."""
    return db.query(FunctionRole).order_by(FunctionRole.sort_order).all()


@router.post("/function-roles", response_model=FunctionRoleResponse)
async def create_function_role(
    data: FunctionRoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Neue Funktionsrolle erstellen (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    existing = db.query(FunctionRole).filter(FunctionRole.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Name bereits vergeben")

    role = FunctionRole(**data.dict())
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.patch("/function-roles/{role_id}", response_model=FunctionRoleResponse)
async def update_function_role(
    role_id: int,
    data: FunctionRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Funktionsrolle bearbeiten (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    role = db.query(FunctionRole).filter(FunctionRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Funktionsrolle nicht gefunden")

    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(role, key, value)

    db.commit()
    db.refresh(role)
    return role


@router.delete("/function-roles/{role_id}")
async def delete_function_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Funktionsrolle löschen (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    role = db.query(FunctionRole).filter(FunctionRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Funktionsrolle nicht gefunden")

    db.delete(role)
    db.commit()
    return {"message": "Funktionsrolle gelöscht"}


# ============== User Funktionsrollen ==============

@router.post("/users/{user_id}/function-roles", response_model=UserFunctionRoleResponse)
async def assign_function_role(
    user_id: int,
    data: UserFunctionRoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Funktionsrolle einem User zuweisen (Admin/KG-Verwalter)."""
    check_staffel_manager(current_user, db)

    # Prüfen ob User existiert
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User nicht gefunden")

    # Prüfen ob Rolle existiert
    role = db.query(FunctionRole).filter(FunctionRole.id == data.function_role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Funktionsrolle nicht gefunden")

    # Prüfen ob bereits zugewiesen
    existing = db.query(UserFunctionRole).filter(
        UserFunctionRole.user_id == user_id,
        UserFunctionRole.function_role_id == data.function_role_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Rolle bereits zugewiesen")

    assignment = UserFunctionRole(
        user_id=user_id,
        function_role_id=data.function_role_id
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/user-function-roles/{assignment_id}")
async def remove_function_role(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Funktionsrolle entfernen (Admin/KG-Verwalter)."""
    check_staffel_manager(current_user, db)

    assignment = db.query(UserFunctionRole).filter(UserFunctionRole.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Zuweisung nicht gefunden")

    db.delete(assignment)
    db.commit()
    return {"message": "Funktionsrolle entfernt"}


# ============== Schiffe ==============

@router.get("/command-groups/{group_id}/ships", response_model=List[ShipResponse])
async def get_group_ships(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Schiffe einer Kommandogruppe abrufen."""
    return db.query(CommandGroupShip).filter(
        CommandGroupShip.command_group_id == group_id
    ).order_by(CommandGroupShip.sort_order).all()


@router.post("/command-groups/{group_id}/ships", response_model=ShipResponse)
async def add_ship_to_group(
    group_id: int,
    data: ShipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Schiff zu Kommandogruppe hinzufügen (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    group = db.query(CommandGroup).filter(CommandGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Kommandogruppe nicht gefunden")

    ship = CommandGroupShip(
        command_group_id=group_id,
        ship_name=data.ship_name,
        ship_image=data.ship_image,
        sort_order=data.sort_order
    )
    db.add(ship)
    db.commit()
    db.refresh(ship)
    return ship


@router.patch("/ships/{ship_id}", response_model=ShipResponse)
async def update_ship(
    ship_id: int,
    data: ShipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Schiff bearbeiten (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    ship = db.query(CommandGroupShip).filter(CommandGroupShip.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Schiff nicht gefunden")

    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(ship, key, value)

    db.commit()
    db.refresh(ship)
    return ship


@router.delete("/ships/{ship_id}")
async def remove_ship(
    ship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Schiff entfernen (Admin)."""
    check_role(current_user, UserRole.ADMIN)

    ship = db.query(CommandGroupShip).filter(CommandGroupShip.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Schiff nicht gefunden")

    db.delete(ship)
    db.commit()
    return {"message": "Schiff entfernt"}


# ============== Übersicht ==============

@router.get("/overview", response_model=StaffelOverviewResponse)
async def get_staffel_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Komplette Staffelstruktur für Frontend."""

    # Kommandogruppen mit allen Details laden
    command_groups = db.query(CommandGroup).order_by(CommandGroup.sort_order).all()

    # Funktionsrollen laden
    all_function_roles = db.query(FunctionRole).order_by(FunctionRole.sort_order).all()

    # Nach Leadership trennen
    leadership_roles = [r for r in all_function_roles if r.is_leadership]
    function_roles = [r for r in all_function_roles if not r.is_leadership]

    # User-Zuweisungen für Funktionsrollen laden
    def get_function_role_with_users(role):
        assignments = db.query(UserFunctionRole).filter(
            UserFunctionRole.function_role_id == role.id
        ).all()
        return {
            "id": role.id,
            "name": role.name,
            "description": role.description,
            "is_leadership": role.is_leadership,
            "sort_order": role.sort_order,
            "users": assignments
        }

    # User-Zuweisungen für Einsatzrollen laden
    def get_operational_role_with_users(role):
        assignments = db.query(UserOperationalRole).filter(
            UserOperationalRole.operational_role_id == role.id
        ).all()
        return {
            "id": role.id,
            "command_group_id": role.command_group_id,
            "name": role.name,
            "description": role.description,
            "sort_order": role.sort_order,
            "users": assignments
        }

    # Kommandogruppen mit erweiterten Einsatzrollen bauen
    def get_command_group_detail(group):
        return {
            "id": group.id,
            "name": group.name,
            "full_name": group.full_name,
            "description": group.description,
            "sort_order": group.sort_order,
            "created_at": group.created_at,
            "ships": group.ships,
            "operational_roles": [get_operational_role_with_users(r) for r in group.operational_roles],
            "members": group.members
        }

    return {
        "command_groups": [get_command_group_detail(g) for g in command_groups],
        "function_roles": [get_function_role_with_users(r) for r in function_roles],
        "leadership_roles": [get_function_role_with_users(r) for r in leadership_roles],
        "can_manage": is_staffel_manager(current_user, db)
    }


@router.get("/users/{user_id}/profile", response_model=UserStaffelProfile)
async def get_user_staffel_profile(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Staffelprofil eines Users mit allen Zuordnungen."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User nicht gefunden")

    command_groups = db.query(UserCommandGroup).filter(
        UserCommandGroup.user_id == user_id
    ).all()

    operational_roles = db.query(UserOperationalRole).filter(
        UserOperationalRole.user_id == user_id
    ).all()

    function_roles = db.query(UserFunctionRole).filter(
        UserFunctionRole.user_id == user_id
    ).all()

    return {
        "user": user,
        "command_groups": command_groups,
        "operational_roles": operational_roles,
        "function_roles": function_roles
    }


# ============== Self-Service KG-Anmeldung ==============

@router.get("/my-command-groups", response_model=MyCommandGroupsResponse)
async def get_my_command_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Eigene KG-Mitgliedschaften abrufen."""
    memberships = db.query(UserCommandGroup).filter(
        UserCommandGroup.user_id == current_user.id
    ).all()

    # User kann sich nur einmal selbst zuweisen (wenn noch keine Mitgliedschaften)
    can_self_assign = len(memberships) == 0

    return {
        "command_group_ids": [m.command_group_id for m in memberships],
        "can_self_assign": can_self_assign
    }


@router.post("/my-command-groups", response_model=MyCommandGroupsResponse)
async def set_my_command_groups(
    data: MyCommandGroupsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Eigene KG-Mitgliedschaften setzen (einmalig für Member)."""
    # Prüfen ob User bereits Mitgliedschaften hat
    existing = db.query(UserCommandGroup).filter(
        UserCommandGroup.user_id == current_user.id
    ).count()

    if existing > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Du hast dich bereits für Kommandogruppen angemeldet. Wende dich an einen KG-Verwalter für Änderungen."
        )

    # Prüfen ob mindestens eine KG gewählt wurde
    if not data.command_group_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bitte wähle mindestens eine Kommandogruppe aus."
        )

    # Prüfen ob alle KGs existieren
    valid_groups = db.query(CommandGroup).filter(
        CommandGroup.id.in_(data.command_group_ids)
    ).all()

    if len(valid_groups) != len(data.command_group_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Eine oder mehrere Kommandogruppen existieren nicht."
        )

    # Mitgliedschaften erstellen
    for group_id in data.command_group_ids:
        membership = UserCommandGroup(
            user_id=current_user.id,
            command_group_id=group_id,
            status=MemberStatus.ACTIVE
        )
        db.add(membership)

    db.commit()

    return {
        "command_group_ids": data.command_group_ids,
        "can_self_assign": False
    }


# ============== Assignment Matrix ==============

@router.get("/command-groups/{group_id}/assignment-matrix", response_model=AssignmentMatrixResponse)
async def get_assignment_matrix(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Matrix-Daten für Einsatzrollen-UI (KG-Verwalter)."""
    check_staffel_manager(current_user, db)

    # Kommandogruppe laden
    group = db.query(CommandGroup).filter(CommandGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Kommandogruppe nicht gefunden")

    # Alle Mitglieder der KG
    memberships = db.query(UserCommandGroup).filter(
        UserCommandGroup.command_group_id == group_id
    ).all()

    # Alle Einsatzrollen der KG
    roles = db.query(OperationalRole).filter(
        OperationalRole.command_group_id == group_id
    ).order_by(OperationalRole.sort_order).all()

    role_list = [{"id": r.id, "name": r.name, "description": r.description} for r in roles]
    role_ids = [r.id for r in roles]

    # Alle Zuweisungen für diese KG laden (vorab, um has_role zu berechnen)
    user_ids = [m.user.id for m in memberships]

    assignments_query = db.query(UserOperationalRole).filter(
        UserOperationalRole.operational_role_id.in_(role_ids),
        UserOperationalRole.user_id.in_(user_ids)
    ).all() if user_ids else []

    # Set von User-IDs die mindestens eine Rolle haben
    users_with_roles = set(a.user_id for a in assignments_query)

    users = []
    for m in memberships:
        users.append({
            "id": m.user.id,
            "username": m.user.username,
            "display_name": m.user.display_name,
            "avatar": m.user.avatar,
            "status": m.status.value if m.status else None,
            "has_role": m.user.id in users_with_roles
        })

    assignments = []
    for a in assignments_query:
        assignments.append({
            "user_id": a.user_id,
            "operational_role_id": a.operational_role_id,
            "is_assigned": True,
            "is_training": a.is_training,
            "assignment_id": a.id
        })

    return {
        "command_group_id": group_id,
        "command_group_name": group.name,
        "users": users,
        "roles": role_list,
        "assignments": assignments
    }


@router.post("/command-groups/{group_id}/assignments/bulk")
async def bulk_update_assignments(
    group_id: int,
    data: BulkAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Bulk-Update für Einsatzrollen (KG-Verwalter)."""
    check_staffel_manager(current_user, db)

    # Prüfen ob KG existiert
    group = db.query(CommandGroup).filter(CommandGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Kommandogruppe nicht gefunden")

    # Nur Rollen dieser KG erlauben
    valid_role_ids = {r.id for r in group.operational_roles}

    added = 0
    removed = 0
    updated = 0

    for entry in data.assignments:
        if entry.operational_role_id not in valid_role_ids:
            continue  # Ignoriere Rollen die nicht zu dieser KG gehören

        existing = db.query(UserOperationalRole).filter(
            UserOperationalRole.user_id == entry.user_id,
            UserOperationalRole.operational_role_id == entry.operational_role_id
        ).first()

        if entry.is_assigned:
            if existing:
                # Update is_training falls unterschiedlich
                if existing.is_training != entry.is_training:
                    existing.is_training = entry.is_training
                    updated += 1
            else:
                # Neue Zuweisung erstellen
                assignment = UserOperationalRole(
                    user_id=entry.user_id,
                    operational_role_id=entry.operational_role_id,
                    is_training=entry.is_training
                )
                db.add(assignment)
                added += 1
        else:
            if existing:
                # Zuweisung entfernen
                db.delete(existing)
                removed += 1

    db.commit()

    return {
        "message": "Zuweisungen aktualisiert",
        "added": added,
        "removed": removed,
        "updated": updated
    }
