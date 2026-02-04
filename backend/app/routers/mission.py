"""
Einsatzplaner Router

API-Endpoints für:
- Missions (Einsätze)
- Units (Einheiten)
- Positions (Positionen)
- Phases (Phasen)
- Registrations (Anmeldungen)
- Assignments (Zuweisungen)
- Templates (Vorlagen)
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.location import Location
from app.models.mission import (
    Mission, MissionPhase, MissionUnit, MissionPosition,
    MissionRegistration, MissionAssignment, MissionTemplate,
    UserShip, MissionStatus, STANDARD_RADIO_FREQUENCIES
)
from app.schemas.mission import (
    MissionCreate, MissionUpdate, MissionResponse, MissionDetailResponse,
    MissionPhaseCreate, MissionPhaseUpdate, MissionPhaseResponse,
    MissionUnitCreate, MissionUnitUpdate, MissionUnitResponse,
    MissionPositionCreate, MissionPositionUpdate, MissionPositionResponse,
    MissionRegistrationCreate, MissionRegistrationResponse,
    MissionAssignmentCreate, MissionAssignmentUpdate, MissionAssignmentResponse,
    MissionTemplateResponse, BriefingResponse, BriefingUnit,
    RadioFrequencyPreset, RadioFrequencyPresetsResponse
)
from app.auth.jwt import get_current_user
from app.auth.dependencies import check_role

router = APIRouter()


# ============== Helper Functions ==============

def is_mission_manager(user: User, mission: Mission) -> bool:
    """Prüft ob User Offizier+, Admin oder Ersteller ist."""
    return (
        user.role in [UserRole.ADMIN, UserRole.OFFICER, UserRole.TREASURER]
        or mission.created_by_id == user.id
    )


def check_mission_manager(user: User, mission: Mission):
    """Wirft 403 wenn User kein Offizier+ oder Ersteller ist."""
    if not is_mission_manager(user, mission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nur Offiziere oder der Ersteller können diese Aktion durchführen"
        )


def mission_to_response(mission: Mission, db: Session) -> dict:
    """Konvertiert Mission zu Response mit berechneten Feldern."""
    # Zähle Positionen
    total_positions = 0
    assignment_count = 0
    for unit in mission.units:
        for pos in unit.positions:
            total_positions += pos.max_count
            assignment_count += len(pos.assignments)

    return {
        "id": mission.id,
        "title": mission.title,
        "description": mission.description,
        "scheduled_date": mission.scheduled_date,
        "duration_minutes": mission.duration_minutes,
        "status": mission.status,
        "start_location_id": mission.start_location_id,
        "start_location_name": mission.start_location.name if mission.start_location else None,
        "equipment_level": mission.equipment_level,
        "target_group": mission.target_group,
        "rules_of_engagement": mission.rules_of_engagement,
        "created_by_id": mission.created_by_id,
        "created_by": mission.created_by,
        "created_at": mission.created_at,
        "updated_at": mission.updated_at,
        "registration_count": len(mission.registrations),
        "assignment_count": assignment_count,
        "total_positions": total_positions,
    }


# ============== Missions CRUD ==============

@router.get("", response_model=List[MissionResponse])
async def get_missions(
    status_filter: Optional[MissionStatus] = None,
    upcoming: bool = False,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt Missionen zurück. Filtert nach Status und zeigt nur veröffentlichte für normale User."""
    query = db.query(Mission).options(
        joinedload(Mission.created_by),
        joinedload(Mission.start_location),
        joinedload(Mission.units).joinedload(MissionUnit.positions).joinedload(MissionPosition.assignments),
        joinedload(Mission.registrations)
    )

    # Normale User sehen nur veröffentlichte Missionen (außer eigene)
    if current_user.role not in [UserRole.ADMIN, UserRole.OFFICER, UserRole.TREASURER]:
        query = query.filter(
            (Mission.status != MissionStatus.DRAFT) |
            (Mission.created_by_id == current_user.id)
        )

    if status_filter:
        query = query.filter(Mission.status == status_filter)

    if upcoming:
        query = query.filter(Mission.scheduled_date >= datetime.now())
        query = query.order_by(Mission.scheduled_date.asc())
    else:
        query = query.order_by(Mission.scheduled_date.desc())

    missions = query.limit(limit).all()
    return [mission_to_response(m, db) for m in missions]


