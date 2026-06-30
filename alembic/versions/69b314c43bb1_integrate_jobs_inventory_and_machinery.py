"""integrate_jobs_inventory_and_machinery

Revision ID: 69b314c43bb1
Revises: 1d4f912790d7
Create Date: 2026-06-30 08:27:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '69b314c43bb1'
down_revision: Union[str, Sequence[str], None] = '1d4f912790d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Create jobs table
    op.execute("""
    CREATE TABLE jobs (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title       text NOT NULL,
      status      text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','hold','done')),
      location_id uuid REFERENCES locations(id),
      priority    int,
      due_date    date,
      row_version bigint NOT NULL DEFAULT 0,
      created_by  uuid REFERENCES users(id),
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted     boolean NOT NULL DEFAULT false,
      deleted_at  timestamptz
    );
    """)

    # 2. Alter tasks
    op.add_column('tasks', sa.Column('job_id', sa.UUID(), sa.ForeignKey('jobs.id'), nullable=True))
    op.add_column('tasks', sa.Column('is_milestone', sa.Boolean(), server_default='false', nullable=False))
    op.execute("CREATE UNIQUE INDEX uq_one_milestone_per_job ON tasks(job_id) WHERE is_milestone AND deleted_at IS NULL;")
    op.execute("CREATE INDEX idx_tasks_job_id ON tasks(job_id);")

    # 3. Create tools, materials, transactions
    op.execute("""
    CREATE TABLE tools (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name        text NOT NULL,
      status      text NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','in_use','broken','maintenance','retired')),
      location_id uuid REFERENCES locations(id),
      row_version bigint NOT NULL DEFAULT 0,
      created_by  uuid REFERENCES users(id),
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted     boolean NOT NULL DEFAULT false,
      deleted_at  timestamptz
    );
    """)
    op.execute("""
    CREATE TABLE materials (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name          text NOT NULL,
      unit          text NOT NULL,
      reorder_point numeric,
      row_version   bigint NOT NULL DEFAULT 0,
      created_by    uuid REFERENCES users(id),
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      deleted       boolean NOT NULL DEFAULT false,
      deleted_at    timestamptz
    );
    """)
    op.execute("""
    CREATE TABLE material_transactions (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      material_id uuid NOT NULL REFERENCES materials(id),
      delta       numeric NOT NULL,
      reason      text NOT NULL
                  CHECK (reason IN ('received','consumed','adjustment','count')),
      task_id     uuid REFERENCES tasks(id),
      occurred_at timestamptz NOT NULL DEFAULT now(),
      row_version bigint NOT NULL DEFAULT 0,
      created_by  uuid REFERENCES users(id),
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 4. Junctions
    op.execute("""
    CREATE TABLE task_tools (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id     uuid NOT NULL REFERENCES tasks(id),
      tool_id     uuid NOT NULL REFERENCES tools(id),
      row_version bigint NOT NULL DEFAULT 0,
      created_by  uuid REFERENCES users(id),
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted     boolean NOT NULL DEFAULT false,
      deleted_at  timestamptz
    );
    """)
    op.execute("CREATE UNIQUE INDEX uq_task_tool ON task_tools(task_id, tool_id) WHERE deleted_at IS NULL;")

    op.execute("""
    CREATE TABLE task_materials (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id      uuid NOT NULL REFERENCES tasks(id),
      material_id  uuid NOT NULL REFERENCES materials(id),
      qty_required numeric NOT NULL CHECK (qty_required > 0),
      row_version  bigint NOT NULL DEFAULT 0,
      created_by   uuid REFERENCES users(id),
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      deleted      boolean NOT NULL DEFAULT false,
      deleted_at   timestamptz
    );
    """)
    op.execute("CREATE UNIQUE INDEX uq_task_material ON task_materials(task_id, material_id) WHERE deleted_at IS NULL;")

    op.execute("""
    CREATE TABLE job_tool_effects (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id             uuid NOT NULL REFERENCES jobs(id),
      tool_id            uuid NOT NULL REFERENCES tools(id),
      on_complete_status text NOT NULL DEFAULT 'available'
                         CHECK (on_complete_status IN ('available','maintenance','retired')),
      row_version        bigint NOT NULL DEFAULT 0,
      created_by         uuid REFERENCES users(id),
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now(),
      deleted            boolean NOT NULL DEFAULT false,
      deleted_at         timestamptz
    );
    """)

    # 5. Row version triggers (using existing set_row_version)
    for table in ['jobs', 'tools', 'materials', 'material_transactions', 'task_tools', 'task_materials', 'job_tool_effects']:
        op.execute(f"CREATE TRIGGER trg_rv_{table} BEFORE INSERT OR UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION set_row_version();")

    # 6. Automation Triggers
    op.execute("""
    CREATE OR REPLACE FUNCTION holler_job_create_milestone() RETURNS trigger AS $$
    BEGIN
      INSERT INTO tasks (id, title, status, job_id, is_milestone, priority, created_by)
      VALUES (gen_random_uuid(), NEW.title || ' — complete', 'open', NEW.id, true, 0, NEW.created_by);
      RETURN NEW;
    END $$ LANGUAGE plpgsql;
    """)
    op.execute("""
    CREATE TRIGGER trg_job_create_milestone
      AFTER INSERT ON jobs
      FOR EACH ROW EXECUTE FUNCTION holler_job_create_milestone();
    """)
    op.execute("""
    CREATE OR REPLACE FUNCTION holler_task_milestone_edges() RETURNS trigger AS $$
    DECLARE ms uuid;
    BEGIN
      IF NEW.is_milestone THEN
        RETURN NEW;
      END IF;

      IF NEW.job_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
        SELECT id INTO ms FROM tasks
          WHERE job_id = NEW.job_id AND is_milestone AND deleted_at IS NULL;
        IF ms IS NOT NULL THEN
          INSERT INTO task_dependencies (task_id, depends_on_id)
          VALUES (ms, NEW.id)
          ON CONFLICT (task_id, depends_on_id)
          DO NOTHING;
        END IF;
      END IF;

      IF NEW.deleted_at IS NOT NULL OR NEW.job_id IS NULL THEN
        DELETE FROM task_dependencies
          WHERE depends_on_id = NEW.id
            AND task_id IN (SELECT id FROM tasks WHERE is_milestone);
      END IF;

      RETURN NEW;
    END $$ LANGUAGE plpgsql;
    """)
    op.execute("""
    CREATE TRIGGER trg_task_milestone_edges
      AFTER INSERT OR UPDATE OF job_id, deleted_at, is_milestone ON tasks
      FOR EACH ROW EXECUTE FUNCTION holler_task_milestone_edges();
    """)
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
    op.execute("""
    CREATE TRIGGER trg_job_completion
      AFTER UPDATE OF status ON tasks
      FOR EACH ROW EXECUTE FUNCTION holler_job_completion();
    """)

    # 7. Views
    op.execute("""
    CREATE OR REPLACE VIEW v_material_on_hand AS
    SELECT m.id AS material_id, m.name, m.unit, m.reorder_point,
           COALESCE(SUM(mt.delta), 0) AS on_hand
    FROM materials m
    LEFT JOIN material_transactions mt ON mt.material_id = m.id
    WHERE m.deleted_at IS NULL
    GROUP BY m.id, m.name, m.unit, m.reorder_point;
    """)
    op.execute("""
    CREATE OR REPLACE VIEW v_open_material_need AS
    SELECT tm.material_id, SUM(tm.qty_required) AS qty_needed
    FROM task_materials tm
    JOIN tasks t ON t.id = tm.task_id
    WHERE tm.deleted_at IS NULL
      AND t.deleted_at IS NULL
      AND t.is_milestone = false
      AND t.status <> 'done'
    GROUP BY tm.material_id;
    """)
    op.execute("""
    CREATE OR REPLACE VIEW v_shopping_list AS
    SELECT oh.material_id, oh.name, oh.unit,
           COALESCE(n.qty_needed, 0)            AS needed,
           oh.on_hand,
           COALESCE(n.qty_needed, 0) - oh.on_hand AS shortfall
    FROM v_material_on_hand oh
    LEFT JOIN v_open_material_need n ON n.material_id = oh.material_id
    WHERE COALESCE(n.qty_needed, 0) - oh.on_hand > 0
    ORDER BY oh.name;
    """)
    op.execute("""
    CREATE OR REPLACE VIEW v_task_board AS
    SELECT t.id, t.title, t.job_id,
      CASE
        WHEN t.status = 'done' THEN 'done'
        WHEN EXISTS (
          SELECT 1 FROM task_dependencies d
          JOIN tasks dep ON dep.id = d.depends_on_id AND dep.deleted_at IS NULL
          WHERE d.task_id = t.id AND dep.status <> 'done'
        ) THEN 'blocked'
        WHEN EXISTS (
          SELECT 1 FROM task_tools tt
          JOIN tools tl ON tl.id = tt.tool_id AND tl.deleted_at IS NULL
          WHERE tt.task_id = t.id AND tt.deleted_at IS NULL AND tl.status <> 'available'
        ) THEN 'blocked'
        ELSE 'ready'
      END AS board_state
    FROM tasks t
    WHERE t.deleted_at IS NULL AND t.is_milestone = false;
    """)

def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_task_board;")
    op.execute("DROP VIEW IF EXISTS v_shopping_list;")
    op.execute("DROP VIEW IF EXISTS v_open_material_need;")
    op.execute("DROP VIEW IF EXISTS v_material_on_hand;")
    op.execute("DROP TRIGGER IF EXISTS trg_job_completion ON tasks;")
    op.execute("DROP FUNCTION IF EXISTS holler_job_completion();")
    op.execute("DROP TRIGGER IF EXISTS trg_task_milestone_edges ON tasks;")
    op.execute("DROP FUNCTION IF EXISTS holler_task_milestone_edges();")
    op.execute("DROP TRIGGER IF EXISTS trg_job_create_milestone ON jobs;")
    op.execute("DROP FUNCTION IF EXISTS holler_job_create_milestone();")
    
    for table in ['job_tool_effects', 'task_materials', 'task_tools', 'material_transactions', 'materials', 'tools', 'jobs']:
        op.execute(f"DROP TRIGGER IF EXISTS trg_rv_{table} ON {table};")
        op.drop_table(table)
    
    op.execute("DROP INDEX IF EXISTS uq_one_milestone_per_job;")
    op.drop_column('tasks', 'is_milestone')
    op.drop_column('tasks', 'job_id')
