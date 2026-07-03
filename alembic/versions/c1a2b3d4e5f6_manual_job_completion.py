"""manual job completion

Job completion becomes a deliberate action instead of a side-effect of
finishing the last task. The holler_job_completion trigger no longer
auto-marks a job done; it only *reopens* a completed job when unfinished or
newly-added work appears. It now also fires on INSERT, so adding a task to a
done job reopens it. Actually marking a job done is done by
POST /jobs/{id}/complete/ (see routes/jobs.py), which also applies tool
effects — the responsibility that used to live in this trigger.

Revision ID: c1a2b3d4e5f6
Revises: 20959056331d
Create Date: 2026-07-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '20959056331d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Reopen-only: never auto-complete. A job is "unfinished" while any of its
    # non-milestone tasks is still open/in_progress (done and cancelled both
    # count as resolved). Completion is set manually by the API.
    op.execute("""
    CREATE OR REPLACE FUNCTION holler_job_completion() RETURNS trigger AS $$
    DECLARE
      j uuid := NEW.job_id;
      unresolved int; ms uuid;
    BEGIN
      IF j IS NULL OR NEW.is_milestone THEN
        RETURN NEW;
      END IF;

      SELECT count(*) FILTER (WHERE status IN ('open','in_progress'))
        INTO unresolved
        FROM tasks
        WHERE job_id = j AND is_milestone = false AND deleted_at IS NULL;

      SELECT id INTO ms FROM tasks
        WHERE job_id = j AND is_milestone AND deleted_at IS NULL;

      -- Only ever reopen a job that was completed but now has open work.
      IF unresolved > 0 THEN
        UPDATE tasks SET status = 'in_progress' WHERE id = ms AND status = 'done';
        UPDATE jobs  SET status = 'in_progress' WHERE id = j  AND status = 'done';
      END IF;

      RETURN NEW;
    END $$ LANGUAGE plpgsql;
    """)

    # Fire on INSERT too, so adding a task to a done job reopens it.
    op.execute("DROP TRIGGER IF EXISTS trg_job_completion ON tasks;")
    op.execute("""
    CREATE TRIGGER trg_job_completion
      AFTER INSERT OR UPDATE OF status ON tasks
      FOR EACH ROW EXECUTE FUNCTION holler_job_completion();
    """)


def downgrade() -> None:
    # Restore the original auto-completing trigger + function.
    op.execute("""
    CREATE OR REPLACE FUNCTION holler_job_completion() RETURNS trigger AS $$
    DECLARE
      j uuid := NEW.job_id;
      total int; done int; ms uuid;
    BEGIN
      IF j IS NULL OR NEW.is_milestone THEN
        RETURN NEW;
      END IF;

      SELECT count(*), count(*) FILTER (WHERE status = 'done')
        INTO total, done
        FROM tasks
        WHERE job_id = j AND is_milestone = false AND deleted_at IS NULL;

      SELECT id INTO ms FROM tasks
        WHERE job_id = j AND is_milestone AND deleted_at IS NULL;

      IF total > 0 AND done = total THEN
        UPDATE tasks SET status = 'done' WHERE id = ms AND status <> 'done';
        UPDATE jobs  SET status = 'done' WHERE id = j  AND status <> 'done';
        UPDATE tools t SET status = e.on_complete_status
          FROM job_tool_effects e
          WHERE e.job_id = j AND e.deleted_at IS NULL AND t.id = e.tool_id;
      ELSIF total > 0 THEN
        UPDATE tasks SET status = 'open'        WHERE id = ms AND status = 'done';
        UPDATE jobs  SET status = 'in_progress' WHERE id = j  AND status = 'done';
      END IF;

      RETURN NEW;
    END $$ LANGUAGE plpgsql;
    """)

    op.execute("DROP TRIGGER IF EXISTS trg_job_completion ON tasks;")
    op.execute("""
    CREATE TRIGGER trg_job_completion
      AFTER UPDATE OF status ON tasks
      FOR EACH ROW EXECUTE FUNCTION holler_job_completion();
    """)
