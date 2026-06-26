# Phase 3 · Milestone 2 — Location picker + add-place tool (frontend)

**Goal:** make locations usable. Sync places to the client, add a minimal tool to create them, put a searchable **location picker** in the register form, and show each task's place — with its surveyor code — in the list. This is where `N-PAST · TANK-01` shows up on screen for the first time.

**You'll know it worked when:** you can add a place, register a capture *to* that place, and see the task list it under its name and code — all surviving a refresh and matching the server.

---

## Context for the agent

Continues Holler. Phase 3 M1 (backend) is done: `locations` + `location_types` tables, `POST /locations` (idempotent, validated), `RegisterRequest` now takes an optional `location_id`, and `GET /sync/pull` returns `{ captures, tasks, locations, location_types, cursor }`. The frontend (Vite 6 + React, `frontend/`) has Dexie (`captures`, `tasks`, `meta`), `sync.js` (`pull`/`applyPull`/`createCapture`/`flush`/`registerCapture`/`sync`), the two-section register view, and the online/offline indicator.

**Decisions for this milestone:** the picker is **flat + searchable** (the nested-tree UI is a later refinement). Location creation is **online-only**, like register — adding a place needs a connection (field/offline place-creation can reuse the capture outbox pattern later; don't build that now).

> Apply the transaction-scope lesson from Phase 2: when `applyPull` writes the new tables, **all stores go in one transaction** (see Step 2).

---

## Steps

### 1. Dexie — add two stores — `frontend/src/lib/db.js`

Add `locations` and `location_types`, both keyed by `id`. Bump to `db.version(3).stores({ captures:'id', tasks:'id', locations:'id', location_types:'id', meta:'key' })`. Additive and data-safe (Dexie preserves existing stores). No boolean indexes.

### 2. Extend `applyPull` — `frontend/src/lib/sync.js`

Merge the two new arrays from the envelope with the same per-row branch (`deleted` → delete; else upsert), into `db.locations` and `db.location_types`. **Expand the existing transaction to cover all five stores** — `captures`, `tasks`, `locations`, `location_types`, `meta` — so the cursor can't advance past unwritten rows.

### 3. `createLocation(...)` — `frontend/src/lib/sync.js`

Online-only. Generate the `id` with `crypto.randomUUID()`, `POST /locations` with `{ id, name, type_id, parent_id?, code?, lat?, lng?, notes? }`. On success, **write the full server response object (`LocationRead`) to `db.locations` as-is — don't strip or reshape it** (the extra fields like `row_version`/`created_at` belong there; a later pull reconciles by id). Surface errors to the caller (basic `alert`/inline message; no toast system).

### 3b. Update `registerCapture` to pass `location_id` — `frontend/src/lib/sync.js`

**Separate, easily-missed change:** `registerCapture` currently sends only `title`/`due_date`. Add **`location_id`** to its arguments and include it in the `POST /captures/{id}/register` body (the backend already accepts it). Without this, the picker in Step 6 will collect a location that never reaches the server.

### 4. A reusable `LocationPicker` component

Flat + searchable, reads `db.locations` via `useLiveQuery`:
- a text filter matching on **`name` or `code`**;
- each option shows `name`, its `code` (if any), and a bit of context — its **type name** and **parent name**, both resolved by client-side lookup (`type_id` → `location_types`, `parent_id` → `locations`);
- selectable, and **clearable** (selecting nothing is valid — locationless is allowed).

> **Degrade gracefully before sync completes:** on a cold start the picker may render before `location_types`/parent rows are in Dexie, so a lookup can return `undefined`. Handle it — show the location's `name` (and `code`) alone, skipping the type/parent context, rather than rendering "undefined". The context fills in once sync lands.

This component is reused in two places below (register's location field, and the add-place form's parent field).

### 5. Add-place form (the creation tool)

A small form: `name` (required), **type** (dropdown from `db.location_types`), optional **parent** (the `LocationPicker`), optional `code`. Submit → `createLocation(...)`. **Online-gated:** if `!navigator.onLine`, disable it with a short hint. Disable the submit button while the request is in flight.

> **Two scope notes:** (1) `code` is **plain free text** the user types — no format enforcement, no character transformation, no auto-generation (auto-deriving codes from parent+type is a later enhancement). The `N-PAST · TANK-01` example is just illustrative; whatever the user types is stored verbatim. (2) **Omit `lat`, `lng`, and `notes` from this form** even though `LocationCreate` accepts them — `lat`/`lng` come from the Phase 7 map and `notes` from a later detail/edit view. Don't add fields for every `LocationCreate` property.

### 6. Wire the picker into register + show place on tasks

- In the register form (from Phase 2 M2), add the `LocationPicker` as an optional field. Show the capture's `location_hint` next to it as a **helper label** ("hint: by the county road") — context only; don't auto-select from it. On submit, pass the chosen `location_id` (or none) to `registerCapture`.
- In the **Tasks** list, show each task's place: resolve `task.location_id` → `db.locations` and display `name` + `code` (or "—" / "no place" when null).

Keep it minimal/unstyled — still plumbing, not the mockup Board.

---

## Acceptance check (in order)

1. App loads and syncs. The add-place form's **type** dropdown shows the 9 seeded types; any locations created during M1 testing appear in the picker.
2. **Add a place:** create "North Pasture" (type pasture) → it appears. Create "Big Stock Tank" (type water, parent North Pasture, code `N-PAST · TANK-01` — typed verbatim; the middle dot is just what the user chose to type, not a required format) → it appears, showing its parent/type context.
3. **Register to a place:** register a pending capture, picking "Big Stock Tank" in the picker → the new task appears under **Tasks** showing that place's name and code. A `pull` (or `/docs`) confirms `task.location_id` is set.
4. **Refresh** → places, the picker, and the task↔place association all persist (Dexie).
5. **Server agreement:** `GET /sync/pull?since=0` shows the created locations and the task's `location_id`.
6. **Search:** typing in the picker filters by name and by code.
7. **Locationless still works:** register a capture without picking a location → task is created with no place, shown as "—", no error.
8. **Offline gate:** offline → the add-place form disables with its hint; capture creation still works; back online → new places sync.

If all eight hold, **Phase 3 is complete** — places exist, you can create and pick them, and tasks carry their location with its code on screen.

---

## Guardrails

- **DO** add `locations` + `location_types` Dexie stores (bump to version 3; additive, data-safe) and extend `applyPull` to merge both with the `deleted`→delete / else→upsert branch.
- **DO** run `applyPull` in **one transaction across all five stores** (`captures`, `tasks`, `locations`, `location_types`, `meta`).
- **DO** make `createLocation` **online-only** and gate the add-place form on connectivity; disable submit while in flight. (Offline place-creation is a later enhancement — don't build an outbox for it now.)
- **DO** update `registerCapture` to pass `location_id` through to the API (separate, easily-missed change).
- **DO** write the full server response to Dexie on `createLocation` as-is; don't reshape it.
- **DO** degrade the picker gracefully when lookups aren't synced yet (show name/code only, never "undefined").
- **DO** resolve `type_id` → type name and `parent_id`/`location_id` → location (name + code) by client-side lookup against the synced stores.
- **DO** keep the picker **flat + searchable** (name/code), clearable, with locationless allowed.
- **DON'T** add code-generation or character-transformation logic — `code` is verbatim free text.
- **DON'T** add `lat`/`lng`/`notes` fields to the add-place form — later features set those.
- **DON'T** make location creation offline-queued this milestone.
- **DON'T** build the nested-tree picker, the map/pins (Phase 7), or conditions/traits (Phase 6).
- **DON'T** auto-resolve a capture's `location_hint` into a selection — show it as a hint; the user picks.
- **DON'T** style heavily — still plumbing; the mockup Board comes later.