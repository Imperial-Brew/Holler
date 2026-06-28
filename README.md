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

## Current status

Phases 0–4 are in active development. See `Holler_build_plan.md` for the roadmap and current milestone. Architectural decisions and their rationale live in `docs/decisions/`.

## Design principles

- Offline-first; UUID primary keys so IDs are client-generatable.
- Priority is **computed, not stored** — goals are ranked once, tasks link to the goals they advance, and priority is derived. See `docs/decisions/001-prioritization-model.md`.
- Traceable and self-hostable by default.

## Tests & linting

- Tests: none yet.
- Lint: frontend uses oxlint (`cd frontend && npx oxlint`); backend has no linter yet.