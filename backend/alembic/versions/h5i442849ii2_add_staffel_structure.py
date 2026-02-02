"""add staffel structure tables

Revision ID: h5i442849ii2
Revises: g4h331738hh1
Create Date: 2026-02-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h5i442849ii2'
down_revision: Union[str, None] = 'g4h331738hh1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Kommandogruppen
    op.create_table('command_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=10), nullable=False),
        sa.Column('full_name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=True, default=0),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_command_groups_id'), 'command_groups', ['id'], unique=False)

    # Einsatzrollen (pro KG)
    op.create_table('operational_roles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('command_group_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=True, default=0),
        sa.ForeignKeyConstraint(['command_group_id'], ['command_groups.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_operational_roles_id'), 'operational_roles', ['id'], unique=False)

    # Funktionsrollen (übergreifend)
    op.create_table('function_roles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_leadership', sa.Boolean(), nullable=True, default=False),
        sa.Column('sort_order', sa.Integer(), nullable=True, default=0),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_function_roles_id'), 'function_roles', ['id'], unique=False)

    # User → KG Zuordnung
    op.create_table('user_command_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('command_group_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('ACTIVE', 'RECRUIT', 'INACTIVE', 'ABSENT', name='memberstatus'), nullable=True),
        sa.Column('joined_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['command_group_id'], ['command_groups.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_command_groups_id'), 'user_command_groups', ['id'], unique=False)

    # User → Einsatzrolle Zuordnung
    op.create_table('user_operational_roles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('operational_role_id', sa.Integer(), nullable=False),
        sa.Column('is_training', sa.Boolean(), nullable=True, default=False),
        sa.Column('assigned_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['operational_role_id'], ['operational_roles.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_operational_roles_id'), 'user_operational_roles', ['id'], unique=False)

    # User → Funktionsrolle Zuordnung
    op.create_table('user_function_roles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('function_role_id', sa.Integer(), nullable=False),
        sa.Column('assigned_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['function_role_id'], ['function_roles.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_function_roles_id'), 'user_function_roles', ['id'], unique=False)

    # Schiffe pro KG
    op.create_table('command_group_ships',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('command_group_id', sa.Integer(), nullable=False),
        sa.Column('ship_name', sa.String(length=100), nullable=False),
        sa.Column('ship_image', sa.String(length=255), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=True, default=0),
        sa.ForeignKeyConstraint(['command_group_id'], ['command_groups.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_command_group_ships_id'), 'command_group_ships', ['id'], unique=False)

    # === SEED DATA ===

    # Kommandogruppen
    op.execute("""
        INSERT INTO command_groups (id, name, full_name, description, sort_order) VALUES
        (1, 'CW', 'Capital Warfare', 'Die Kommandogruppe Capital Warfare ist das Herz der Flotte. Ob Zerstörungs- oder Trägerschwerpunkt, zahlreiche Besatzungsmitglieder finden an Bord ein fliegendes Zuhause. Vom Turmschützen bis zum Kommandanten – jeder ist Teil des zentralen Ankers jedes Kampfgeschehens: dem Viper Großkampfschiff.', 1),
        (2, 'SW', 'Special Warfare', 'Die Kommandogruppe Special Warfare besteht aus den Fäusten der Jägerpiloten sowie den Köpfen der Spezialisten. Dazu zählen Jäger aller Größenklassen, genaue Aufklärungskommunikation, spezialisierte Bewaffnungen, präzise Bomber, sowie Torpedoboote, elektronische Kriegsführung, unaufhaltsame Zielausschaltung oder FPS-Bewegungen.', 2),
        (3, 'P', 'Pioneer', 'Die Pioneers sind das Fundament, auf dem wir festen Fußes stehen. Sie stellt die Unterstützung, Versorgung und den Transport aller Truppen und Geräte vor, sowie Engineering während dem Einsatz sicher. Darüber hinaus liegt die Beschaffung von Ausrüstung und durch Einsatz Crafting und Extraktion in ihrer Verantwortung.', 3)
    """)

    # Einsatzrollen CW
    op.execute("""
        INSERT INTO operational_roles (command_group_id, name, description, sort_order) VALUES
        (1, 'GKS-Besatzung', 'Besetzt Geschütze, repariert Schäden, löscht Brände, Anti-Boarding', 1),
        (1, 'Waffenmeister', 'Einsatz der Spezialwaffensysteme wie Großgeschütze und Torpedos', 2),
        (1, 'Feuerleiter', 'Koordiniert alle Geschütze im Einsatz auf herannahende Ziele', 3),
        (1, 'Schiffsmeister', 'Experte und Ansprechpartner rund um das GKS und seine Stationen', 4),
        (1, 'GKS-Pilot', 'Fliegt das GKS und bringt Geschütze in ihren Wirkungsgrad', 5),
        (1, 'Boardingmeister', 'Übernimmt im (Anti)-Boarding-Szenario das FPS-Kommando', 6),
        (1, '1. Offizier', 'Verlängerter Arm des Kommandanten und Verbindungsoffizier', 7),
        (1, 'GKS-Kommandant', 'Verantwortlich für GKS, Besatzung und Einsatzkommunikation', 8)
    """)

    # Einsatzrollen SW
    op.execute("""
        INSERT INTO operational_roles (command_group_id, name, description, sort_order) VALUES
        (2, 'Dogfighter', 'Light-, Medium- und Heavy Fighter im klassischen Close-Combat', 1),
        (2, 'Aufklärer', 'Aufklären und Aufdeckung von Feinden sowie Stealth-Ausschaltung', 2),
        (2, 'Interceptor', 'Abfangen und Verfolgen per Jäger mit Interceptor-Tuning', 3),
        (2, 'E.W.A.', 'Electronic Warfare Aircrafts: Interdiction/Distortion/EMP/Hacking', 4),
        (2, 'Anti-GKS', 'Anti-Großkampfschiff-Jäger mit spezialisierten Loadouts', 5),
        (2, 'Gunships', 'Einsatz spezialisierter Anti-Jäger-/GKS-Gunships mit Gunnern', 6),
        (2, 'Torpedo-/Bomber', 'Torpedo- und Bombeneinsätze gegen GKS und Bodenziele', 7),
        (2, 'D.E.A.L.S.', 'Defense on EVA, Air, Land and in Space: FPS-Einheiten', 8)
    """)

    # Einsatzrollen Pioneer
    op.execute("""
        INSERT INTO operational_roles (command_group_id, name, description, sort_order) VALUES
        (3, 'Logistik', 'Abbau, Einkauf, Distribution und Crafting von Material und Gerät', 1),
        (3, 'Engineer', 'Verantwortlich für die Überwachung und Instandhaltung des Schiffs', 2),
        (3, 'Medic & Supply', 'FPS-Kampfsanitäter und Versorger, stellt und betreibt Respawn', 3),
        (3, 'Mechaniker', 'Refuel, Repair und Restock im Hangar, auf Trägern und in Basen', 4),
        (3, 'Hangarmeister', 'Verantwortlich für Starts und Landungen auf Trägerschiffen', 5),
        (3, 'Dropship', 'Transport und Landung von Personal, Material und Gerät', 6),
        (3, 'B.E.A.S.T.', 'Battle Enforcement Armored Support Team: Anti-Air-Vehicles', 7),
        (3, 'Basebuilder', 'Bauumsetzung der von Staffelleitern beauftragten Basisstrukturen', 8)
    """)

    # Funktionsrollen (Leadership)
    op.execute("""
        INSERT INTO function_roles (name, description, is_leadership, sort_order) VALUES
        ('Staffelleiter', 'Gesamtleitung der Staffel Viper', 1, 1),
        ('Stellvertreter', 'Stellvertretender Staffelleiter', 1, 2),
        ('Vereinslegende', 'Ehrentitel für besondere Verdienste', 1, 3)
    """)

    # Funktionsrollen (Allgemein)
    op.execute("""
        INSERT INTO function_roles (name, description, is_leadership, sort_order) VALUES
        ('KG-Verwalter', 'Kann Kommandogruppen-Mitglieder und Rollen verwalten', 0, 5),
        ('Schatzmeister', 'Verwaltung der Staffelkasse', 0, 10),
        ('Forschung', 'Erforschung von Spielmechaniken und Meta', 0, 11),
        ('Einsatzleiter', 'Leitung von Staffelabenden und Operationen', 0, 12),
        ('Logistikmeister', 'Koordination der Logistik und Versorgung', 0, 13),
        ('Flottenkommandant', 'Führung der Flotte im Großeinsatz', 0, 14),
        ('Winglead (Jäger)', 'Führung einer Jägerstaffel', 0, 15),
        ('Squadlead (FPS)', 'Führung eines FPS-Trupps', 0, 16)
    """)

    # Schiffe CW
    op.execute("""
        INSERT INTO command_group_ships (command_group_id, ship_name, sort_order) VALUES
        (1, 'Nautilus', 1),
        (1, 'Polaris', 2),
        (1, 'Hammerhead', 3),
        (1, 'Javelin', 4),
        (1, 'Idris', 5),
        (1, 'Perseus', 6)
    """)

    # Schiffe SW
    op.execute("""
        INSERT INTO command_group_ships (command_group_id, ship_name, sort_order) VALUES
        (2, 'Arrow', 1),
        (2, 'Scorpius', 2),
        (2, 'Gladius', 3),
        (2, 'Sabre', 4),
        (2, 'F7-F8', 5),
        (2, 'Ares', 6),
        (2, 'Avenger', 7),
        (2, 'Wulf', 8),
        (2, 'Retaliator', 9),
        (2, 'Mantis', 10),
        (2, 'Eclipse', 11),
        (2, 'Paladin', 12),
        (2, 'Redeemer', 13)
    """)

    # Schiffe Pioneer
    op.execute("""
        INSERT INTO command_group_ships (command_group_id, ship_name, sort_order) VALUES
        (3, 'Pisces', 1),
        (3, 'Vulcan', 2),
        (3, 'Valkyrie', 3),
        (3, 'Apollo', 4),
        (3, 'Galaxy', 5),
        (3, 'Starfarer', 6),
        (3, 'Reclaimer', 7),
        (3, 'Pioneer', 8),
        (3, 'Kraken', 9),
        (3, 'Hercules', 10),
        (3, 'Liberator', 11),
        (3, 'Ironclad', 12)
    """)


def downgrade() -> None:
    op.drop_index(op.f('ix_command_group_ships_id'), table_name='command_group_ships')
    op.drop_table('command_group_ships')
    op.drop_index(op.f('ix_user_function_roles_id'), table_name='user_function_roles')
    op.drop_table('user_function_roles')
    op.drop_index(op.f('ix_user_operational_roles_id'), table_name='user_operational_roles')
    op.drop_table('user_operational_roles')
    op.drop_index(op.f('ix_user_command_groups_id'), table_name='user_command_groups')
    op.drop_table('user_command_groups')
    op.drop_index(op.f('ix_function_roles_id'), table_name='function_roles')
    op.drop_table('function_roles')
    op.drop_index(op.f('ix_operational_roles_id'), table_name='operational_roles')
    op.drop_table('operational_roles')
    op.drop_index(op.f('ix_command_groups_id'), table_name='command_groups')
    op.drop_table('command_groups')

    # Drop enum type
    op.execute("DROP TYPE IF EXISTS memberstatus")
