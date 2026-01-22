"""add officer accounts

Revision ID: o1f2f3i4c5e6
Revises: t1r2e3a4s5u6
Create Date: 2026-01-22 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'o1f2f3i4c5e6'
down_revision = 't1r2e3a4s5u6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Officer Accounts - individuelle Kontostände
    op.create_table('officer_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('balance', sa.Float(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_officer_accounts_id'), 'officer_accounts', ['id'], unique=False)

    # Officer Transactions - Transaktionen auf Offizier-Konten
    op.create_table('officer_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('officer_account_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('treasury_transaction_id', sa.Integer(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['officer_account_id'], ['officer_accounts.id'], ),
        sa.ForeignKeyConstraint(['treasury_transaction_id'], ['treasury_transactions.id'], ),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_officer_transactions_id'), 'officer_transactions', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_officer_transactions_id'), table_name='officer_transactions')
    op.drop_table('officer_transactions')
    op.drop_index(op.f('ix_officer_accounts_id'), table_name='officer_accounts')
    op.drop_table('officer_accounts')
