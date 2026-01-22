"""add officer_account_id to treasury_transactions

Revision ID: p2g3h4i5j6k7
Revises: o1f2f3i4c5e6
Create Date: 2025-01-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'p2g3h4i5j6k7'
down_revision: Union[str, None] = 'o1f2f3i4c5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # officer_account_id zu treasury_transactions hinzufügen
    # SQLite unterstützt keine Foreign Key Constraints via ALTER, daher nur Column
    op.add_column('treasury_transactions', sa.Column('officer_account_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('treasury_transactions', 'officer_account_id')
