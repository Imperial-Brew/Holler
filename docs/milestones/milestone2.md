# Phase 1 · Milestone 2 — Server can hand captures back

**Goal:** the other half of the round trip. A client can ask "what's changed since cursor N?" and get back everything newer — including tombstoned (soft-deleted) rows so deletions propagate. One read endpoint, no new tables, no triggers.

**You'll know it worked when:** `GET /sync/pull?since=0` returns the capture(s) you created in Milestone 1 with a `cursor` equal to the highest `row_version` returned; pulling again with that cursor returns an **empty** list and the **same** cursor; and a newly created or soft-deleted capture shows up when you pull from the previous cursor.

---

## Context for the agent

Continues Holler (FastAPI + async SQLAlchemy + Postgres 12). Milestone 1 is done: `captures` table exists, `POST /captures` works, and every entity row gets a `row_version` from the global `row_version_seq` via the `set_row_version` trigger (fires on insert **and** update). `CaptureRead` schema already exists and includes every column (`row_version`, `deleted`, `deleted_at`, …).

This is a **read-only** milestone. No writes, no new tables, no migrations.

---

## The cursor model (read this before coding)

- The client stores one integer, `last_version`, starting at `0`.
- Pull returns every row whose `row_version > since`, **strictly greater** (never `>=` — the monotonic sequence guarantees no ties, so strict `>` can't skip or re-send).
- The response's `cursor` is the **max `row_version` among the returned rows**. If nothing was returned, echo back `since` unchanged (the client must not advance past nothing).
- **Tombstones are included.** Do **not** filter out `deleted = true` rows. A soft-deleted row still has a fresh `row_version` (the trigger bumped it on the update), so it rides the same pull and tells the client to drop that record from its cache. Filtering deleted rows out is the one mistake that silently breaks deletion sync.

---

## Steps

### 1. Response envelope — `app/schemas/sync.py`

Define a typed response so it renders in `/docs` and so future tables are additive, not a reshape:

```python
class SyncPullResponse(BaseModel):
    captures: list[CaptureRead]
    cursor: int
```

> **Forward shape (don't build yet, just shape for it):** later milestones add sibling keys — `tasks: list[TaskRead]`, `locations: list[LocationRead]`, etc., each parent carrying its own join sets. The single shared `cursor` still means "everything across all tables up to here." Adding a table = adding a key, never restructuring this envelope.

### 2. Route — `app/routes/sync.py`

A `GET /sync/pull` endpoint:

1. Query param `since: int = 0` (validate `>= 0`).
2. Select captures where `row_version > since`, **ordered by `row_version` ascending**, **with no `deleted` filter**.
3. Compute `cursor`: if any rows returned, the max `row_version` (which is the last one, given the ordering); else `since`.
4. Return `SyncPullResponse(captures=[...], cursor=cursor)`.

Register the router in `main.py` (`app.include_router(...)`) like the others. Keep it fully `async`/`await`.

> **Why captures-only for now:** the client doesn't need the `users` list to render captures, so the walking skeleton stays lean. The envelope is shaped to add tables later without breaking existing clients.

---

## Acceptance check (in order)

1. Server starts; `GET /health` still `{"db":true}`.
2. `GET /sync/pull?since=0` → returns the Milestone-1 capture; `cursor` equals that capture's `row_version` (e.g. `3`).
3. `GET /sync/pull?since=3` (use the cursor from step 2) → `captures` is `[]` and `cursor` is `3` (unchanged — the client stays put).
4. **Incremental:** `POST /captures` a second capture (new `id`). It gets a higher `row_version` (e.g. `4`). `GET /sync/pull?since=3` → returns **only** the new capture, `cursor` `4`. (The first capture is *not* re-sent — proves strict `>`.)
5. **Tombstone:** in psql, soft-delete the first capture directly —
   ```sql
   UPDATE captures SET deleted = true WHERE id = '11111111-1111-1111-1111-111111111111';
   ```
   The trigger bumps its `row_version` (e.g. to `5`). `GET /sync/pull?since=4` → returns that capture with `deleted: true` and `row_version: 5`. This proves deletions propagate **and** that the trigger fires on a raw SQL update (not just ORM writes) — the robustness we chose triggers for.

If all five hold, Milestone 2 is done and the full server-side round trip (store → hand back, incrementally, with tombstones) is proven.

---

## Guardrails

- **DON'T** filter out `deleted = true` rows — tombstones must be returned or deletions never sync.
- **DON'T** use `>=`; use strict `row_version > since`.
- **DO** return `cursor = max(row_version of returned rows)`, or echo `since` when nothing is returned.
- **DO** order results by `row_version` ascending so the client applies them in order and the last row is the new cursor.
- **DO** keep it read-only (`GET`) and async. No new tables or migrations this milestone.
- **DO** keep the response envelope `{ captures: [...], cursor: N }` so later tables are additive.