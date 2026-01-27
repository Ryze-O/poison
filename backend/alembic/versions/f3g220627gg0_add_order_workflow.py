"""add order number and delivery workflow

Revision ID: f3g220627gg0
Revises: e2f119516ff9
Create Date: 2026-01-27 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3g220627gg0'
down_revision: Union[str, Sequence[str], None] = 'e2f119516ff9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add order_number and delivered_by_id fields to transfer_requests table."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)

    # Check existing columns
    existing_columns = [c['name'] for c in inspector.get_columns('transfer_requests')]

    # Bestellnummer für Discord-Koordination
    if 'order_number' not in existing_columns:
        op.add_column('transfer_requests', sa.Column('order_number', sa.String(20), nullable=True))
        op.create_index('ix_transfer_requests_order_number', 'transfer_requests', ['order_number'], unique=True)

    # Wer hat als ausgeliefert markiert
    if 'delivered_by_id' not in existing_columns:
        op.add_column('transfer_requests', sa.Column('delivered_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))

    # Generate order numbers for existing requests
    # Format: TR-YYYY-NNNN (e.g., TR-2026-0001)
    connection = op.get_bind()
    result = connection.execute(sa.text("SELECT id FROM transfer_requests WHERE order_number IS NULL ORDER BY id"))
    rows = result.fetchall()

    for i, row in enumerate(rows, start=1):
        order_num = f"TR-2026-{i:04d}"
        connection.execute(
            sa.text("UPDATE transfer_requests SET order_number = :order_num WHERE id = :id"),
            {"order_num": order_num, "id": row[0]}
        )


def downgrade() -> None:
    """Remove order_number and delivered_by_id fields from transfer_requests table."""
    try:
        op.drop_index('ix_transfer_requests_order_number', table_name='transfer_requests')
    except Exception:
        pass
    op.drop_column('transfer_requests', 'delivered_by_id')
    op.drop_column('transfer_requests', 'order_number')