@router.get("/templates", response_model=List[MissionTemplateResponse])
async def get_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle verfügbaren Templates zurück."""
    return db.query(MissionTemplate).order_by(MissionTemplate.name).all()


@router.get("/radio-frequencies", response_model=RadioFrequencyPresetsResponse)
async def get_radio_frequencies(
    current_user: User = Depends(get_current_user)
):
    """Gibt Standard-Funkfrequenzen zurück."""
    presets = [
        RadioFrequencyPreset(key="el_1", label="Einsatzleitung 1", frequency="102.11"),
        RadioFrequencyPreset(key="el_2", label="Einsatzleitung 2", frequency="102.12"),
        RadioFrequencyPreset(key="gks_1", label="GKS Intern 1", frequency="102.31"),
        RadioFrequencyPreset(key="gks_2", label="GKS Intern 2", frequency="102.32"),
        RadioFrequencyPreset(key="jaeger_1", label="Jäger 1", frequency="102.51"),
        RadioFrequencyPreset(key="jaeger_2", label="Jäger 2", frequency="102.52"),
        RadioFrequencyPreset(key="squad_1", label="Squad 1", frequency="102.61"),
        RadioFrequencyPreset(key="squad_2", label="Squad 2", frequency="102.62"),
        RadioFrequencyPreset(key="beast", label="BEAST", frequency="102.70"),
        RadioFrequencyPreset(key="targets_1", label="Targets 1", frequency="102.91"),
        RadioFrequencyPreset(key="targets_2", label="Targets 2", frequency="102.92"),
        RadioFrequencyPreset(key="notfall", label="Notfall", frequency="102.90"),
    ]
    return RadioFrequencyPresetsResponse(presets=presets)


@router.get("/{mission_id}", response_model=MissionDetailResponse)
async def get_mission(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt eine einzelne Mission mit allen Details zurück."""
    mission = db.query(Mission).options(
        joinedload(Mission.created_by),
        joinedload(Mission.start_location),
        joinedload(Mission.units).joinedload(MissionUnit.positions).joinedload(MissionPosition.assignments).joinedload(MissionAssignment.user),
        joinedload(Mission.phases),
        joinedload(Mission.registrations).joinedload(MissionRegistration.user)
    ).filter(Mission.id == mission_id).first()

    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    # Prüfe Sichtbarkeit für Drafts
    if mission.status == MissionStatus.DRAFT and not is_mission_manager(current_user, mission):
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    # Baue Response
    response = mission_to_response(mission, db)

    # Füge Units mit Positionen und Assignments hinzu
    units = []
    for unit in sorted(mission.units, key=lambda u: u.sort_order):
        positions = []
        for pos in sorted(unit.positions, key=lambda p: p.sort_order):
            assignments = []
            for assign in pos.assignments:
                assignments.append({
                    "id": assign.id,
                    "position_id": assign.position_id,
                    "user_id": assign.user_id,
                    "placeholder_name": assign.placeholder_name,
                    "user": assign.user,
                    "is_backup": assign.is_backup,
                    "is_training": assign.is_training,
                    "notes": assign.notes,
                    "assigned_at": assign.assigned_at,
                    "assigned_by_id": assign.assigned_by_id,
                })
            positions.append({
                "id": pos.id,
                "unit_id": pos.unit_id,
                "name": pos.name,
                "position_type": pos.position_type,
                "is_required": pos.is_required,
                "min_count": pos.min_count,
                "max_count": pos.max_count,
                "required_role_id": pos.required_role_id,
                "notes": pos.notes,
                "sort_order": pos.sort_order,
                "assignments": assignments,
            })
        units.append({
            "id": unit.id,
            "mission_id": unit.mission_id,
            "name": unit.name,
            "unit_type": unit.unit_type,
            "description": unit.description,
            "ship_name": unit.ship_name,
            "ship_id": unit.ship_id,
            "radio_frequencies": unit.radio_frequencies,
            "sort_order": unit.sort_order,
            "positions": positions,
        })
    response["units"] = units

    # Füge Phasen hinzu
    response["phases"] = sorted(mission.phases, key=lambda p: p.sort_order)

    # Füge Registrations hinzu mit has_ships Info
    registrations = []
    for reg in mission.registrations:
        ship_count = db.query(UserShip).filter(UserShip.user_id == reg.user_id).count()
        registrations.append({
            "id": reg.id,
            "mission_id": reg.mission_id,
            "user_id": reg.user_id,
            "user": reg.user,
            "preferred_unit_id": reg.preferred_unit_id,
            "preferred_position_id": reg.preferred_position_id,
            "availability_note": reg.availability_note,
            "status": reg.status,
            "registered_at": reg.registered_at,
            "has_ships": ship_count > 0,
        })
    response["registrations"] = registrations

    return response


