"""account personalization

Revision ID: 859ab79a18f4
Revises: 6cf731084972
"""

import sqlalchemy as sa
from alembic import op

revision = "859ab79a18f4"
down_revision = "6cf731084972"
branch_labels = None
depends_on = None


def upgrade():
    # Server defaults backfill existing accounts and retain old-writer compatibility.
    op.add_column(
        "users", sa.Column("avatar", sa.String(16), nullable=False, server_default="initials")
    )
    op.add_column(
        "users", sa.Column("avatar_color", sa.String(16), nullable=False, server_default="slate")
    )
    op.add_column(
        "users", sa.Column("custom_status", sa.String(120), nullable=False, server_default="")
    )


def downgrade():
    op.drop_column("users", "custom_status")
    op.drop_column("users", "avatar_color")
    op.drop_column("users", "avatar")
