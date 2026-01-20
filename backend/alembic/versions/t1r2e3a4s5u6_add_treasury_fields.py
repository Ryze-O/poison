"""Add extended treasury transaction fields

Revision ID: t1r2e3a4s5u6
Revises: k1l2m3n4o5p6
Create Date: 2026-01-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 't1r2e3a4s5u6'
down_revision: Union[str, None] = 'k1l2m3n4o5p6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Prüfen welche Spalten bereits existieren
    conn = op.get_bind()
    result = conn.execute(sa.text("PRAGMA table_info(treasury_transactions)"))
    columns = [row[1] for row in result]

    # Neue Spalten hinzufügen falls nicht vorhanden
    if 'sc_version' not in columns:
        op.add_column('treasury_transactions', sa.Column('sc_version', sa.String(20), nullable=True))

    if 'item_reference' not in columns:
        op.add_column('treasury_transactions', sa.Column('item_reference', sa.String(100), nullable=True))

    if 'beneficiary' not in columns:
        op.add_column('treasury_transactions', sa.Column('beneficiary', sa.String(100), nullable=True))

    if 'verified_by' not in columns:
        op.add_column('treasury_transactions', sa.Column('verified_by', sa.String(100), nullable=True))

    if 'transaction_date' not in columns:
        op.add_column('treasury_transactions', sa.Column('transaction_date', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('treasury_transactions', 'transaction_date')
    op.drop_column('treasury_transactions', 'verified_by')
    op.drop_column('treasury_transactions', 'beneficiary')
    op.drop_column('treasury_transactions', 'item_reference')
    op.drop_column('treasury_transactions', 'sc_version')
