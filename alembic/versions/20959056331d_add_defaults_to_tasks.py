"""add_defaults_to_tasks

Revision ID: 20959056331d
Revises: 69b314c43bb1
Create Date: 2026-06-30 08:41:21.349067

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20959056331d'
down_revision: Union[str, Sequence[str], None] = '69b314c43bb1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('tasks', 'status', server_default='open')
    op.alter_column('tasks', 'priority', server_default='0')
    op.alter_column('tasks', 'deleted', server_default=sa.text('false'))
    op.alter_column('tasks', 'row_version', server_default='0')


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('tasks', 'status', server_default=None)
    op.alter_column('tasks', 'priority', server_default=None)
    op.alter_column('tasks', 'deleted', server_default=None)
    op.alter_column('tasks', 'row_version', server_default=None)
