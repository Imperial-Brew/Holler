# Holler

Offline-first property and business task-management app. Built to run on local infrastructure, traceable and self-hostable — no vendor lock-in.

## Stack

- **Backend:** FastAPI + PostgreSQL, Alembic migrations
- **Frontend:** React PWA (Vite), Dexie / IndexedDB for offline storage
- **Sync:** offline-first; data is created on-device and synced to Postgres

## Layout

```
Holler/
├── main.py                 # FastAPI entry point (instance named `app`)
├── app/                    # backend application code
├── alembic/ , alembic.ini  # database migrations
├── requirements.txt        # backend dependencies
├── frontend/               # React PWA + Dexie
├── Holler_build_plan.md    # roadmap / current phase (source of truth)
├── docs/
│   ├── decisions/          # architectural decision records (the "why")
│   ├── tasks/              # scoped Junie task prompts
│   └── milestones/         # historical milestone notes (reference)
└── .junie/AGENTS.md        # persistent agent guidelines
```

## Getting started

```bash
# 1. Backend deps (Windows venv)
.\.venv\Scripts\activate
pip install -r requirements.txt

# 2. Environment
copy .env.example .env        # then fill in values

# 3. Database
alembic upgrade head

# 4. Run backend (dev)
uvicorn main:app --reload

# 5. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

> Dev note: the working copy must live on a **local disk** — Vite crashes when run from a network/mapped share. On any machine where the usual drive is a share, clone to a local path (e.g. `C:\dev\Holler`) and sync via git.

## What's built

- **Capture → register** — quick offline notes promoted into real tasks at a desk.
- **Task board** — Ready / Blocked / Done, with dependency chains; readiness is derived, not stored.
- **Jobs** — work-order containers with an auto-generated milestone task, per-task tool and material requirements, and **manual completion** (finishing the last task marks a job *ready to complete*, not done — see `docs/decisions/` / the completion trigger).
- **Locations, Tools, Materials** catalogs; an append-only material ledger for offline-safe on-hand tracking.
- **Shopping list** — needed − on-hand across open jobs, computed offline, with in-store "Got it" check-off.

See `Holler_build_plan.md` for the roadmap. Architectural decisions and their rationale live in `docs/decisions/`.

## Design principles

- **Offline-first.** UUID primary keys (client-generatable); IndexedDB read cache; a single monotonic `row_version` sequence drives cursor-based pull. Adding a synced table has one non-negotiable rule — see `docs/decisions/002-sync-cursor-reset.md`.
- **Derive, don't store, most state.** Board readiness, job shortfall, and shopping needs are computed at read time from base data.
- **Append-only where sync is hard.** The material ledger never edits rows; on-hand is the sum of deltas.
- **Traceable and self-hostable by default.**

> A goal/priority model (ranked goals, tasks inheriting priority) is designed in `docs/decisions/001-prioritization-model.md` but **not yet built** — the `goals` tables exist unused. Treat 001 as intent, not current behavior.

## Tests & linting

Backend tests run against a **real throwaway Postgres** (started in Docker via
testcontainers and migrated with the real Alembic migrations), because the job
logic lives in Postgres triggers. Docker must be running.

```bash
pip install -r requirements-dev.txt
pytest
```

Coverage is deliberately narrow — the invisible, high-risk core (job
completion/reopen triggers) rather than CRUD happy-paths. Add tests here when
you touch trigger or sync behavior.

- Lint: frontend uses oxlint (`cd frontend && npx oxlint`); backend has no linter yet.