"""add received_by_account to treasury

Revision ID: b1c222405pp9
Revises: a0b111394oo8
Create Date: 2026-02-05

Bei Einnahmen: auf welches Kassenwart-Konto geht das Geld.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1c222405pp9'
down_revision = 'a0b111394oo8'
branch_labels = None
depends_on = None


def upgrade():
    # Bei Einnahmen: auf welches Kassenwart-Konto geht das Geld
    # SQLite: Einfach Spalte hinzufügen ohne Foreign Key Constraint
    op.add_column('treasury_transactions', sa.Column('received_by_account_id', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('treasury_transactions', 'received_by_account_id')
