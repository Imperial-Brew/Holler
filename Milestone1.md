# Phase 1 · Milestone 1 — Server receives and stores a capture

**Goal:** the backend can accept a capture and persist it. No client, no offline, no sync yet — just prove a capture can land in Postgres through a real endpoint.

**You'll know it worked when:** you POST a capture via the Swagger UI (`/docs`), get back a `201` whose body includes a populated `row_version`, and `SELECT * FROM captures;` in psql shows the row. POSTing the *same* `id` again still succeeds without creating a duplicate.

---

## Context for the agent

This continues the Holler build (FastAPI + async SQLAlchemy + Alembic + Postgres 12). Phase 0 is done: `users` table exists with the soft-delete/audit columns and a `row_version` column fed by a global `row_version_seq` sequence and a reusable trigger function (`set_row_version`). **Reuse that existing sequence and function — do not recreate them.**

Follow the established patterns already in the repo (the `User` model, its migration, the `FetchedValue` mapping for `row_version`, the async session in `app/database.py`, and the auth-stub owner UUID).

---

## Steps

### 0. First, fix the `row_version` mapping on `User` (so the pattern is correct before `Capture` copies it)

The current `User.row_version` uses `server_default=text("nextval('row_version_seq')")`. Because the `set_row_version` **trigger** already sets the value on every insert *and* update, that column default is both redundant (two `nextval` calls per insert) and incomplete (it doesn't cover updates, leaving the ORM's value stale after an update). Switch to the trigger-aware mapping:

- **Model (`app/models/user.py`):** map `row_version` with `FetchedValue()` and `server_onupdate=FetchedValue()`, and **remove** the `server_default`. Example:
  ```python
  from sqlalchemy import BigInteger
  from sqlalchemy.schema import FetchedValue
  row_version: Mapped[int] = mapped_column(
      BigInteger, FetchedValue(), server_onupdate=FetchedValue(), nullable=False
  )
  ```
  `FetchedValue()` tells SQLAlchemy "the database sets this; never write it, always read it back" — correct for a trigger-maintained column, and it covers both insert and update.
