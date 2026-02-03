"""
Pydantic Schemas für Staffelstruktur
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.models.staffel import MemberStatus
from app.schemas.user import UserResponse


# ============== Base Schemas ==============

class CommandGroupBase(BaseModel):
    name: str
    full_name: str
    description: Optional[str] = None
    sort_order: int = 0


class OperationalRoleBase(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: int = 0


class FunctionRoleBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_leadership: bool = False
    sort_order: int = 0


class ShipBase(BaseModel):
    ship_name: str
    ship_image: Optional[str] = None
    sort_order: int = 0


# ============== Create Schemas ==============

class CommandGroupCreate(CommandGroupBase):
    pass


class OperationalRoleCreate(OperationalRoleBase):
    command_group_id: int


class FunctionRoleCreate(FunctionRoleBase):
    pass


class ShipCreate(ShipBase):
    command_group_id: int


class UserCommandGroupCreate(BaseModel):
    user_id: int
    command_group_id: int
    status: MemberStatus = MemberStatus.ACTIVE
    notes: Optional[str] = None


class AddMemberToGroup(BaseModel):
    """Schema zum Hinzufügen eines Mitglieds (command_group_id kommt aus URL)."""
    user_id: int
    status: MemberStatus = MemberStatus.ACTIVE
    notes: Optional[str] = None


class UserOperationalRoleCreate(BaseModel):
    user_id: int
    operational_role_id: int
    is_training: bool = False


class UserFunctionRoleCreate(BaseModel):
    user_id: int
    function_role_id: int


# ============== Update Schemas ==============

class CommandGroupUpdate(BaseModel):
    name: Optional[str] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class MemberStatusUpdate(BaseModel):
    status: MemberStatus
    notes: Optional[str] = None


class UserOperationalRoleUpdate(BaseModel):
    is_training: Optional[bool] = None


class FunctionRoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_leadership: Optional[bool] = None
    sort_order: Optional[int] = None


class OperationalRoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class ShipUpdate(BaseModel):
    ship_name: Optional[str] = None
    ship_image: Optional[str] = None
    sort_order: Optional[int] = None


# ============== Response Schemas ==============

class ShipResponse(ShipBase):
    id: int
    command_group_id: int

    class Config:
        from_attributes = True


class OperationalRoleResponse(OperationalRoleBase):
    id: int
    command_group_id: int

    class Config:
        from_attributes = True


class FunctionRoleResponse(FunctionRoleBase):
    id: int

    class Config:
        from_attributes = True


class CommandGroupResponse(CommandGroupBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============== Nested Response Schemas ==============

class UserOperationalRoleResponse(BaseModel):
    """User mit zugewiesener Einsatzrolle."""
    id: int
    user: UserResponse
    operational_role_id: int
    is_training: bool
    assigned_at: datetime

    class Config:
        from_attributes = True


class UserFunctionRoleResponse(BaseModel):
    """User mit zugewiesener Funktionsrolle."""
    id: int
    user: UserResponse
    function_role_id: int
    assigned_at: datetime

    class Config:
        from_attributes = True


class UserCommandGroupResponse(BaseModel):
    """User mit KG-Zuordnung."""
    id: int
    user: UserResponse
    command_group_id: int
    status: MemberStatus
    joined_at: datetime
    notes: Optional[str]

    class Config:
        from_attributes = True


class OperationalRoleWithUsersResponse(OperationalRoleBase):
    """Einsatzrolle mit zugeordneten Usern."""
    id: int
    command_group_id: int
    users: List[UserOperationalRoleResponse]

    class Config:
        from_attributes = True


class FunctionRoleWithUsersResponse(FunctionRoleBase):
    """Funktionsrolle mit zugeordneten Usern."""
    id: int
    users: List[UserFunctionRoleResponse]

    class Config:
        from_attributes = True


class CommandGroupDetailResponse(CommandGroupBase):
    """Kommandogruppe mit allen Details."""
    id: int
    created_at: Optional[datetime] = None
    ships: List[ShipResponse]
    operational_roles: List[OperationalRoleWithUsersResponse]  # Mit User-Zuweisungen
    members: List[UserCommandGroupResponse]

    class Config:
        from_attributes = True


# ============== Overview Schema ==============

class UserStaffelProfile(BaseModel):
    """Staffelprofil eines Users."""
    user: UserResponse
    command_groups: List[UserCommandGroupResponse]
    operational_roles: List[UserOperationalRoleResponse]
    function_roles: List[UserFunctionRoleResponse]


class StaffelOverviewResponse(BaseModel):
    """Komplette Staffelstruktur für Frontend."""
    command_groups: List[CommandGroupDetailResponse]
    function_roles: List[FunctionRoleWithUsersResponse]
    leadership_roles: List[FunctionRoleWithUsersResponse]
    can_manage: bool = False  # True wenn User Admin oder KG-Verwalter ist


# ============== Self-Service & Matrix Schemas ==============

class MyCommandGroupsResponse(BaseModel):
    """Eigene KG-Mitgliedschaften."""
    command_group_ids: List[int]
    can_self_assign: bool  # False wenn bereits zugewiesen (einmalig)


class MyCommandGroupsUpdate(BaseModel):
    """KG-Mitgliedschaften setzen (einmalig für Member)."""
    command_group_ids: List[int]


class AssignmentCell(BaseModel):
    """Eine Zelle in der Assignment-Matrix."""
    user_id: int
    operational_role_id: int
    is_assigned: bool
    is_training: bool = False
    assignment_id: Optional[int] = None  # ID wenn zugewiesen


class AssignmentMatrixUser(BaseModel):
    """User in der Matrix."""
    id: int
    membership_id: int  # ID der Mitgliedschaft für Status-Updates
    username: str
    display_name: Optional[str]
    avatar: Optional[str]
    status: Optional[str] = None  # ACTIVE, RECRUIT, INACTIVE, ABSENT
    has_role: bool = False  # Hat mindestens eine Einsatzrolle


class AssignmentMatrixRole(BaseModel):
    """Rolle in der Matrix."""
    id: int
    name: str
    description: Optional[str]


class AssignmentMatrixResponse(BaseModel):
    """Matrix-Daten für Einsatzrollen-UI."""
    command_group_id: int
    command_group_name: str
    users: List[AssignmentMatrixUser]
    roles: List[AssignmentMatrixRole]
    assignments: List[AssignmentCell]  # Alle aktuellen Zuweisungen


class AssignmentEntry(BaseModel):
    """Einzelne Zuweisung für Bulk-Update."""
    user_id: int
    operational_role_id: int
    is_assigned: bool
    is_training: bool = False


class BulkAssignmentUpdate(BaseModel):
    """Bulk-Update für Einsatzrollen."""
    assignments: List[AssignmentEntry]
