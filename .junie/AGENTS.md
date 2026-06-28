# Holler — Junie guidelines (AGENTS.md)

Persistent context for every Junie task. Keep it current; a stale guideline misleads the agent worse than no guideline.

## Read first (every task)

- [ ] Read this file and `README.md` before acting.
- [ ] For current project state / phase, treat `Holler_build_plan.md` as the single source of truth. Historical milestone notes live in `docs/milestones/` and are reference only — not current status.
- [ ] Show any database migration **before** applying it to the dev DB.
- [ ] Respect `.aiignore`. Do not read or modify ignored paths (`.env`, secrets, build output).
- [ ] If a request conflicts with an existing table, migration, or convention, stop and ask — don't guess.

## What Holler is

Offline-first property/business task-management app.

- **Backend:** FastAPI + PostgreSQL, migrations via **Alembic**. App code in `app/`, entry point `main.py` at repo root (FastAPI instance is named `app`), Alembic config `alembic.ini` + `alembic/` at root.
- **Frontend:** React PWA in `frontend/`, Vite build, Dexie (IndexedDB) as the offline store.
- Data is created offline and synced, so use **UUID primary keys** — IDs must be client-generatable without collision.

## Commands

| Task | Command |
|------|---------|
| Activate venv | `.\.venv\Scripts\activate` (Windows) |
| Install backend deps | `pip install -r requirements.txt` |
| Run migrations | `alembic upgrade head` |
| New migration | `alembic revision --autogenerate -m "message"` |
| Run backend (dev) | `uvicorn main:app --reload` |
| Run tests | none yet — do not invent a test suite; ask before adding one |
| Lint (frontend) | `cd frontend && npx oxlint` (config: `frontend/.oxlintrc.json`) |
| Lint (backend) | none yet |
| Install frontend deps | `cd frontend && npm install` |
| Run frontend (dev) | `cd frontend && npm run dev` |

## Conventions

- **Migrations:** always a new Alembic revision. Never edit an applied migration or hand-alter existing tables without asking.
- **IDs:** UUID primary keys everywhere (offline-first).
- **Timestamps:** `created_at` / `updated_at` as `timestamptz` on primary entities.
- **Offline parity:** any new Postgres entity that the client touches needs a matching Dexie object store; bump the Dexie version and add a migration rather than mutating a version in place.

## Dev environment

The working copy must live on a **local disk on each machine** — Vite crashes when the project runs from a network/mapped share.

- **Home PC:** `F:` is a local disk, so `F:\PyCharm\Holler` is fine.
- **Work PC:** `F:` is a network share — do **not** put the working copy there. Clone to a local path (e.g. `C:\dev\Holler`) instead.
- Sync the two machines through **git**, not by pointing both at the shared drive.

## Prioritization model — rules to respect

Holler separates *what matters* from *what must come first*. Different mechanisms; never collapse them into one number.

- **Goals** are a ranked hierarchy. `rank` orders siblings. This is the **only** place priority is hand-assigned.
- **Tasks** link many-to-many to every goal they meaningfully advance (`task_goals`). Each task has a `location` (drives physical batching) and may depend on other tasks (`task_dependencies`).
- **Priority is computed, never stored.** Effective priority = `max(rank of goals a task touches, rank of anything it unblocks)`. Derive it in a Postgres view server-side and mirror the logic in JS for offline. A stored priority column on `tasks` is a bug.
- **Dependency ≠ priority.** `task_dependencies(task_id, depends_on_task_id)`: `task_id` depends on `depends_on_task_id`, which must finish first. A task is unblocked when all its dependencies are done. This gates *availability*, not importance.
- **Move-in is the root goal (the outcome), not a competitor.** Weatherproof / organize / inventory hang under it.
- **Discipline:** link a task to a goal only if doing it *meaningfully advances* that goal. Don't over-link to high goals to fake urgency — that inflates priority and collapses the model into a flat list.

## "Next action" query (when built)

Filter to unblocked tasks → sort by effective priority → group by `location`. Priority decides what matters; location grouping decides what's efficient; the dependency filter decides what's available now.

## Where things live

- `README.md` — what Holler is, how to run it.
- `Holler_build_plan.md` — current phase / roadmap (source of truth for status).
- `docs/decisions/` — architectural decision records (the *why*). Start: `001-prioritization-model.md`.
- `docs/tasks/` — scoped Junie task prompts (reviewable, re-runnable).
- `docs/milestones/` — historical milestone notes (reference only).