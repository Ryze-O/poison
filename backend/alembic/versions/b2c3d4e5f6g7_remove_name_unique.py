"""remove name unique constraint from components

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-01-17 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6g7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Remove unique constraint on components.name by recreating the table."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)

    # Für SQLite müssen wir die Tabelle neu erstellen
    # 1. Backup-Tabelle erstellen
    # 2. Daten kopieren
    # 3. Alte Tabelle löschen
    # 4. Neue Tabelle ohne unique erstellen
    # 5. Daten zurück kopieren

    # Prüfen ob components Tabelle existiert
    if 'components' not in inspector.get_table_names():
        return

    # SQLite-spezifischer Workaround: Tabelle komplett neu erstellen
    op.execute('DROP TABLE IF EXISTS components_backup')

    op.execute('''
        CREATE TABLE components_backup AS
        SELECT id, name, category, sub_category, is_predefined, sc_uuid,
               manufacturer, size, grade, sc_type, sc_version, created_at, updated_at
        FROM components
    ''')

    op.drop_table('components')

    # Neue Tabelle OHNE unique auf name
    op.create_table(
        'components',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False, index=True),  # Kein unique!
        sa.Column('category', sa.String(50), nullable=True, index=True),
        sa.Column('sub_category', sa.String(50), nullable=True),
        sa.Column('is_predefined', sa.Boolean(), default=False),
        sa.Column('sc_uuid', sa.String(50), nullable=True, unique=True, index=True),
        sa.Column('manufacturer', sa.String(100), nullable=True),
        sa.Column('size', sa.Integer(), nullable=True),
        sa.Column('grade', sa.String(10), nullable=True),
        sa.Column('sc_type', sa.String(100), nullable=True),
        sa.Column('sc_version', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Daten zurück kopieren
    op.execute('''
        INSERT INTO components (id, name, category, sub_category, is_predefined, sc_uuid,
                               manufacturer, size, grade, sc_type, sc_version, created_at, updated_at)
        SELECT id, name, category, sub_category, is_predefined, sc_uuid,
               manufacturer, size, grade, sc_type, sc_version, created_at, updated_at
        FROM components_backup
    ''')

    op.execute('DROP TABLE components_backup')


def downgrade() -> None:
    """Restore unique constraint - not recommended."""
    pass
