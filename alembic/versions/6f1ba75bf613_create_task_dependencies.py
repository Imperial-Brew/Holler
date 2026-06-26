"""create task_dependencies

Revision ID: 6f1ba75bf613
Revises: b31d0d582548
Create Date: 2026-06-26 11:20:32.662089

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6f1ba75bf613'
down_revision: Union[str, Sequence[str], None] = 'b31d0d582548'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('task_dependencies',
    sa.Column('task_id', sa.UUID(), nullable=False),
    sa.Column('depends_on_id', sa.UUID(), nullable=False),
    sa.CheckConstraint('task_id <> depends_on_id', name='ck_no_self_dependency'),
    sa.ForeignKeyConstraint(['depends_on_id'], ['tasks.id'], ),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ),
    sa.PrimaryKeyConstraint('task_id', 'depends_on_id')
    )

    # Parent-bump trigger: edge changes bump the owning task's row_version
    op.execute("""
        CREATE OR REPLACE FUNCTION bump_task_on_dependency_change() RETURNS trigger AS $$
        BEGIN
            UPDATE tasks SET updated_at = now()
             WHERE id = COALESCE(NEW.task_id, OLD.task_id);
            RETURN NULL;  -- AFTER trigger: return value is ignored
        END; $$ LANGUAGE plpgsql
    """)
    # Fires on INSERT/DELETE only — edges are immutable (composite PK; added or removed, never updated).
    op.execute("""
        CREATE TRIGGER trg_task_dep_bump
        AFTER INSERT OR DELETE ON task_dependencies
        FOR EACH ROW EXECUTE FUNCTION bump_task_on_dependency_change()
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP TRIGGER IF EXISTS trg_task_dep_bump ON task_dependencies")
    op.execute("DROP FUNCTION IF EXISTS bump_task_on_dependency_change()")
    op.drop_table('task_dependencies')
