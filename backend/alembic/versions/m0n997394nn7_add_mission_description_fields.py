"""add structured mission description fields

Revision ID: m0n997394nn7
Revises: l9m886283mm6
Create Date: 2026-02-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'm0n997394nn7'
down_revision: Union[str, None] = 'l9m886283mm6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add 4 new structured description fields to missions table
    op.add_column('missions', sa.Column('mission_context', sa.Text(), nullable=True))
    op.add_column('missions', sa.Column('mission_objective', sa.Text(), nullable=True))
    op.add_column('missions', sa.Column('preparation_notes', sa.Text(), nullable=True))
    op.add_column('missions', sa.Column('special_notes', sa.Text(), nullable=True))

    # Migrate existing description to mission_context if present
    # This is done via raw SQL to handle existing data
    op.execute("""
        UPDATE missions
        SET mission_context = description
        WHERE description IS NOT NULL AND description != ''
    """)


def downgrade() -> None:
    # Remove the 4 structured description fields
    op.drop_column('missions', 'special_notes')
    op.drop_column('missions', 'preparation_notes')
    op.drop_column('missions', 'mission_objective')
    op.drop_column('missions', 'mission_context')
