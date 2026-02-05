"""remove treasurer role

Revision ID: a0b111394oo8
Revises: 9e87f45ge1f6
Create Date: 2026-02-05

Die UserRole.TREASURER wird entfernt. Stattdessen wird das is_treasurer Flag verwendet.
Bestehende User mit role='treasurer' werden zu role='officer' konvertiert.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'a0b111394oo8'
down_revision = '9e87f45ge1f6'
branch_labels = None
depends_on = None


def upgrade():
    # Konvertiere alle User mit role='treasurer' zu role='officer'
    # Das is_treasurer Flag sollte bereits durch die frühere Migration gesetzt sein
    op.execute("UPDATE users SET role = 'officer' WHERE role = 'treasurer'")

    # Konvertiere alle GuestTokens mit role='treasurer' zu role='officer'
    op.execute("UPDATE guest_tokens SET role = 'officer' WHERE role = 'treasurer'")


def downgrade():
    # Konvertiere User mit is_treasurer=True zurück zu role='treasurer'
    op.execute("UPDATE users SET role = 'treasurer' WHERE is_treasurer = 1")

    # GuestTokens können nicht automatisch zurückgesetzt werden (kein is_treasurer Flag)
    pass
