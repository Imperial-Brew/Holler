"""drop_users_row_version_server_default

Revision ID: ac84e2503302
Revises: 75619172aa2c
Create Date: 2026-06-25 20:04:09.664781

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ac84e2503302'
down_revision: Union[str, Sequence[str], None] = '75619172aa2c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('users', 'row_version', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('users', 'row_version',
                    server_default=sa.text("nextval('row_version_seq')"))
