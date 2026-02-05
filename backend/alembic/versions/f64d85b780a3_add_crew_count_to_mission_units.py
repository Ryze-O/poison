"""add_crew_count_to_mission_units

Revision ID: f64d85b780a3
Revises: m0n997394nn7
Create Date: 2026-02-05 11:02:55.172056

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f64d85b780a3'
down_revision: Union[str, Sequence[str], None] = 'm0n997394nn7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('mission_units', sa.Column('crew_count', sa.Integer(), nullable=True, server_default='1'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('mission_units', 'crew_count')
