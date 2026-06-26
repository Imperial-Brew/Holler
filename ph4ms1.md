# Phase 4 · Milestone 1 — Task dependencies (backend)

**Goal:** tasks can depend on other tasks. This adds the **`task_dependencies`** edge table (the DAG behind "finish 4 before 10"), cycle-safe add/remove endpoints, and conveys each task's prerequisite list to the client — so Milestone 2 can compute the Ready/Blocked board.

**You'll know it worked when:** you can make task B depend on task A, see `B.depends_on = [A]` come down in `pull`, a cycle attempt is rejected, and removing the edge updates B — all syncing through the cursor.

---

## Context for the agent

Continues Holler. Phase 3 done: `tasks`, `locations`, etc., all syncing through `GET /sync/pull` under one global cursor; the `set_row_version` trigger fires on insert/update of every entity table. Dependency add/remove is an **online-only** desk action (like register).

> **Readiness is computed client-side in Milestone 2, not here.** This milestone does NOT compute or store "ready"/"blocked". It manages the edges and ships each task's `depends_on` list. Never persist derived status.

---

## Key design — edges are owned by the dependent task

`task_dependencies` is an **edge table**, and per the build-plan join rule it is **owned by its parent — the `task_id` (dependent) side.** Consequences:

- The edge table has **no `row_version` of its own.** Instead, **changing a task's edge set bumps that task's `row_version`**, so the change rides the normal pull.
- Pull conveys each task's prerequisites as an **embedded `depends_on` list** on `TaskRead`; the client replaces a task's dependency set **wholesale** when it upserts the task. (Same "parent owns its join set" pattern from the build plan.)

The cleanest way to guarantee the bump is **structural** (the row_version philosophy again): a trigger on `task_dependencies` that touches the parent task, which in turn fires the existing `set_row_version` trigger. Don't rely on every endpoint remembering to bump.

---

## Steps

### 1. Model — `app/models/task_dependency.py`

`TaskDependency`: `task_id` (UUID, FK → tasks.id) and `depends_on_id` (UUID, FK → tasks.id), **composite PK** `(task_id, depends_on_id)`, with `CHECK (task_id <> depends_on_id)` (no self-dependency). **No audit columns, no `row_version`** — it's a parent-owned edge. Add to `app/models/__init__.py`.

> `task_id` *waits on* `depends_on_id`. Read it as "task_id depends on depends_on_id."

### 2. Migration — new file

`alembic revision --autogenerate -m "create task_dependencies"`. Autogenerate makes the table. Then **hand-add a parent-bump trigger** (this is new machinery — a second trigger function, distinct from `set_row_version`):

```python
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
```

`COALESCE(NEW.task_id, OLD.task_id)` picks the right id either way: on INSERT `OLD` is null, on DELETE `NEW` is null. That `UPDATE tasks` fires the existing `set_row_version` trigger on the task, bumping its `row_version` so the edge change syncs. (No infinite loop — it touches a *different* table's trigger.) Drop the trigger and function in `downgrade()`.

Then `alembic upgrade head`.

### 3. `TaskRead` gains `depends_on` — `app/schemas/task.py`

Add `depends_on: list[UUID]` to `TaskRead` — the ids this task waits on. It's the **direct** prerequisites only; the client walks transitivity itself.

> **Batch-load the edges — don't do one query per task (N+1).** For the pull's task set, fetch all edges in a single query and group them in Python:
> ```python
> rows = await session.execute(
>     select(TaskDependency.task_id, TaskDependency.depends_on_id)
>     .where(TaskDependency.task_id.in_(task_ids)))
> dep_map = defaultdict(list)
> for tid, did in rows: dep_map[tid].append(did)
> ```
> Then attach `dep_map[task.id]` to each task's `depends_on`. (Harmless at v1 scale, but it's no harder than the naive loop.)

> Pull already returns tasks; this just enriches each task with its current edge set. No new pull key — `depends_on` rides inside each `TaskRead`.

### 4. Route — add a dependency

