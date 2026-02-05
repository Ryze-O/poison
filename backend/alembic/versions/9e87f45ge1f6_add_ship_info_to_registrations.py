"""add ship_info to mission_registrations

Revision ID: 9e87f45ge1f6
Revises: 8d76e34fd0e5
Create Date: 2026-02-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9e87f45ge1f6'
down_revision: Union[str, None] = '8d76e34fd0e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add ship_info field to mission_registrations table
    op.add_column('mission_registrations', sa.Column('ship_info', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('mission_registrations', 'ship_info')
