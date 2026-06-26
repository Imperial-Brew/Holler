"""create_users_table

Revision ID: 75619172aa2c
Revises: 
Create Date: 2026-06-25 19:04:28.064181

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '75619172aa2c'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Global monotonic sequence for sync cursors (§6 of build plan)
    op.execute('CREATE SEQUENCE IF NOT EXISTS row_version_seq')

    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('email', sa.String(), nullable=True),
    sa.Column('role', sa.String(), nullable=False),
    sa.Column('row_version', sa.BigInteger(), server_default=sa.text("nextval('row_version_seq')"), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email')
    )

    # Trigger: bump row_version on every insert or update
    op.execute("""
        CREATE OR REPLACE FUNCTION set_row_version() RETURNS trigger AS $$
        BEGIN
            NEW.row_version := nextval('row_version_seq');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_users_row_version
        BEFORE INSERT OR UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION set_row_version();
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute('DROP TRIGGER IF EXISTS trg_users_row_version ON users')
    op.drop_table('users')
    op.execute('DROP FUNCTION IF EXISTS set_row_version()')
    op.execute('DROP SEQUENCE IF EXISTS row_version_seq')
