# Phase 2 · Milestone 1 — The `tasks` table + register a capture into a task (backend)

**Goal:** the server can turn a capture into a real task. This introduces the **`tasks`** table (your first new entity table since `captures`), an endpoint that promotes a capture → task, and the first time `GET /sync/pull` returns **two** tables in one envelope.

**You'll know it worked when:** you register a capture via `/docs`, get back a new task, the capture flips to `registered` and links to it, and `GET /sync/pull?since=0` returns both a `captures` array and a `tasks` array sharing one cursor.

---

## Context for the agent

Continues Holler. Phase 1 is complete: `captures` table with the `row_version` trigger, idempotent `POST /captures`, `GET /sync/pull?since=N` returning `{ captures, cursor }`, and an offline-capable client. The global `row_version_seq` + `set_row_version` trigger function exist — **reuse them; only add the new per-table trigger.**

This is a backend slice. **Registration is an online-only desk action by design** (the capture/commit model: capture offline all day, register at the desk online). Do **not** make register offline-queued — it's a normal authenticated API call.

**Scope:** create the full `tasks` table per the schema, but only the *register* behavior is wired now (title, due, link back to the capture). Dependencies, resources, readiness, priority logic, recurrence — all later phases. The columns exist; the behavior doesn't yet.

---

## Steps

### 1. Model — `app/models/task.py`

Create the `Task` model per the build-plan schema:

| column | type | notes |
|---|---|---|
| `id` | UUID, PK | client-generated |
| `title` | Text, not null | |
| `location_id` | UUID, nullable | **plain UUID, NO ForeignKey yet** — `locations` still doesn't exist (Phase 3) |
| `due_date` | Date, nullable | |
| `status` | String, not null, default `'open'` | `open` / `in_progress` / `done` / `cancelled` |
| `priority` | Integer, default 0 | not used behaviorally yet |
| `est_effort_min` | Integer, nullable | |
| `assigned_to` | UUID, nullable, **FK → users.id** | users exists, so this FK is real |
| `recurrence_rule` | Text, nullable | stored only; engine is Phase 9 |
| `series_id` | UUID, nullable | |
| `origin_capture_id` | UUID, nullable, **FK → captures.id** | captures exists, so this FK is real |
| `created_by` | UUID, not null | auth-stub owner constant |
| `created_at` / `updated_at` | DateTime(tz), not null | server defaults |
| `completed_at` | DateTime(tz), nullable | |
| `deleted` / `deleted_at` | Boolean / DateTime(tz) | soft-delete |
| `row_version` | BigInteger, not null | `FetchedValue()` + `server_onupdate=FetchedValue()`, no `server_default` — same pattern as `User`/`Capture` |

Add `Task` to `app/models/__init__.py` so autogenerate sees it (or you'll get an empty migration).

### 2. Migration — new file

`alembic revision --autogenerate -m "create tasks table"`. Autogenerate makes the table; **hand-add the row_version trigger** (the standing per-table step), reusing the existing function:

```python
op.execute("""
    CREATE TRIGGER trg_tasks_row_version
    BEFORE INSERT OR UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_row_version()
""")
```
…and drop it first in `downgrade()`.

**Optional cleanup while you're here (now that `tasks` exists):** add the deferred FK from `captures.promoted_task_id` → `tasks.id` that was left as a plain UUID back in Phase 1 Milestone 1. One `op.create_foreign_key(...)` in this migration, dropped in downgrade. Nice to close the loop, not required.

Then `alembic upgrade head`.

### 3. Schemas — `app/schemas/task.py`

- **`TaskRead`** — full server view of a task (all columns incl. `row_version`, `status`, `origin_capture_id`), `from_attributes=True`.
- **`RegisterRequest`** — what the desk submits to promote a capture: `title` (required), `due_date` (optional). (Location is deliberately omitted — stubbed until Phase 3.)
- Optionally a **`RegisterResponse`** = `{ task: TaskRead, capture: CaptureRead }` so the client gets both updated rows back in one call.

### 4. Route — `POST /captures/{capture_id}/register`

Promote a capture into a task, **atomically** (one transaction — a half-done promotion that creates a task but doesn't flip the capture would orphan data):

1. Load the capture by `capture_id` → `404` if missing.
2. **Idempotency guard:** if the capture is already `status == 'registered'`, return its existing linked task (via `promoted_task_id`) — do **not** create a second task. (`200`.)
3. Otherwise, in one transaction:
   - create a `Task`: `title` from the body, `due_date` from the body, `origin_capture_id = capture.id`, `created_by` = owner constant, `location_id = NULL` (stubbed), `status` defaults to `'open'`;
   - flip the capture: `status = 'registered'`, `promoted_task_id = task.id`.
   - commit; both rows get fresh `row_version`s from their triggers.
4. `await session.refresh(...)` both, return `RegisterResponse` (`201` on actual creation).

Register the router in `main.py`.

### 5. Extend `GET /sync/pull` to carry tasks

The envelope gains a sibling key — this is the extension the M-2 envelope was shaped for:

- Query **both** `captures` and `tasks` where `row_version > since` (no `deleted` filter on either — tombstones propagate for both).
- `cursor` = the **max `row_version` across all returned rows from both tables** (one global cursor, because `row_version` is global).
- Return `{ "captures": [...], "tasks": [...], "cursor": N }`.

Update `SyncPullResponse` to add `tasks: list[TaskRead]`.

---

## Acceptance check (in order)

1. Server starts; `GET /health` still `{"db":true}`. `alembic upgrade head` applied cleanly (table + trigger).
2. Pick an existing capture id. `POST /captures/{id}/register` with `{ "title": "Fix the county road gate latch", "due_date": "2026-07-15" }` → `201`, response has a `task` with a numeric `row_version` and `status: "open"`, plus the `capture` now `status: "registered"` with `promoted_task_id` = the task's id.
3. `GET /sync/pull?since=0` → returns a `captures` array (incl. the registered one) **and** a `tasks` array (the new task), with `cursor` = the highest `row_version` among all of them.
4. **Incremental:** pull with that cursor → both arrays empty, cursor unchanged. Register a second capture → pull from the prior cursor returns just the new task and the updated capture.
5. **Idempotency:** `POST /captures/{id}/register` again on an already-registered capture → returns the **existing** task (no second task created); a fresh `since=0` pull shows still exactly one task per registered capture.
6. **Atomicity sanity:** psql `SELECT id, status, promoted_task_id FROM captures WHERE status='registered';` — every registered capture has a non-null `promoted_task_id`, and every such task exists in `tasks`. No orphans.

If all six hold, Milestone 1 is done — the server promotes captures to tasks and syncs both tables through one cursor.

---

## Guardrails

- **DO** add the `trg_tasks_row_version` trigger (reusing `set_row_version`) in the migration — the standing per-table step. Don't recreate the sequence/function.
- **DO** add `Task` to `app/models/__init__.py` before autogenerate.
- **DON'T** add a ForeignKey on `tasks.location_id` — `locations` doesn't exist until Phase 3 (plain UUID for now). `assigned_to`→users and `origin_capture_id`→captures *are* real FKs (those tables exist).
- **DO** make register **atomic** (one transaction) and **idempotent** (already-registered → return existing task).
- **DO** keep register **online-only** — it is not an offline-queued operation.
- **DO** make `/sync/pull` return one global `cursor` spanning both tables; no `deleted` filter on either.
- **DON'T** build dependencies, resources, readiness, priority, or recurrence behavior — the columns exist, the logic is later phases.
- **DON'T** touch the frontend this milestone (that's M2) beyond what's needed to keep it running.