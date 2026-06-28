# Phase 3 · Milestone 1 — Locations exist and sync (backend)

**Goal:** real, named places. This adds the **`locations`** table (a nested tree of pastures, gates, buildings, rooms) and its vocabulary table **`location_types`** — your first true *lookup* table. It wires `location_id` into register, closes the deferred FK on `tasks.location_id`, and extends `GET /sync/pull` to carry locations and their types.

**You'll know it worked when:** `pull` returns a seeded set of `location_types`, you can create a location (and a child under it), registering a capture with a `location_id` sets the task's location, and the whole thing syncs under one cursor.

---

## Context for the agent

Continues Holler. Phase 2 complete: `captures` + `tasks` tables, `POST /captures/{id}/register` (atomic, idempotent), `GET /sync/pull` returning `{ captures, tasks, cursor }`. The global `row_version_seq` + `set_row_version` trigger function exist — **reuse them; add only the new per-table triggers.** `tasks.location_id` is currently a **plain UUID with no FK** (locations didn't exist yet) — that gets its real constraint here.

**Scope:** this is "named places you can attach to tasks," **not** the map. No pins, no Google Earth, no KML import — that's Phase 7. No frontend picker — that's Milestone 2. No conditions/traits — that's Phase 6.

---

## The lookup-table pattern (read first — it debuts here and recurs)

`location_types` (pasture, gate, building, room, water, …) is a **lookup table: rows, not a DB enum.** The whole point is that adding "garden" or "deep storage" later is a one-row insert, never a migration. But — per the build-plan convention — **a lookup is still a full entity table:** it carries the audit columns (`created_at`, `updated_at`, `deleted`, `deleted_at`), a `row_version` with its trigger, and it **syncs via pull** like any other table (the client needs the vocabulary to render). Don't treat it as special or static. Phase 6's `conditions` vocabulary will copy this exact pattern, so get it right here.

---

## Steps

### 1. Model — `app/models/location_type.py` (the lookup)

`LocationType`: `id` (UUID PK, client-generated), `name` (Text, **unique**, not null), `sort` (Integer, default 0), the standard audit columns, and `row_version` (`FetchedValue()` pattern). Add to `app/models/__init__.py`.

### 2. Model — `app/models/location.py` (the tree)

`Location`:

| column | type | notes |
|---|---|---|
| `id` | UUID, PK | client-generated |
| `name` | Text, not null | |
| `code` | Text, nullable | surveyor-style display id (e.g. `N-PAST · TANK-01`); user-set for now (auto-derivation is a later nicety) |
| `type_id` | UUID, **FK → location_types.id** | |
| `parent_id` | UUID, nullable, **self-FK → locations.id** | the tree: North Pasture *contains* Tank-01. Add `CHECK (parent_id <> id)` (no self-parent) |
| `lat` / `lng` | Double, nullable | for Phase 7's map; no behavior yet |
| `geometry` | JSONB, nullable | for Phase 7 drawn zones (GeoJSON); no behavior yet |
| `notes` / `photo_url` | Text, nullable | |
| `created_by` | UUID, not null | owner stub |
| audit + `row_version` | | standard, `FetchedValue()` |

Add to `app/models/__init__.py`.

> Descendant-cycle prevention (making a location a child of its own descendant) only becomes possible if you add a *re-parent* feature later — defer that check until then. The `CHECK (parent_id <> id)` covers the only cycle reachable at create time.

### 3. Migration — new file (both tables)

`alembic revision --autogenerate -m "create location_types and locations"`. Autogenerate makes both tables; **hand-add a trigger for each** (the standing per-table step), reusing `set_row_version`:

```python
op.execute("CREATE TRIGGER trg_location_types_row_version BEFORE INSERT OR UPDATE ON location_types FOR EACH ROW EXECUTE FUNCTION set_row_version()")
op.execute("CREATE TRIGGER trg_locations_row_version BEFORE INSERT OR UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION set_row_version()")
```

Drop both triggers in `downgrade()`, before the tables are dropped.

**Close the deferred FK — autogenerate will NOT do this for you.** Because `tasks.location_id` *already exists* as a plain UUID column, autogenerate only sees the two new tables and won't detect that the column should now be a foreign key. So **hand-add it as a separate statement in the same migration:** `op.create_foreign_key('fk_tasks_location', 'tasks', 'locations', ['location_id'], ['id'])` (dropped in downgrade). It stays **nullable** — a task can be locationless / off-property. Same arc you closed for `promoted_task_id` last phase. Don't assume you're done just because autogenerate produced the two tables.

Then `alembic upgrade head`.

### 4. Seed the starter location types — extend `app/seed.py`

Idempotently seed a starter set so the client has types to pick immediately (insert-if-not-exists by `name`): **pasture, field, gate, building, room, water, fence line, equipment pad, other**. Idempotent like the owner-user seed.

> **Use deterministic ids** — e.g. `uuid5(NAMESPACE, name)` for each type — so the same type has the same id across every environment (dev, test, prod) and the seed stays idempotent by id as well as by name. In acceptance checks you can just read the id you need out of the `pull` response by `name`.

### 5. Schemas — `app/schemas/location.py`

- `LocationTypeRead` — full view (incl. `row_version`).
- `LocationRead` — full view (incl. `parent_id`, `code`, `type_id`, `row_version`).
- `LocationCreate` — client-submittable: **`id` (required, client-generated UUID)**, `name`, `type_id`, optional `code`, `parent_id`, `lat`, `lng`, `notes`. **Deliberately omit `photo_url` and `geometry`** — `photo_url` is set by a future upload flow, and `geometry` is Phase 7. (Not `row_version`/`created_by`/audit either.) The model has those columns; the create schema intentionally doesn't.
- (Optional) `LocationTypeCreate` — `id`, `name`, `sort?` — for adding new types beyond the seed.

### 6. Routes

- `POST /locations` — create a location from `LocationCreate`. `created_by` = owner stub. **Idempotent by `id`, same pattern as `POST /captures`**: `INSERT ... ON CONFLICT (id) DO NOTHING`, then read the row back — `201` if newly inserted, `200` if the id already existed. **Validate `type_id` exists, and `parent_id` exists when non-null, *before* insert** — return `400`/`422` on bad input rather than letting the raw FK `IntegrityError` escape as a `500` (the same hazard Step 7 flags for register applies here). Register the router.
- (Optional) `POST /location-types` — add a new type row.

### 7. Wire location into register

Extend `RegisterRequest` with an **optional** `location_id`. In the register route, set `task.location_id` from it when present. **Validate it exists** — if a non-null `location_id` doesn't match a location, return `400`/`422` rather than letting the raw FK `IntegrityError` escape as a `500`. (The capture's `location_hint` is *not* auto-resolved — the user picks; that's the frontend's job in M2.)