- **Migration (new file, don't edit the baseline):** drop the redundant DB-level default so inserts stop consuming two sequence values:
  ```python
  def upgrade():
      op.alter_column('users', 'row_version', server_default=None)
  def downgrade():
      op.alter_column('users', 'row_version',
          server_default=sa.text("nextval('row_version_seq')"))
  ```
  Then `alembic upgrade head`.

This is the pattern every future entity table copies. Verify `/health` is still `db:true` and the seed still runs before moving on.

### 1. Model — `app/models/capture.py`

Create a `Capture` model with these columns:

| column | type | notes |
|---|---|---|
| `id` | UUID, PK | client-generated (default `uuid4` for server-side test creates, but the client supplies it in real use) |
| `raw_text` | Text, not null | the field jot |
| `location_hint` | Text, nullable | free text; what's captured in the field |
| `location_id` | UUID, nullable | **plain UUID column, NO ForeignKey yet** — `locations` doesn't exist until a later milestone |
| `source` | String, not null, default `'self'` | `'self'` or `'request'` |
| `status` | String, not null, default `'pending'` | `'pending'` / `'registered'` / `'dismissed'` |
| `promoted_task_id` | UUID, nullable | **plain UUID column, NO ForeignKey yet** — `tasks` doesn't exist yet |
| `created_by` | UUID, not null | set to the auth-stub owner constant |
| `created_at` | DateTime(tz), not null | server default `now()` |
| `updated_at` | DateTime(tz), not null | server default `now()`, on-update `now()` |
| `deleted` | Boolean, not null, default false | soft-delete |
| `deleted_at` | DateTime(tz), nullable | |
| `row_version` | BigInteger, not null | mapped with `FetchedValue()` + `server_onupdate=FetchedValue()`, **no** `server_default` — see Step 0; the trigger is the sole source |

> **Why the two FK columns are plain UUIDs for now:** `captures` references `locations` and `tasks`, neither of which exists yet. Defining them as plain nullable UUID columns avoids a migration that points at non-existent tables. The actual ForeignKey constraints get added in the migration that creates those tables. Leave them constraint-free here.

### 2. Migration — new file, do NOT edit the baseline

**First make the model visible to autogenerate:** add `Capture` to `app/models/__init__.py` (alongside `User`) and confirm `alembic/env.py` imports the models package into its `target_metadata`. If you skip this, autogenerate sees no new table and produces an **empty** migration.

Run `alembic revision --autogenerate -m "create captures table"`. Autogenerate will create the `captures` table from the model — but it will **NOT** create the row_version trigger. So open the generated file and **manually add the trigger** to `upgrade()`, after the `create_table` call, reusing the existing function:

```python
op.execute("""
    CREATE TRIGGER trg_captures_row_version
    BEFORE INSERT OR UPDATE ON captures
    FOR EACH ROW EXECUTE FUNCTION set_row_version()
""")
```

And in `downgrade()`, drop that trigger **before** the table is dropped:

```python
op.execute("DROP TRIGGER IF EXISTS trg_captures_row_version ON captures")
```

> **Standing rule for every future entity table:** autogenerate makes the table; you hand-add its `trg_<table>_row_version` trigger (reusing `set_row_version`) in the same migration, and drop it in `downgrade`. The sequence and function already exist — only the per-table trigger is new each time.

Then `alembic upgrade head`.

### 3. Schemas — `app/schemas/capture.py`

Two Pydantic classes, deliberately different (this is the model-vs-schema split):

- **`CaptureCreate`** — only what a client may submit: `id` (UUID, client-supplied so offline-created IDs persist), `raw_text` (required), `location_hint` (optional), `source` (optional, default `'self'`). **Does NOT include** `row_version`, `created_by`, `status`, timestamps — those are server-owned; a client must not be able to set them.
- **`CaptureRead`** — the full server view returned in responses: every column including `id`, `status`, `row_version`, `created_at`. Set `model_config = ConfigDict(from_attributes=True)` so it serializes from the ORM object.

### 4. Route — `app/routes/captures.py`

A `POST /captures` endpoint:

1. Takes a `CaptureCreate` body (FastAPI validates it).
2. **Idempotent insert by `id`, race-safe.** Don't write a naive SELECT-then-INSERT (it has a check-then-act race). Instead use Postgres `INSERT ... ON CONFLICT (id) DO NOTHING` (or a `try/except IntegrityError`), then read the row back by `id`. When building the row: copy the submitted fields, set `created_by` to the auth-stub owner constant, leave `status` at its `'pending'` default, and do **not** set `row_version` (the trigger handles it).
3. `await session.commit()`, then `await session.refresh(obj)` (or re-select) so `row_version` and timestamps come back populated.
4. Return `CaptureRead`. **Status codes:** `201` when a new row was actually created; `200` when the `id` already existed (idempotent hit returning the existing row). Track which happened (e.g. whether `ON CONFLICT` inserted) to choose the code.

Register the router in `main.py` (`app.include_router(...)`), same way the existing routers are wired.

> **No PATCH or DELETE on captures.** Append-only from clients in v1 — creating and reading only.

---

## Acceptance check (how you verify, in order)

1. Server starts; `GET /health` still returns `{"status":"ok","db":true}`.
2. Open `http://localhost:8000/docs`. `POST /captures` is listed.
3. Execute it with a body like:
   ```json
   { "id": "11111111-1111-1111-1111-111111111111",
     "raw_text": "fix latch on county rd gate, ~1mo",
     "source": "self" }
   ```
   Expect `201`, and a response body where `status` is `"pending"` and `row_version` is a number (not null).
4. In psql: `SELECT id, raw_text, status, row_version FROM captures;` → exactly one row.
5. Execute the **same** POST again (same `id`). Expect `200` (idempotent hit, not `201`), the same row returned, and step 4 still shows **one** row — proving idempotency.

If all five hold, Milestone 1 is done.

---

## Guardrails

- **DON'T** edit the applied baseline migration. New migration only.
- **DON'T** add ForeignKey constraints on `location_id` / `promoted_task_id` yet (target tables don't exist).
- **DON'T** recreate `row_version_seq` or `set_row_version` — reuse them; only add the new per-table trigger.
- **DON'T** let the client set `row_version`, `created_by`, or `status` — those are absent from `CaptureCreate` on purpose.
- **DO** use the single auth-stub owner UUID constant for `created_by` (one source of truth).
- **DO** make `POST /captures` idempotent **and race-safe** by `id` (`ON CONFLICT DO NOTHING` / `IntegrityError`, not SELECT-then-INSERT). Return `201` on create, `200` on idempotent hit.
- **DO** add `Capture` to `app/models/__init__.py` before running autogenerate, or you'll get an empty migration.
- **DO** use async session + `await` throughout.