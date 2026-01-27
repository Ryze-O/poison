"""add awaiting_receipt status and confirmed_by

Revision ID: b9c806283cc6
Revises: a8b805182bb5
Create Date: 2026-01-27 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9c806283cc6'
down_revision: Union[str, Sequence[str], None] = 'a8b805182bb5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SQLite unterstützt kein ALTER TYPE, daher müssen wir die Tabelle neu erstellen
    # Für SQLite: Enum-Werte werden als String gespeichert, daher kein Schema-Update nötig
    # Die neuen Werte 'awaiting_receipt' und 'completed' werden automatisch unterstützt

    # Prüfen ob Spalte bereits existiert (falls vorherige Migration teilweise lief)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('transfer_requests')]

    if 'confirmed_by_id' not in columns:
        # Neue Spalte für confirmed_by_id hinzufügen (ohne Foreign Key für SQLite)
        op.add_column('transfer_requests', sa.Column('confirmed_by_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('transfer_requests', 'confirmed_by_id')
