# Junie Task 01 — Prioritization schema (tables + seed + Dexie stores)

> Paste this into the Junie prompt panel. It is intentionally scoped to schema only.
> Companion context lives in `.junie/AGENTS.md`. Full reasoning is in `holler-prioritization-design.md`.

---

## Goal

Add the goal/task prioritization data model to Holler: four tables, a seeded goal hierarchy, and the matching Dexie object stores for the offline mirror. **Schema and seed only.** Do not implement priority computation, queries, or UI in this task.

## Backend — Postgres migration

Use the project's existing migration tooling (Alembic if present; if no migration setup exists, ask me before choosing one). Create **one new migration** — do not edit existing migrations or alter existing tables.

Use **UUID primary keys** (client-generatable, since IDs may be created offline before sync). Include `created_at` / `updated_at` (`timestamptz`, default now) on `goals` and `tasks`.

**`goals`**
- `id` uuid PK
- `name` text not null
- `parent_id` uuid null → references `goals(id)` (self-referencing hierarchy; root rows have null parent)
- `rank` int not null — ordering *among siblings*, not a global priority
- `status` text not null default `'active'`

**`tasks`**
- `id` uuid PK
- `title` text not null
- `status` text not null default `'open'`
- `location` text null — free text for now (e.g. "roof", "east door", "barn"); do not build a location table yet
- `effort_estimate` int null — minutes; nullable, unused for now

**`task_goals`** (many-to-many: a task links to every goal it advances)
- `task_id` uuid → references `tasks(id)` on delete cascade
- `goal_id` uuid → references `goals(id)` on delete cascade
- composite PK `(task_id, goal_id)`

**`task_dependencies`** (sequencing, kept separate from priority)
- `task_id` uuid → references `tasks(id)` on delete cascade
- `depends_on_task_id` uuid → references `tasks(id)` on delete cascade
- composite PK `(task_id, depends_on_task_id)`
- CHECK `task_id <> depends_on_task_id`
- **Semantics (important):** a row means `task_id` depends on `depends_on_task_id`; the depended-on task must be completed first. A task is "unblocked" when every task it depends on is done.

## Seed data — the goal hierarchy

Seed `goals` with this tree. `rank` orders siblings.

- **Move in** (root, parent null, rank 1) — this is the outcome, not a competitor to the others
  - **Weatherproof** (rank 1)
    - **Roof** (rank 1)
    - **Doors** (rank 2)
    - **Walls & gaps** (rank 3)
  - **Organize** (rank 2)
  - **Inventory** (rank 3)

## Frontend — Dexie object stores

Mirror the same four stores in the Dexie schema. **Bump the Dexie version number** and add a migration; don't mutate the existing version in place.

- `goals` — keyed by `id`, index on `parentId`
- `tasks` — keyed by `id`, index on `status` and `location`
- `taskGoals` — keyed by `[taskId+goalId]`, with a **multi-entry index on `goalId`** so "all tasks touching goal X" stays cheap offline
- `taskDependencies` — keyed by `[taskId+dependsOnTaskId]`

## Non-goals (do NOT do these in this task)

- Do **not** implement effective-priority computation (the `max(goal rank, unblocked-thing rank)` logic) — that's the next task, and it needs real rows to test against.
- Do **not** build the "next action" query.
- Do **not** build or touch any UI / React components.
- Do **not** implement or modify sync logic between Postgres and Dexie.

## Acceptance criteria

- The migration applies (`upgrade`) and reverses (`downgrade`) cleanly against the dev DB.
- After seeding, querying `goals` returns the hierarchy above with correct `parent_id` links.
- Dexie schema version is bumped; all four stores exist; the `goalId` multi-entry index works.
- Sanity check: inserting one task linked to two goals (e.g. one touching both Roof and Organize) returns that task when querying *either* goal via `taskGoals`.
- A `task_dependencies` row with `task_id == depends_on_task_id` is rejected by the CHECK constraint.

## Guardrails

- Show me the generated migration **before** applying it to the dev database.
- If anything here conflicts with an existing table or convention, stop and ask rather than guessing.