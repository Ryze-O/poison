"""add mission planner tables

Revision ID: l9m886283mm6
Revises: k8l775172ll5
Create Date: 2026-02-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'l9m886283mm6'
down_revision: Union[str, None] = 'k8l775172ll5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # === MISSIONS ===
    op.create_table('missions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('scheduled_date', sa.DateTime(), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('status', sa.Enum('draft', 'published', 'locked', 'active', 'completed', 'cancelled', name='missionstatus'), nullable=True),
        sa.Column('start_location_id', sa.Integer(), nullable=True),
        sa.Column('equipment_level', sa.String(length=100), nullable=True),
        sa.Column('target_group', sa.String(length=100), nullable=True),
        sa.Column('rules_of_engagement', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['start_location_id'], ['locations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_missions_id'), 'missions', ['id'], unique=False)

    # === MISSION PHASES ===
    op.create_table('mission_phases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('mission_id', sa.Integer(), nullable=False),
        sa.Column('phase_number', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('start_time', sa.String(length=20), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=True, default=0),
        sa.ForeignKeyConstraint(['mission_id'], ['missions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_mission_phases_id'), 'mission_phases', ['id'], unique=False)

    # === MISSION UNITS ===
    op.create_table('mission_units',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('mission_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('unit_type', sa.String(length=50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('ship_name', sa.String(length=100), nullable=True),
        sa.Column('ship_id', sa.Integer(), nullable=True),
        sa.Column('radio_frequencies', sa.JSON(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=True, default=0),
        sa.ForeignKeyConstraint(['mission_id'], ['missions.id'], ),
        sa.ForeignKeyConstraint(['ship_id'], ['command_group_ships.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_mission_units_id'), 'mission_units', ['id'], unique=False)

    # === MISSION POSITIONS ===
    op.create_table('mission_positions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('unit_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('position_type', sa.String(length=50), nullable=True),
        sa.Column('is_required', sa.Boolean(), nullable=True, default=True),
        sa.Column('min_count', sa.Integer(), nullable=True, default=1),
        sa.Column('max_count', sa.Integer(), nullable=True, default=1),
        sa.Column('required_role_id', sa.Integer(), nullable=True),
        sa.Column('notes', sa.String(length=255), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=True, default=0),
        sa.ForeignKeyConstraint(['unit_id'], ['mission_units.id'], ),
        sa.ForeignKeyConstraint(['required_role_id'], ['operational_roles.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_mission_positions_id'), 'mission_positions', ['id'], unique=False)

    # === MISSION REGISTRATIONS ===
    op.create_table('mission_registrations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('mission_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('preferred_unit_id', sa.Integer(), nullable=True),
        sa.Column('preferred_position_id', sa.Integer(), nullable=True),
        sa.Column('availability_note', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, default='registered'),
        sa.Column('registered_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['mission_id'], ['missions.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['preferred_unit_id'], ['mission_units.id'], ),
        sa.ForeignKeyConstraint(['preferred_position_id'], ['mission_positions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_mission_registrations_id'), 'mission_registrations', ['id'], unique=False)

    # === MISSION ASSIGNMENTS ===
    op.create_table('mission_assignments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('position_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('placeholder_name', sa.String(length=100), nullable=True),
        sa.Column('is_backup', sa.Boolean(), nullable=True, default=False),
        sa.Column('is_training', sa.Boolean(), nullable=True, default=False),
        sa.Column('notes', sa.String(length=255), nullable=True),
        sa.Column('assigned_at', sa.DateTime(), nullable=True),
        sa.Column('assigned_by_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['position_id'], ['mission_positions.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['assigned_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_mission_assignments_id'), 'mission_assignments', ['id'], unique=False)

    # === MISSION TEMPLATES ===
    op.create_table('mission_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('template_data', sa.JSON(), nullable=False),
        sa.Column('is_system', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_mission_templates_id'), 'mission_templates', ['id'], unique=False)

    # === USER SHIPS ===
    op.create_table('user_ships',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('ship_name', sa.String(length=100), nullable=False),
        sa.Column('is_fitted', sa.Boolean(), nullable=True, default=False),
        sa.Column('loadout_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_ships_id'), 'user_ships', ['id'], unique=False)

    # === SEED SYSTEM TEMPLATES ===

    # Loot Run Template
    loot_run_template = {
        "units": [
            {
                "name": "GKS Idris",
                "unit_type": "gks",
                "ship_name": "Idris",
                "radio_frequencies": {"el": "102.11", "intern": "102.31", "targets": "102.91"},
                "positions": [
                    {"name": "Kommandant", "position_type": "commander", "is_required": True, "max_count": 1},
                    {"name": "Pilot", "position_type": "pilot", "is_required": True, "max_count": 1},
                    {"name": "Crew", "position_type": "crew", "is_required": True, "min_count": 2, "max_count": 6}
                ]
            },
            {
                "name": "Jägerwing I",
                "unit_type": "wing",
                "radio_frequencies": {"el": "102.11", "intern": "102.51", "targets": "102.91"},
                "positions": [
                    {"name": "Lead", "position_type": "lead", "is_required": True, "max_count": 1},
                    {"name": "Wing", "position_type": "wing", "is_required": True, "min_count": 1, "max_count": 3}
                ]
            },
            {
                "name": "BEAST I",
                "unit_type": "beast",
                "ship_name": "Hercules",
                "radio_frequencies": {"el": "102.70", "targets": "102.91"},
                "positions": [
                    {"name": "Lead", "position_type": "lead", "is_required": True, "max_count": 1},
                    {"name": "Support", "position_type": "crew", "is_required": False, "max_count": 2}
                ]
            }
        ],
        "phases": [
            {"phase_number": 1, "title": "Phase 1: Sammeln", "description": "Alle Einheiten sammeln sich am Treffpunkt."},
            {"phase_number": 2, "title": "Phase 2: Transit", "description": "Gemeinsamer Flug zum Einsatzgebiet."},
            {"phase_number": 3, "title": "Phase 3: Einsatz", "description": "Durchführung der Loot-Operation."},
            {"phase_number": 4, "title": "Phase 4: Rückzug", "description": "Rückkehr zur Basis."}
        ]
    }

    # PvP Operation Template
    pvp_template = {
        "units": [
            {
                "name": "GKS Polaris",
                "unit_type": "gks",
                "ship_name": "Polaris",
                "radio_frequencies": {"el": "102.11", "intern": "102.31", "targets": "102.91"},
                "positions": [
                    {"name": "Kommandant", "position_type": "commander", "is_required": True, "max_count": 1},
                    {"name": "Pilot", "position_type": "pilot", "is_required": True, "max_count": 1},
                    {"name": "Crew", "position_type": "crew", "is_required": True, "min_count": 2, "max_count": 4}
                ]
            },
            {
                "name": "Jägerwing I",
                "unit_type": "wing",
                "radio_frequencies": {"el": "102.11", "intern": "102.51", "targets": "102.91"},
                "positions": [
                    {"name": "Lead", "position_type": "lead", "is_required": True, "max_count": 1},
                    {"name": "Wing", "position_type": "wing", "is_required": True, "min_count": 2, "max_count": 3}
                ]
            },
            {
                "name": "Jägerwing II",
                "unit_type": "wing",
                "radio_frequencies": {"el": "102.12", "intern": "102.52", "targets": "102.92"},
                "positions": [
                    {"name": "Lead", "position_type": "lead", "is_required": True, "max_count": 1},
                    {"name": "Wing", "position_type": "wing", "is_required": True, "min_count": 2, "max_count": 3}
                ]
            },
            {
                "name": "DEALS Alpha",
                "unit_type": "deals",
                "radio_frequencies": {"el": "102.11", "intern": "102.61"},
                "positions": [
                    {"name": "Squadlead", "position_type": "lead", "is_required": True, "max_count": 1},
                    {"name": "Squad", "position_type": "crew", "is_required": True, "min_count": 2, "max_count": 4}
                ]
            }
        ],
        "phases": [
            {"phase_number": 1, "title": "Phase 1: Aufstellung", "description": "Alle Einheiten formieren sich."},
            {"phase_number": 2, "title": "Phase 2: Anflug", "description": "Koordinierter Anflug auf das Zielgebiet."},
            {"phase_number": 3, "title": "Phase 3: Engagement", "description": "Kampfhandlungen."},
            {"phase_number": 4, "title": "Phase 4: Rückzug", "description": "Geordneter Rückzug."}
        ]
    }

    import json
    op.execute(f"""
        INSERT INTO mission_templates (name, description, template_data, is_system, created_by_id) VALUES
        ('Loot Run', 'Farming-Operation mit GKS-Schutz, Jägerwing und BEAST-Unterstützung.', '{json.dumps(loot_run_template)}', 1, NULL),
        ('PvP Operation', 'Kampfeinsatz mit GKS, zwei Jägerwings und DEALS-Squad.', '{json.dumps(pvp_template)}', 1, NULL)
    """)


def downgrade() -> None:
    op.drop_index(op.f('ix_user_ships_id'), table_name='user_ships')
    op.drop_table('user_ships')
    op.drop_index(op.f('ix_mission_templates_id'), table_name='mission_templates')
    op.drop_table('mission_templates')
    op.drop_index(op.f('ix_mission_assignments_id'), table_name='mission_assignments')
    op.drop_table('mission_assignments')
    op.drop_index(op.f('ix_mission_registrations_id'), table_name='mission_registrations')
    op.drop_table('mission_registrations')
    op.drop_index(op.f('ix_mission_positions_id'), table_name='mission_positions')
    op.drop_table('mission_positions')
    op.drop_index(op.f('ix_mission_units_id'), table_name='mission_units')
    op.drop_table('mission_units')
    op.drop_index(op.f('ix_mission_phases_id'), table_name='mission_phases')
    op.drop_table('mission_phases')
    op.drop_index(op.f('ix_missions_id'), table_name='missions')
    op.drop_table('missions')

    # Drop enum type
    op.execute("DROP TYPE IF EXISTS missionstatus")
