# Junie Task 01 — Prioritization schema (tables + seed + Dexie stores)

> Paste into the Junie prompt panel. Scoped to schema only.
> Context: `.junie/AGENTS.md`. Full reasoning: `docs/decisions/001-prioritization-model.md`.

---

## Goal

Add the goal/task prioritization data model to Holler: four tables, a seeded goal hierarchy, and the matching Dexie object stores for the offline mirror. **Schema and seed only.** No priority computation, no queries, no UI.

## Before writing anything

Inspect the existing structure and follow its patterns — do not invent parallel ones:
- `app/models/` — existing SQLAlchemy models. Match the Base class, naming, and any mixins already in use.
- `app/schemas/` — existing Pydantic schemas. Match their style.
- `app/database.py` — use the existing `Base` / engine / session from here; do not create a second DB setup.
- `app/seed.py` — **extend this existing seed module**; do not create a new seeding mechanism.
- `frontend/src/` — find the existing Dexie database definition and extend it; do not create a second Dexie instance.

## Backend — SQLAlchemy models + Alembic migration

Add models in `app/models/` and Pydantic schemas in `app/schemas/`, then generate **one new Alembic migration** (`alembic revision --autogenerate`). Do not edit existing migrations or alter existing tables.

Use **UUID primary keys** (client-generatable for offline). Include `created_at` / `updated_at` (`timestamptz`, default now) on `goals` and `tasks`.

**`goals`**
- `id` uuid PK
- `name` text not null
- `parent_id` uuid null → `goals(id)` (self-referencing; root rows have null parent)
- `rank` int not null — orders *siblings*, not a global priority
- `status` text not null default `'active'`

**`tasks`**
- `id` uuid PK
- `title` text not null
- `status` text not null default `'open'`
- `location` text null — free text for now (e.g. "roof", "east door"); no location table yet
- `effort_estimate` int null — minutes; nullable, unused for now

**`task_goals`** (many-to-many)
- `task_id` uuid → `tasks(id)` on delete cascade
- `goal_id` uuid → `goals(id)` on delete cascade
- composite PK `(task_id, goal_id)`

**`task_dependencies`** (sequencing, separate from priority)
- `task_id` uuid → `tasks(id)` on delete cascade
- `depends_on_task_id` uuid → `tasks(id)` on delete cascade
- composite PK `(task_id, depends_on_task_id)`
- CHECK `task_id <> depends_on_task_id`
- **Semantics:** `task_id` depends on `depends_on_task_id`; the depended-on task completes first. A task is "unblocked" when every task it depends on is done.

## Seed data — extend `app/seed.py`

Seed `goals` with this tree (`rank` orders siblings):

- **Move in** (root, parent null, rank 1) — the outcome, not a competitor
  - **Weatherproof** (rank 1)
    - **Roof** (rank 1)
    - **Doors** (rank 2)
    - **Walls & gaps** (rank 3)
  - **Organize** (rank 2)
  - **Inventory** (rank 3)

Make seeding idempotent (re-running shouldn't duplicate rows).

## Frontend — Dexie object stores

Extend the existing Dexie db under `frontend/src/`. **Bump the Dexie version number** and add a migration; don't mutate an existing version in place.

- `goals` — keyed by `id`, index on `parentId`
- `tasks` — keyed by `id`, index on `status` and `location`
- `taskGoals` — keyed by `[taskId+goalId]`, **multi-entry index on `goalId`**
- `taskDependencies` — keyed by `[taskId+dependsOnTaskId]`

## Non-goals (do NOT do these)

- No effective-priority computation (the `max(...)` logic) — that's the next task, and it needs real rows to test.
- No "next action" query.
- No UI / React components, no new routes in `app/routes/`.
- No sync logic between Postgres and Dexie.

## Acceptance criteria

- The Alembic migration applies (`upgrade`) and reverses (`downgrade`) cleanly.
- After seeding, `goals` returns the hierarchy above with correct `parent_id` links; re-running the seed adds no duplicates.
- Dexie version is bumped; all four stores exist; the `goalId` multi-entry index works.
- Sanity check: a task linked to two goals (e.g. one touching both Roof and Organize) returns from querying *either* goal via `taskGoals`.
- A `task_dependencies` row with `task_id == depends_on_task_id` is rejected by the CHECK constraint.

## Guardrails

- Show me the generated migration **before** applying it to the dev DB.
- If anything conflicts with an existing model, schema, or convention, stop and ask.