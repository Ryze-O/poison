"""remove schatzmeister function role

Revision ID: k8l775172ll5
Revises: j7k664061kk4
Create Date: 2026-02-03

Schatzmeister ist jetzt eine User-Rolle (treasurer), nicht mehr eine Funktionsrolle.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'k8l775172ll5'
down_revision: Union[str, None] = 'j7k664061kk4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Erst alle Zuweisungen zur Schatzmeister-Rolle löschen
    op.execute("""
        DELETE FROM user_function_roles
        WHERE function_role_id IN (
            SELECT id FROM function_roles WHERE name = 'Schatzmeister'
        )
    """)

    # Dann die Rolle selbst löschen
    op.execute("""
        DELETE FROM function_roles WHERE name = 'Schatzmeister'
    """)


def downgrade() -> None:
    # Schatzmeister-Rolle wieder hinzufügen
    op.execute("""
        INSERT INTO function_roles (name, description, is_leadership, sort_order)
        VALUES ('Schatzmeister', 'Verwaltung der Staffelkasse', 0, 10)
    """)