@router.post("", response_model=MissionDetailResponse)
async def create_mission(
    mission_data: MissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Erstellt eine neue Mission. Nur Offiziere+ oder KG-Verwalter."""
    if current_user.role not in [UserRole.ADMIN, UserRole.OFFICER, UserRole.TREASURER] and not current_user.is_kg_verwalter:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nur Offiziere oder KG-Verwalter können Einsätze erstellen"
        )

    # Location prüfen
    if mission_data.start_location_id:
        location = db.query(Location).filter(Location.id == mission_data.start_location_id).first()
        if not location:
            raise HTTPException(status_code=404, detail="Standort nicht gefunden")

    mission = Mission(
        title=mission_data.title,
        description=mission_data.description,
        scheduled_date=mission_data.scheduled_date,
        duration_minutes=mission_data.duration_minutes,
        status=MissionStatus.DRAFT,
        start_location_id=mission_data.start_location_id,
        equipment_level=mission_data.equipment_level,
        target_group=mission_data.target_group,
        rules_of_engagement=mission_data.rules_of_engagement,
        created_by_id=current_user.id,
    )
    db.add(mission)
    db.flush()

    # Von Template kopieren falls angegeben
    if mission_data.template_id:
        template = db.query(MissionTemplate).filter(MissionTemplate.id == mission_data.template_id).first()
        if template and template.template_data:
            data = template.template_data

            # Units erstellen
            for unit_data in data.get("units", []):
                unit = MissionUnit(
                    mission_id=mission.id,
                    name=unit_data.get("name"),
                    unit_type=unit_data.get("unit_type"),
                    ship_name=unit_data.get("ship_name"),
                    radio_frequencies=unit_data.get("radio_frequencies"),
                    sort_order=unit_data.get("sort_order", 0),
                )
                db.add(unit)
                db.flush()

                # Positions erstellen
                for pos_data in unit_data.get("positions", []):
                    pos = MissionPosition(
                        unit_id=unit.id,
                        name=pos_data.get("name"),
                        position_type=pos_data.get("position_type"),
                        is_required=pos_data.get("is_required", True),
                        min_count=pos_data.get("min_count", 1),
                        max_count=pos_data.get("max_count", 1),
                        sort_order=pos_data.get("sort_order", 0),
                    )
                    db.add(pos)

            # Phasen erstellen
            for phase_data in data.get("phases", []):
                phase = MissionPhase(
                    mission_id=mission.id,
                    phase_number=phase_data.get("phase_number"),
                    title=phase_data.get("title"),
                    description=phase_data.get("description"),
                    sort_order=phase_data.get("phase_number", 0),
                )
                db.add(phase)

    db.commit()
    db.refresh(mission)

    # Lade vollständige Mission
    return await get_mission(mission.id, db, current_user)


@router.patch("/{mission_id}", response_model=MissionDetailResponse)
async def update_mission(
    mission_id: int,
    mission_data: MissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktualisiert eine Mission."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    # Felder aktualisieren
    if mission_data.title is not None:
        mission.title = mission_data.title
    if mission_data.description is not None:
        mission.description = mission_data.description
    if mission_data.scheduled_date is not None:
        mission.scheduled_date = mission_data.scheduled_date
    if mission_data.duration_minutes is not None:
        mission.duration_minutes = mission_data.duration_minutes
    if mission_data.start_location_id is not None:
        mission.start_location_id = mission_data.start_location_id
    if mission_data.equipment_level is not None:
        mission.equipment_level = mission_data.equipment_level
    if mission_data.target_group is not None:
        mission.target_group = mission_data.target_group
    if mission_data.rules_of_engagement is not None:
        mission.rules_of_engagement = mission_data.rules_of_engagement
    if mission_data.status is not None:
        mission.status = mission_data.status

    db.commit()
    return await get_mission(mission_id, db, current_user)


@router.delete("/{mission_id}")
async def delete_mission(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht eine Mission. Nur Ersteller oder Admin."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    db.delete(mission)
    db.commit()
    return {"message": "Mission gelöscht"}


# ============== Status Actions ==============

@router.post("/{mission_id}/publish")
async def publish_mission(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Veröffentlicht eine Mission."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    mission.status = MissionStatus.PUBLISHED
    db.commit()
    return {"message": "Mission veröffentlicht", "status": mission.status.value}


@router.post("/{mission_id}/lock")
async def lock_mission(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sperrt Anmeldungen für eine Mission."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    mission.status = MissionStatus.LOCKED
    db.commit()
    return {"message": "Anmeldungen gesperrt", "status": mission.status.value}


@router.post("/{mission_id}/complete")
async def complete_mission(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Markiert eine Mission als abgeschlossen."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    mission.status = MissionStatus.COMPLETED
    db.commit()
    return {"message": "Mission abgeschlossen", "status": mission.status.value}


# ============== Phases CRUD ==============

@router.post("/{mission_id}/phases", response_model=MissionPhaseResponse)
async def create_phase(
    mission_id: int,
    phase_data: MissionPhaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fügt eine Phase hinzu."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    phase = MissionPhase(
        mission_id=mission_id,
        phase_number=phase_data.phase_number,
        title=phase_data.title,
        description=phase_data.description,
        start_time=phase_data.start_time,
        sort_order=phase_data.sort_order,
    )
    db.add(phase)
    db.commit()
    db.refresh(phase)
    return phase


@router.patch("/{mission_id}/phases/{phase_id}", response_model=MissionPhaseResponse)
async def update_phase(
    mission_id: int,
    phase_id: int,
    phase_data: MissionPhaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktualisiert eine Phase."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    phase = db.query(MissionPhase).filter(
        MissionPhase.id == phase_id,
        MissionPhase.mission_id == mission_id
    ).first()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase nicht gefunden")

    if phase_data.phase_number is not None:
        phase.phase_number = phase_data.phase_number
    if phase_data.title is not None:
        phase.title = phase_data.title
    if phase_data.description is not None:
        phase.description = phase_data.description
    if phase_data.start_time is not None:
        phase.start_time = phase_data.start_time
    if phase_data.sort_order is not None:
        phase.sort_order = phase_data.sort_order

    db.commit()
    db.refresh(phase)
    return phase


@router.delete("/{mission_id}/phases/{phase_id}")
async def delete_phase(
    mission_id: int,
    phase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht eine Phase."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    phase = db.query(MissionPhase).filter(
        MissionPhase.id == phase_id,
        MissionPhase.mission_id == mission_id
    ).first()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase nicht gefunden")

    db.delete(phase)
    db.commit()
    return {"message": "Phase gelöscht"}


# ============== Units CRUD ==============

@router.post("/{mission_id}/units", response_model=MissionUnitResponse)
async def create_unit(
    mission_id: int,
    unit_data: MissionUnitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fügt eine Einheit hinzu."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    unit = MissionUnit(
        mission_id=mission_id,
        name=unit_data.name,
        unit_type=unit_data.unit_type,
        description=unit_data.description,
        ship_name=unit_data.ship_name,
        ship_id=unit_data.ship_id,
        radio_frequencies=unit_data.radio_frequencies,
        sort_order=unit_data.sort_order,
    )
    db.add(unit)
    db.flush()

    # Positionen hinzufügen
    for pos_data in unit_data.positions:
        pos = MissionPosition(
            unit_id=unit.id,
            name=pos_data.name,
            position_type=pos_data.position_type,
            is_required=pos_data.is_required,
            min_count=pos_data.min_count,
            max_count=pos_data.max_count,
            required_role_id=pos_data.required_role_id,
            notes=pos_data.notes,
            sort_order=pos_data.sort_order,
        )
        db.add(pos)

    db.commit()
    db.refresh(unit)
    return unit


@router.patch("/{mission_id}/units/{unit_id}", response_model=MissionUnitResponse)
async def update_unit(
    mission_id: int,
    unit_id: int,
    unit_data: MissionUnitUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktualisiert eine Einheit."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    unit = db.query(MissionUnit).filter(
        MissionUnit.id == unit_id,
        MissionUnit.mission_id == mission_id
    ).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Einheit nicht gefunden")

    if unit_data.name is not None:
        unit.name = unit_data.name
    if unit_data.unit_type is not None:
        unit.unit_type = unit_data.unit_type
    if unit_data.description is not None:
        unit.description = unit_data.description
    if unit_data.ship_name is not None:
        unit.ship_name = unit_data.ship_name
    if unit_data.ship_id is not None:
        unit.ship_id = unit_data.ship_id
    if unit_data.radio_frequencies is not None:
        unit.radio_frequencies = unit_data.radio_frequencies
    if unit_data.sort_order is not None:
        unit.sort_order = unit_data.sort_order

    db.commit()
    db.refresh(unit)
    return unit


@router.delete("/{mission_id}/units/{unit_id}")
async def delete_unit(
    mission_id: int,
    unit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht eine Einheit mit allen Positionen."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    unit = db.query(MissionUnit).filter(
        MissionUnit.id == unit_id,
        MissionUnit.mission_id == mission_id
    ).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Einheit nicht gefunden")

    db.delete(unit)
    db.commit()
    return {"message": "Einheit gelöscht"}


# ============== Positions CRUD ==============

@router.post("/{mission_id}/units/{unit_id}/positions", response_model=MissionPositionResponse)
async def create_position(
    mission_id: int,
    unit_id: int,
    pos_data: MissionPositionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fügt eine Position zu einer Einheit hinzu."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    unit = db.query(MissionUnit).filter(
        MissionUnit.id == unit_id,
        MissionUnit.mission_id == mission_id
    ).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Einheit nicht gefunden")

    pos = MissionPosition(
        unit_id=unit_id,
        name=pos_data.name,
        position_type=pos_data.position_type,
        is_required=pos_data.is_required,
        min_count=pos_data.min_count,
        max_count=pos_data.max_count,
        required_role_id=pos_data.required_role_id,
        notes=pos_data.notes,
        sort_order=pos_data.sort_order,
    )
    db.add(pos)
    db.commit()
    db.refresh(pos)
    return pos


@router.patch("/{mission_id}/positions/{pos_id}", response_model=MissionPositionResponse)
async def update_position(
    mission_id: int,
    pos_id: int,
    pos_data: MissionPositionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktualisiert eine Position."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    pos = db.query(MissionPosition).join(MissionUnit).filter(
        MissionPosition.id == pos_id,
        MissionUnit.mission_id == mission_id
    ).first()
    if not pos:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")

    if pos_data.name is not None:
        pos.name = pos_data.name
    if pos_data.position_type is not None:
        pos.position_type = pos_data.position_type
    if pos_data.is_required is not None:
        pos.is_required = pos_data.is_required
    if pos_data.min_count is not None:
        pos.min_count = pos_data.min_count
    if pos_data.max_count is not None:
        pos.max_count = pos_data.max_count
    if pos_data.required_role_id is not None:
        pos.required_role_id = pos_data.required_role_id
    if pos_data.notes is not None:
        pos.notes = pos_data.notes
    if pos_data.sort_order is not None:
        pos.sort_order = pos_data.sort_order

    db.commit()
    db.refresh(pos)
    return pos


@router.delete("/{mission_id}/positions/{pos_id}")
async def delete_position(
    mission_id: int,
    pos_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht eine Position."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    pos = db.query(MissionPosition).join(MissionUnit).filter(
        MissionPosition.id == pos_id,
        MissionUnit.mission_id == mission_id
    ).first()
    if not pos:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")

    db.delete(pos)
    db.commit()
    return {"message": "Position gelöscht"}


# ============== Registrations ==============

@router.post("/{mission_id}/register", response_model=MissionRegistrationResponse)
async def register_for_mission(
    mission_id: int,
    reg_data: MissionRegistrationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Meldet den aktuellen User für eine Mission an."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    if mission.status not in [MissionStatus.PUBLISHED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anmeldung nur für veröffentlichte Missionen möglich"
        )

    # Prüfe ob bereits angemeldet
    existing = db.query(MissionRegistration).filter(
        MissionRegistration.mission_id == mission_id,
        MissionRegistration.user_id == current_user.id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Du bist bereits für diese Mission angemeldet"
        )

    reg = MissionRegistration(
        mission_id=mission_id,
        user_id=current_user.id,
        preferred_unit_id=reg_data.preferred_unit_id,
        preferred_position_id=reg_data.preferred_position_id,
        availability_note=reg_data.availability_note,
        status="registered",
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)

    ship_count = db.query(UserShip).filter(UserShip.user_id == current_user.id).count()
    return {
        **reg.__dict__,
        "user": current_user,
        "has_ships": ship_count > 0,
    }


@router.delete("/{mission_id}/register")
async def unregister_from_mission(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Meldet den aktuellen User von einer Mission ab."""
    reg = db.query(MissionRegistration).filter(
        MissionRegistration.mission_id == mission_id,
        MissionRegistration.user_id == current_user.id
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Anmeldung nicht gefunden")

    db.delete(reg)
    db.commit()
    return {"message": "Abgemeldet"}


@router.get("/{mission_id}/my-registration", response_model=Optional[MissionRegistrationResponse])
async def get_my_registration(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt die eigene Anmeldung zurück."""
    reg = db.query(MissionRegistration).filter(
        MissionRegistration.mission_id == mission_id,
        MissionRegistration.user_id == current_user.id
    ).first()
    if not reg:
        return None

    ship_count = db.query(UserShip).filter(UserShip.user_id == current_user.id).count()
    return {
        **reg.__dict__,
        "user": current_user,
        "has_ships": ship_count > 0,
    }


# ============== Assignments ==============

@router.get("/{mission_id}/registrations", response_model=List[MissionRegistrationResponse])
async def get_registrations(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gibt alle Anmeldungen für eine Mission zurück. Nur für Manager."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    regs = db.query(MissionRegistration).options(
        joinedload(MissionRegistration.user)
    ).filter(MissionRegistration.mission_id == mission_id).all()

    result = []
    for reg in regs:
        ship_count = db.query(UserShip).filter(UserShip.user_id == reg.user_id).count()
        result.append({
            **reg.__dict__,
            "user": reg.user,
            "has_ships": ship_count > 0,
        })
    return result


@router.post("/{mission_id}/assignments", response_model=MissionAssignmentResponse)
async def create_assignment(
    mission_id: int,
    assign_data: MissionAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Weist einen User oder Platzhalter einer Position zu."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    # Prüfe ob Position existiert und zur Mission gehört
    pos = db.query(MissionPosition).join(MissionUnit).filter(
        MissionPosition.id == assign_data.position_id,
        MissionUnit.mission_id == mission_id
    ).first()
    if not pos:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")

    # Prüfe ob User existiert (falls angegeben)
    if assign_data.user_id:
        user = db.query(User).filter(User.id == assign_data.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User nicht gefunden")

    assign = MissionAssignment(
        position_id=assign_data.position_id,
        user_id=assign_data.user_id,
        placeholder_name=assign_data.placeholder_name,
        is_backup=assign_data.is_backup,
        is_training=assign_data.is_training,
        notes=assign_data.notes,
        assigned_by_id=current_user.id,
    )
    db.add(assign)
    db.commit()
    db.refresh(assign)

    # Lade User für Response
    if assign.user_id:
        assign.user = db.query(User).filter(User.id == assign.user_id).first()

    return assign


@router.patch("/{mission_id}/assignments/{assign_id}", response_model=MissionAssignmentResponse)
async def update_assignment(
    mission_id: int,
    assign_id: int,
    assign_data: MissionAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktualisiert eine Zuweisung."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    assign = db.query(MissionAssignment).join(MissionPosition).join(MissionUnit).filter(
        MissionAssignment.id == assign_id,
        MissionUnit.mission_id == mission_id
    ).first()
    if not assign:
        raise HTTPException(status_code=404, detail="Zuweisung nicht gefunden")

    if assign_data.user_id is not None:
        assign.user_id = assign_data.user_id
    if assign_data.placeholder_name is not None:
        assign.placeholder_name = assign_data.placeholder_name
    if assign_data.is_backup is not None:
        assign.is_backup = assign_data.is_backup
    if assign_data.is_training is not None:
        assign.is_training = assign_data.is_training
    if assign_data.notes is not None:
        assign.notes = assign_data.notes

    db.commit()
    db.refresh(assign)

    if assign.user_id:
        assign.user = db.query(User).filter(User.id == assign.user_id).first()

    return assign


@router.delete("/{mission_id}/assignments/{assign_id}")
async def delete_assignment(
    mission_id: int,
    assign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht eine Zuweisung."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    check_mission_manager(current_user, mission)

    assign = db.query(MissionAssignment).join(MissionPosition).join(MissionUnit).filter(
        MissionAssignment.id == assign_id,
        MissionUnit.mission_id == mission_id
    ).first()
    if not assign:
        raise HTTPException(status_code=404, detail="Zuweisung nicht gefunden")

    db.delete(assign)
    db.commit()
    return {"message": "Zuweisung gelöscht"}


# ============== Briefing ==============

@router.get("/{mission_id}/briefing", response_model=BriefingResponse)
async def get_briefing(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generiert das formatierte Briefing-Dokument."""
    mission = db.query(Mission).options(
        joinedload(Mission.start_location),
        joinedload(Mission.units).joinedload(MissionUnit.positions).joinedload(MissionPosition.assignments).joinedload(MissionAssignment.user),
        joinedload(Mission.phases)
    ).filter(Mission.id == mission_id).first()

    if not mission:
        raise HTTPException(status_code=404, detail="Mission nicht gefunden")

    # Sammle Platzhalter
    placeholders_used = set()

    # Baue Units für Briefing
    briefing_units = []
    frequency_table = []

    for unit in sorted(mission.units, key=lambda u: u.sort_order):
        positions = []
        for pos in sorted(unit.positions, key=lambda p: p.sort_order):
            assigned_names = []
            for assign in pos.assignments:
                if assign.user:
                    name = assign.user.display_name or assign.user.username
                    if assign.is_training:
                        name += " (i.A.)"
                    if assign.is_backup:
                        name += " (Backup)"
                    if assign.notes:
                        name += f" - {assign.notes}"
                    assigned_names.append(name)
                elif assign.placeholder_name:
                    placeholders_used.add(assign.placeholder_name)
                    assigned_names.append(assign.placeholder_name)

            positions.append({
                "name": pos.name,
                "assigned": assigned_names,
                "is_required": pos.is_required,
                "min_count": pos.min_count,
                "max_count": pos.max_count,
            })

        briefing_units.append(BriefingUnit(
            name=unit.name,
            ship_name=unit.ship_name,
            radio_frequencies=unit.radio_frequencies,
            positions=positions,
        ))

        # Frequenz-Tabelle
        if unit.radio_frequencies:
            frequency_table.append({
                "unit": unit.name,
                **unit.radio_frequencies,
            })

    return BriefingResponse(
        title=mission.title,
        scheduled_date=mission.scheduled_date,
        duration_minutes=mission.duration_minutes,
        # Strukturierte Beschreibungsfelder
        mission_context=mission.mission_context,
        mission_objective=mission.mission_objective,
        preparation_notes=mission.preparation_notes,
        special_notes=mission.special_notes,
        # Pre-Briefing
        start_location=mission.start_location.name if mission.start_location else None,
        equipment_level=mission.equipment_level,
        target_group=mission.target_group,
        rules_of_engagement=mission.rules_of_engagement,
        phases=sorted(mission.phases, key=lambda p: p.sort_order),
        units=briefing_units,
        frequency_table=frequency_table,
        placeholders_used=sorted(placeholders_used),
    )
