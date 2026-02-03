"""add kg leiter roles

Revision ID: j7k664061kk4
Revises: i6j553950jj3
Create Date: 2026-02-03

Adds KG-Leiter and Stellv. KG-Leiter operational roles for each command group.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'j7k664061kk4'
down_revision: Union[str, None] = 'i6j553950jj3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # KG-Leiter und Stellv. KG-Leiter für jede Kommandogruppe
    # sort_order 0 = ganz oben in der Liste
    op.execute("""
        INSERT INTO operational_roles (command_group_id, name, description, sort_order) VALUES
        (1, 'KG-Leiter', 'Leiter der Kommandogruppe Capital Warfare', 0),
        (1, 'Stellv. KG-Leiter', 'Stellvertretender Leiter der KG Capital Warfare', 0),
        (2, 'KG-Leiter', 'Leiter der Kommandogruppe Special Warfare', 0),
        (2, 'Stellv. KG-Leiter', 'Stellvertretender Leiter der KG Special Warfare', 0),
        (3, 'KG-Leiter', 'Leiter der Kommandogruppe Pioneer', 0),
        (3, 'Stellv. KG-Leiter', 'Stellvertretender Leiter der KG Pioneer', 0)
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM operational_roles
        WHERE name IN ('KG-Leiter', 'Stellv. KG-Leiter')
    """)
