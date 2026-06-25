# Holler — Build Plan & Handoff

*Offline-first, location-aware property task manager. ("Holler" is a working name.)*
*This doc is written to be handed to a coding agent (Claude Code / PyCharm Junie). It defines the model, the non-negotiable decisions, the build order, and the sync contract. Build in the order given. Do not skip the walking skeleton.*

---

## 0. The one-paragraph mental model

The app is a generic **places + things + tasks** engine; "property management" is just use case #1. There are two modes of use, deliberately split:

- **Capture** — all day, offline, dead simple. A quick note (where + a few words) appended to a local queue. This is append-only: the field never edits existing records.
- **Register** — at night, at a desk, online. Promote each capture into a real task with dependencies, tools, dates, and assignments.

A pocket-note from you and a request from an outsider (e.g. the cattle lessee) are the **same object** — both are captures that land in one inbox to be made real. Sync is just "flush the capture queue + pull what changed," run when the app opens or on demand. No live sync.

---

## 1. Decisions that are LOCKED (get these right; they're brutal to retrofit)

1. **Client-generated UUIDs for every primary key.** Never serial/auto-increment. Two offline phones must be able to create records without ID collisions. Use UUIDv7 (time-ordered) if available, else UUIDv4.
2. **Soft deletes only.** Every syncable row has `deleted boolean` + `deleted_at`. Never issue a hard `DELETE`. Hard deletes and offline sync do not mix (you can't sync the absence of a row).
3. **Store base status; compute Ready/Blocked.** A task's stored `status` is one of `open / in_progress / done / cancelled`. "Ready" and "Blocked" are **derived** from the dependency graph at read time. Never persist derived state.
4. **Dependencies and requirements are separate edge tables, not columns.**
   - Task→task = `task_dependencies` (a DAG; readiness cascades from direct edges).
   - Task→resource = `task_resources` (powers the shopping list *and* the reverse "while you have this tool" view).
5. **One condition vocabulary, two directions.** A `conditions` lookup (dry, conditioned, secure, shaded…). A **location provides** conditions; an **item requires** them. At-risk = item's required set ⊄ its location's provided set. (This collapses "traits" and "requirements" into one vocabulary — cleaner than two parallel lists.)
6. **Lookup tables, not DB enums, for open vocabularies.** `location_types`, `conditions` are rows you can add to. Adding "garden" or "deep storage" must be a row insert, never a migration. (Exception: `status` and `role` are genuinely fixed small sets — those may be constrained text.)
7. **Captures are append-only from clients in v1.** Clients create captures offline; they do not edit existing server rows offline. This is what keeps sync trivial.
8. **Alembic migrations from commit #1.** The schema will change constantly. Every change is a migration.

---

## 2. Architecture

| Layer | Choice | Why |
|---|---|---|
| API | FastAPI + SQLModel/SQLAlchemy | Same stack as existing RFQ tooling |
| DB | Postgres | Multi-user; needed for shared state |
| Migrations | Alembic | Schema will churn |
| Client | React PWA (Vite) + service worker | Installs to home screen, cross-platform, offline-capable |
| Local store | IndexedDB via Dexie | Capture queue + read cache |
| Deploy | Render | Known quantity |
| Auth | Start with simple email/password or a single shared-tenant login; add roles (below) | Don't over-build auth in v1 |

---

## 3. Roles & permissions (decide before writing routes)

`users.role` ∈ `{ owner, member, requester }`:

- **owner** (you): everything, plus manage users/roles and the lookup tables.
- **member** (family): full create/edit on tasks, locations, items, resources.
- **requester** (outsiders, e.g. the lessee): may **only** create captures (`POST /captures`). Cannot post directly to the board, cannot read everything.

Guard at the route layer: task/location/item/resource writes require `owner|member`. `requester` is limited to the capture endpoint. This is one field + a dependency on each route — trivial if designed in, painful if grafted on later.

---

## 4. Schema (Postgres)

> All `id` are UUID PKs generated client-side. All syncable tables carry `created_by`, `created_at`, `updated_at` (server-set on every write), `deleted`, `deleted_at`. Omitted below for brevity except where noted — **apply to every table.**

```sql
-- ===== users =====
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member','requester')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ
);

-- ===== lookups (rows, not enums) =====
CREATE TABLE location_types (        -- pasture, field, gate, building, room, water, fenceline, pad, garden, ...
  id UUID PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort INT DEFAULT 0
);
CREATE TABLE conditions (            -- dry, conditioned, secure, shaded, covered, ...
  id UUID PRIMARY KEY, name TEXT NOT NULL UNIQUE
);

-- ===== locations (self-referencing tree) =====
CREATE TABLE locations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,                          -- display/scan ID, e.g. 'N-PAST · TANK-01'
  type_id UUID REFERENCES location_types(id),
  parent_id UUID REFERENCES locations(id),   -- North Pasture contains Tank-01
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  geometry JSONB,                     -- optional GeoJSON for drawn zones (KML import target)
  notes TEXT, photo_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false, deleted_at TIMESTAMPTZ
);
CREATE TABLE location_conditions (   -- conditions a location PROVIDES
  location_id UUID REFERENCES locations(id),
  condition_id UUID REFERENCES conditions(id),
  PRIMARY KEY (location_id, condition_id)
);

-- ===== items (the "stuff") =====
CREATE TABLE items (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  location_id UUID REFERENCES locations(id),
  quantity NUMERIC DEFAULT 1,
  condition TEXT, notes TEXT, photo_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false, deleted_at TIMESTAMPTZ
);
CREATE TABLE item_conditions (       -- conditions an item REQUIRES
  item_id UUID REFERENCES items(id),
  condition_id UUID REFERENCES conditions(id),
  PRIMARY KEY (item_id, condition_id)
);

-- ===== resources (tools & materials) =====
CREATE TABLE resources (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tool','material')),
  owned BOOLEAN NOT NULL DEFAULT true,         -- tool you have vs. must acquire
  location_id UUID REFERENCES locations(id),   -- where an owned tool is stored
  est_cost NUMERIC,                            -- for materials / rentals
  available_until DATE,                        -- for rented/borrowed tools -> drives batching urgency
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false, deleted_at TIMESTAMPTZ
);

-- ===== tasks =====
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  location_id UUID REFERENCES locations(id),   -- NULLABLE: a task with no location is a normal to-do (works off-property)
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  priority INT DEFAULT 0,
  est_effort_min INT,
  assigned_to UUID REFERENCES users(id),
  recurrence_rule TEXT,                         -- store now (e.g. 'FREQ=MONTHLY'); generation engine deferred
  series_id UUID,                               -- groups instances of a recurring series
  origin_capture_id UUID,                       -- which capture this was promoted from
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  deleted BOOLEAN NOT NULL DEFAULT false, deleted_at TIMESTAMPTZ
);

-- ===== dependencies (task -> task, a DAG) =====
CREATE TABLE task_dependencies (
  task_id UUID REFERENCES tasks(id),           -- this task...
  depends_on_id UUID REFERENCES tasks(id),     -- ...waits on this one
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)             -- no self-loop; full cycle check enforced in app (see 5.3)
);

-- ===== requirements (task -> resource) =====
CREATE TABLE task_resources (
  task_id UUID REFERENCES tasks(id),
  resource_id UUID REFERENCES resources(id),
  quantity NUMERIC DEFAULT 1,
  PRIMARY KEY (task_id, resource_id)
);

-- ===== captures (the pocket notebook + the requester inbox) =====
CREATE TABLE captures (
  id UUID PRIMARY KEY,                          -- client-generated; created offline
  raw_text TEXT NOT NULL,                       -- "fix latch county rd gate, ~1mo"
  location_hint TEXT,                           -- free text OR resolved later
  location_id UUID REFERENCES locations(id),    -- optional if user picked one
  source TEXT NOT NULL DEFAULT 'self' CHECK (source IN ('self','request')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','registered','dismissed')),
  promoted_task_id UUID REFERENCES tasks(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false, deleted_at TIMESTAMPTZ
);
```

---

## 5. Core logic

### 5.1 Readiness (Board: Ready vs Blocked)

You only ever check **direct** prerequisites. Transitivity cascades for free.

```sql
-- READY = open task with zero unfinished direct prerequisites
SELECT t.* FROM tasks t
WHERE t.status = 'open' AND t.deleted = false
AND NOT EXISTS (
  SELECT 1 FROM task_dependencies d
  JOIN tasks p ON p.id = d.depends_on_id AND p.deleted = false
  WHERE d.task_id = t.id AND p.status <> 'done'
);
-- BLOCKED = the complement: open tasks that DO have an unfinished prerequisite.
```

When a prerequisite flips to `done`, its dependents recompute to Ready automatically — no tree walk. Walk the tree only to *display* a full blocking chain (recursive CTE, optional):

```sql
WITH RECURSIVE chain AS (
  SELECT depends_on_id AS id FROM task_dependencies WHERE task_id = :task_id
  UNION
  SELECT d.depends_on_id FROM task_dependencies d JOIN chain c ON d.task_id = c.id
)
SELECT * FROM tasks WHERE id IN (SELECT id FROM chain) AND status <> 'done';
```

### 5.2 "While you have it" (tool batching) — the reverse lookup

Because requirements are their own table, group open work by a tool:

```sql
-- everything still to do that needs a given tool
SELECT t.* FROM tasks t
JOIN task_resources tr ON tr.task_id = t.id
WHERE tr.resource_id = :resource_id
  AND t.status = 'open' AND t.deleted = false;
```

Surface this proactively: any owned/rented resource with an `available_until` within N days → show "You have the lift until Fri — 4 tasks need it." Also drives the **shopping list**: sum `est_cost` of `material` resources across all open tasks not yet acquired.

### 5.3 Cycle prevention (enforce in app before inserting a dependency)

Before inserting edge `(task=A, depends_on=B)`, reject if **A is already (transitively) a prerequisite of B** (that would create a loop):

```sql
WITH RECURSIVE ancestors AS (
  SELECT depends_on_id AS id FROM task_dependencies WHERE task_id = :B
  UNION
  SELECT d.depends_on_id FROM task_dependencies d JOIN ancestors a ON d.task_id = a.id
)
SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = :A);  -- if true, reject the edge
```

### 5.4 At-risk items (the storage flag)

```sql
-- items whose required conditions aren't all provided by their location
SELECT i.* FROM items i
WHERE i.deleted = false AND EXISTS (
  SELECT 1 FROM item_conditions ic
  WHERE ic.item_id = i.id
  AND NOT EXISTS (
    SELECT 1 FROM location_conditions lc
    WHERE lc.location_id = i.location_id AND lc.condition_id = ic.condition_id
  )
);
```

---

## 6. The sync contract

Two operations, run on app open / manual "sync" / a twice-daily schedule. No websockets.

**PUSH (clients → server): captures only, append-only.**
- Client holds an outbox of locally-created captures (with their client UUIDs) in IndexedDB.
- `POST /sync/push` with the array. Server upserts by `id` (idempotent — re-sending is safe).
- Server never rejects on conflict because captures are create-only.

**PULL (server → clients): everything changed since last watermark.**
- Client stores `last_synced_at`.
- `GET /sync/pull?since=<last_synced_at>` → all rows (all tables) where `updated_at > since`, **including tombstoned rows** (so deletes propagate).
- Client applies them to its read cache; advances `last_synced_at` to the server's response time.

**Conflict rule:** last-write-wins by `updated_at`. Acceptable because real edits happen at the desk (online, effectively single-writer). Captures can't conflict. Revisit only if genuine concurrent offline edits become real — then consider ElectricSQL / PowerSync (self-hostable). Not in v1.

---

## 7. Build order — walking skeleton first, then breadth

**Do not build all five screens up front.** Build one vertical slice end-to-end; it de-risks ~80% of the project (the offline round-trip is the only genuinely hard part, and the capture/append-only model makes even that easy).

**Phase 0 — Plumbing.** Repo, Render service, Postgres, Alembic baseline, auth stub, `users` table, health check.

**Phase 1 — Walking skeleton (the slice that matters).**
- PWA installable, service worker, Dexie outbox.
- Create a **capture offline** (airplane mode) → it persists locally.
- `POST /sync/push` on reconnect → capture lands on server.
- `GET /sync/pull` on the web/desk view → the capture appears.
- **Acceptance:** kill wifi, jot 3 captures from the phone, restore wifi, open the desk view → all 3 are there. If this works, the architecture is proven.

**Phase 2 — Register.** Promote a capture → task at the desk (set title, location, due). Capture flips to `registered`, links `promoted_task_id`.

**Phase 3 — Locations.** `location_types` lookup, the tree (`parent_id`), `code` field. Capture/registration can attach a location.

**Phase 4 — Dependencies + Board.** `task_dependencies`, cycle check (5.3), readiness query (5.1). Board screen renders Ready/Blocked + "What I can do now" filter.

**Phase 5 — Resources.** `resources` + `task_resources`. Shopping-list rollup and the "while you have it" view (5.2), including `available_until` nudges.

**Phase 6 — Stuff + at-risk.** `items`, `conditions`, the two condition joins, the at-risk flag (5.4).

**Phase 7 — Map (polish).** Pins from lat/lng; then KML/GeoJSON import for drawn pasture zones into `locations.geometry`.

**Phase 8 — Requester inbox.** `requester` role + the capture inbox UI (your notes and outsider requests share it; approve → register).

**Phase 9 — Recurrence engine (last).** A job that reads `recurrence_rule` and spawns task instances sharing a `series_id`. Tables already assume "instance of a series," so this is additive.

---

## 8. Guardrails for the coding agent (do / don't)

- **DO** generate UUIDs client-side for every PK. **DON'T** use `SERIAL`/`BIGSERIAL`/auto-increment.
- **DO** soft-delete (`deleted` + `deleted_at`) and propagate tombstones in pull. **DON'T** hard-`DELETE` anything syncable.
- **DO** store `status ∈ {open,in_progress,done,cancelled}` and **compute** Ready/Blocked. **DON'T** persist Ready/Blocked.
- **DO** model dependencies and resources as the two join tables shown. **DON'T** put them as columns or arrays on `tasks`.
- **DO** use one `conditions` vocabulary with two directional joins. **DON'T** create separate "traits" and "requirements" lists.
- **DO** use lookup tables for `location_types` and `conditions`. **DON'T** use Postgres `ENUM` for these (migration pain on every new value).
- **DO** keep captures append-only from clients in v1. **DON'T** let the field client edit existing server rows offline yet.
- **DO** set `updated_at` server-side on every write; pull by watermark. **DON'T** trust client clocks for `updated_at`.
- **DO** an Alembic migration for every schema change from day one.
- **DO** enforce the cycle check (5.3) before inserting any dependency edge.

---

## 9. Still open (answer when you reach them; none block Phase 1)

- Photo storage target (local/object store) — needed by Phase 6/7, not before.
- KML source format from your Google Earth export — confirm at Phase 7.
- Whether recurrence needs full RRULE or just simple intervals — decide at Phase 9.
- Auth: shared family login vs. per-user accounts — only matters once `requester` role lands (Phase 8); per-user is cleaner if outsiders will use it.