> **Idempotent re-register does not update.** If a capture is already `registered` and someone calls register again (even with a *different* `location_id`), return the existing task **as-is** — the second call's `location_id` is ignored. Idempotent means "same result regardless of re-call"; don't add update-on-re-register logic. (Editing a task's location later is a separate, future edit endpoint.)

### 8. Extend `GET /sync/pull`

The envelope gains two more keys: `{ captures, tasks, locations, location_types, cursor }`. Query all four tables for `row_version > since` (no `deleted` filter on any), `cursor` = max `row_version` across **all** returned rows (still one global cursor). Update `SyncPullResponse` with `locations: list[LocationRead]` and `location_types: list[LocationTypeRead]`.

---

## Acceptance check (in order)

1. Server starts; `GET /health` `{"db":true}`; `alembic upgrade head` applied both tables + both triggers; seed ran.
2. `GET /sync/pull?since=0` → includes a `location_types` array with the 9 seeded types (each with a `row_version`).
3. `POST /locations` with `{ id: "<uuid-A>", name: "North Pasture", type_id: <pasture's id> }` → `201`, `row_version` set. Then create a child: `POST /locations` with `{ id: "<uuid-B>", name: "Big Stock Tank", type_id: <water's id>, parent_id: "<uuid-A>", code: "N-PAST · TANK-01" }` → `201`. (Client supplies the `id`s — grab the type ids from the `pull` response by name.)
4. `GET /sync/pull?since=0` → `locations` array has both, the child's `parent_id` points at the parent; `cursor` spans every table.
5. **Register with a location:** `POST /captures/{id}/register` with `{ title: "...", location_id: <the tank's id> }` → the resulting task's `location_id` is set; a pull shows the task carrying it.
6. **FK is real now:** register (or `POST /locations`) with a bogus `location_id`/`type_id` → `400`/`422` (handled), **not** a `500`. Proves the deferred FK constraint is enforced.
7. **No self-parent:** `POST /locations` with `parent_id == its own id` is rejected by the `CHECK`.

If all seven hold, Milestone 1 is done — places exist, nest, sync, and tasks can point at them.

---

## Guardrails

- **DO** add `trg_location_types_row_version` and `trg_locations_row_version` (reusing `set_row_version`) — two new per-table triggers. Don't recreate the sequence/function.
- **DO** treat `location_types` as a **lookup of rows, not an enum**, but still a **full syncing entity table** (audit cols + `row_version` + trigger + appears in pull). This pattern recurs in Phase 6.
- **DO** add both models to `app/models/__init__.py` before autogenerate.
- **DO** add the real `tasks.location_id → locations.id` FK now (nullable). Close the deferred arc.
- **DO** make `locations.parent_id` a nullable self-FK with `CHECK (parent_id <> id)`; defer descendant-cycle checks until a re-parent feature exists.
- **DO** validate references and return `400`/`422` on bad input — `type_id`/`parent_id` on `POST /locations` **and** `location_id` on register. Never let a raw FK `IntegrityError` become a `500`. This applies on the locations route too, not just register.
- **DO** seed location types with **deterministic ids** (`uuid5` from name) so they're stable across environments.
- **DO** remember the `tasks.location_id` FK is a **separate manual `op.create_foreign_key`** in the migration — autogenerate won't add it (the column already exists).
- **DO** keep one global `cursor` across all tables in pull; no `deleted` filter anywhere.
- **DON'T** build the map, pins, lat/lng behavior, or KML — Phase 7. The `geometry`/`lat`/`lng` columns exist but carry no logic.
- **DON'T** build the frontend location picker — that's Milestone 2.
- **DON'T** auto-resolve a capture's `location_hint` into a `location_id` — the user picks (M2).
- **DON'T** build conditions/traits — Phase 6.