`POST /tasks/{task_id}/dependencies` with body `{ "depends_on_id": "<uuid>" }`. **Status taxonomy — commit to these:**
1. Either task id doesn't exist → **`404`**.
2. Self-edge (`task_id == depends_on_id`) → **`422`** (invalid input; the `CHECK` backstops it).
3. **Cycle prevention (before inserting):** reject if `depends_on_id` already (transitively) depends on `task_id` — adding the edge would close a loop → **`409`** (a conflict with the current graph state, distinct from a malformed `422`). Recursive CTE:
   ```sql
   WITH RECURSIVE ancestors AS (
     SELECT depends_on_id AS id FROM task_dependencies WHERE task_id = :depends_on_id
     UNION
     SELECT d.depends_on_id FROM task_dependencies d JOIN ancestors a ON d.task_id = a.id
   )
   SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = :task_id);  -- true → 409
   ```
4. Insert the edge (**idempotent** — re-adding the same edge is a no-op success). The bump trigger updates `task_id`'s `row_version`.
5. Return **`200`** with the updated task (`TaskRead`, now with the new `depends_on`). **Always `200`, never `201`** — the response is the *task* (which already existed), not a newly-created resource; the edge isn't returned as its own resource. This intentionally differs from the captures/locations `201`-on-create pattern.

### 5. Route — remove a dependency

`DELETE /tasks/{task_id}/dependencies/{depends_on_id}` → delete the edge (**idempotent** — removing a non-existent edge is a no-op success). The bump trigger fires on DELETE too, updating `task_id`'s `row_version`. Return **`200`** with the updated task.

Register the router(s) in `main.py`.

---

## Acceptance check (in order)

1. Server starts; `GET /health` `{"db":true}`; migration applied (table + bump trigger).
2. Have two tasks A and B (register captures if needed). `POST /tasks/{B}/dependencies` `{ "depends_on_id": "<A>" }` → **`200`**, returned task B has `depends_on: ["<A>"]`.
3. `GET /sync/pull?since=0` → task B carries `depends_on: ["<A>"]`; B's `row_version` is newer than before (the edge add bumped it).
4. **Cycle rejected:** `POST /tasks/{A}/dependencies` `{ "depends_on_id": "<B>" }` (would make A↔B a loop) → **`409`**, no edge created.
5. **Self rejected:** `POST /tasks/{A}/dependencies` `{ "depends_on_id": "<A>" }` → **`422`**. **Missing task:** a bogus task id → **`404`**.
6. **Chain:** add C depends_on B (so A ← B ← C). Pull shows each task's *direct* `depends_on` only (B→[A], C→[B], A→[]). Transitivity is the client's job, not stored.
7. **Remove:** `DELETE /tasks/{B}/dependencies/{A}` → **`200`**; pull shows B with `depends_on: []` and a bumped `row_version`.

If all seven hold, Milestone 1 is done — the dependency graph exists, can't form cycles, and each task's prerequisites sync to the client.

---

## Guardrails

- **DO** make `task_dependencies` a parent-owned **edge table**: composite PK, `CHECK (task_id <> depends_on_id)`, **no `row_version`/audit columns**.
- **DO** bump the **owning task's** `row_version` on every edge add/remove — via the `trg_task_dep_bump` trigger (structural; don't rely on endpoints remembering).
- **DO** convey prerequisites as an embedded `depends_on` list on `TaskRead` (direct edges only); the client replaces the set wholesale.
- **DO** reject cycles (recursive-CTE ancestor check) **before** inserting, and self-edges via the `CHECK`.
- **DO** commit to the status taxonomy: missing task → `404`, self-edge → `422`, cycle → `409`, success → **`200`** (always — returning the task, not creating a resource; never `201`).
- **DO** batch-load `depends_on` for the whole pull set in one query (no N+1).
- **DO** make add/remove **idempotent** (re-add / remove-missing are no-op successes) and validate both task ids exist.
- **DO** keep dependency editing **online-only** (desk action).
- **DON'T** compute, return, or persist "ready"/"blocked" — that's client-side in Milestone 2. Never store derived status.
- **DON'T** give the edge table its own `row_version` or sync it as a standalone table — it rides inside `TaskRead`.
- **DON'T** build the Board UI (M2), resources, or the "while you have it" view (Phase 5).