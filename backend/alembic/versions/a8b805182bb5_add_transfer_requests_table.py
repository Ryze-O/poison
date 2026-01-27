"""add transfer_requests table

Revision ID: a8b805182bb5
Revises: u1e2x3p4r5i6
Create Date: 2026-01-27 13:56:31.389659

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8b805182bb5'
down_revision: Union[str, Sequence[str], None] = 'u1e2x3p4r5i6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('transfer_requests',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('requester_id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('component_id', sa.Integer(), nullable=False),
    sa.Column('from_location_id', sa.Integer(), nullable=True),
    sa.Column('to_location_id', sa.Integer(), nullable=True),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'REJECTED', name='transferrequeststatus'), nullable=False),
    sa.Column('approved_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['approved_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['component_id'], ['components.id'], ),
    sa.ForeignKeyConstraint(['from_location_id'], ['locations.id'], ),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['to_location_id'], ['locations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_transfer_requests_id'), 'transfer_requests', ['id'], unique=False)
    op.create_index(op.f('ix_transfer_requests_owner_id'), 'transfer_requests', ['owner_id'], unique=False)
    op.create_index(op.f('ix_transfer_requests_requester_id'), 'transfer_requests', ['requester_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_transfer_requests_requester_id'), table_name='transfer_requests')
    op.drop_index(op.f('ix_transfer_requests_owner_id'), table_name='transfer_requests')
    op.drop_index(op.f('ix_transfer_requests_id'), table_name='transfer_requests')
    op.drop_table('transfer_requests')
