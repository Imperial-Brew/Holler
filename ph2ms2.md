# Phase 2 · Milestone 2 — The register view (frontend)

**Goal:** make registration usable. A desk view that shows captures waiting to be registered, lets you give one a title + due date, and turns it into a task you can see — your grandfather's two-phase notebook on screen: jots on one side, committed tasks on the other.

**You'll know it worked when:** you pick a pending capture, fill in a title and due date, hit Register, and it leaves the "to register" list while a task appears in the "Tasks" list — and it all survives a page refresh and matches the server.

---

## Context for the agent

Continues Holler. Backend M1 (this phase) is done: `POST /captures/{id}/register` (atomic, idempotent, returns `{ task, capture }`), and `GET /sync/pull` now returns `{ captures, tasks, cursor }`. The frontend (Vite 6 + React, `frontend/`) already has Dexie (`captures` + `meta` stores), `sync.js` with `pull` / `applyPull` / `createCapture` / `flush` / `sync`, and an offline-capable capture flow.

**Registration is online-only by design** — unlike capture, it's a normal authenticated call to the server, not an offline-queued action. Capture stays offline-capable; register requires a connection.

> **One naming trap to keep straight:** there are two different "pending" concepts. `capture.status === 'pending'` is the **lifecycle** state (jotted but not yet registered). `pendingPush` is the **sync** flag from Milestone 4 (created locally, not yet confirmed by the server). A capture can be both at once. Don't conflate them.

---

## Steps

### 1. Dexie — add a `tasks` store — `frontend/src/lib/db.js`

Add a second store, `tasks`, keyed by `id` (same shape rules as `captures`). Bump the Dexie schema version (`db.version(2).stores({ captures: 'id', tasks: 'id', meta: 'key' })`). No boolean indexes.

> **Bumping the version with a new store is safe** — Dexie applies additive schema changes without touching existing stores, so the `captures` and `meta` data is preserved. No data migration needed; don't do anything exotic to "protect" the existing data.

### 2. Extend `applyPull` for tasks — `frontend/src/lib/sync.js`

`applyPull` now merges **both** arrays from the envelope. Same per-row branch you already use for captures, applied to each table:
- for each `captures` row: `deleted` → delete from `db.captures`; else upsert.
- for each `tasks` row: `deleted` → delete from `db.tasks`; else upsert.
- persist `response.cursor` to `meta`.

> **Expand the existing transaction to cover all three stores** — `db.captures`, `db.tasks`, **and** `db.meta` — in one `db.transaction('rw', ...)`. If the task writes land outside the transaction that advances the cursor, a partial failure could move the cursor past tasks that never got written, and they'd be skipped forever. All-or-nothing across the three stores.

> **Optional hardening (recommended, prevents the register/sync race below):** make each upsert **last-write-wins by `row_version`** — only overwrite a local row when the incoming row's `row_version` is `>=` the local row's. A stale row from an in-flight pull (lower `row_version`) then can't clobber a fresher local row (e.g. a just-registered capture). This is the generally-correct LWW rule and it's cheap; it costs one read-before-write in the merge. Skip it if you want M2 minimal, but it's the clean fix for the race noted in Step 4.

### 3. `registerCapture(captureId, { title, due_date })` — `frontend/src/lib/sync.js`

Online-only. `POST /captures/${captureId}/register` with `{ title, due_date }`. On success the response is `{ task, capture }` — write **both** straight to Dexie for an instant UI update:
- `db.tasks.put(task)` (the new task, with its real `row_version`),
- `db.captures.put(capture)` (now `status: 'registered'`, `promoted_task_id` set, `pendingPush: false`).

A later `pull()` reconciles the same rows by id (idempotent — no duplicates). Surface errors to the caller (no offline queue here). **A basic error display is sufficient** — a `try/catch` in the UI showing an `alert` or a small inline message. Don't build a toast/notification system for this.

### 4. View — `frontend/src/App.jsx` (split into small components if you like)

Two sections, both reading from Dexie via `useLiveQuery`:

- **To register** — captures where `status === 'pending'` **and** `!deleted` **and** `!pendingPush` (only server-synced captures are registerable — an unsynced one would 404). For each: show `raw_text`, the `location_hint` as **read-only context** (the location *picker* is Phase 3 — for now you just see the hint), and a **Register** action.
  - Register opens a small inline form **pre-filled with `title = raw_text`** plus an optional `due_date` input → submit calls `registerCapture(...)`. On success the capture flips to `registered` and drops out of this list.
  - **Disable the Register/submit button while the request is in flight** (a `submitting` state). The backend is idempotent so a double-click isn't dangerous, but the second click would return the existing task (`200`) and look confusing. One guard prevents it.
  - **Gate Register on connectivity:** if `!navigator.onLine`, disable the Register controls with a short hint ("Connect to register"). Capture creation must still work offline.
- **Tasks** — everything in `db.tasks` (`!deleted`), as a plain list: `title`, `due_date`, `status`. This is the proto-board; the real Board UI comes later.

Keep the existing add-capture input, online/offline indicator, and Sync button. Still unstyled/minimal — plumbing, not the mockup.

---

## Acceptance check (in order)

1. App loads and syncs. The task(s) created during M1 testing appear under **Tasks**. Captures still at `status: 'pending'` appear under **To register**; any already-`registered` capture does **not**.
2. Register a pending capture: the inline form is pre-filled with its text; set a due date; submit → it **disappears** from *To register* and a matching task **appears** under *Tasks* (with the title and due date), no page reload.
3. **Refresh the page.** State persists from Dexie: the task is still there, the registered capture is still absent from *To register*. (Proves local persistence and that the register stuck.)
4. **Server agreement:** in `/docs`, `GET /sync/pull?since=0` shows that task and that capture as `registered` with matching ids.
5. **No duplicates:** click **Sync** → the task isn't duplicated and nothing flickers (the pull upserts the same rows by id).
6. **Offline gate:** go offline (DevTools → Offline). Register controls disable with the hint; the add-capture input still creates a capture (shows pending). Back online → it syncs and becomes registerable.

If all six hold, **Phase 2 is complete** — captures become tasks, and both halves of the notebook are visible and synced.

> **Known v1 quirk (acceptable):** if a background `sync()` fires *during* an in-flight register, a pull can briefly write the capture back as `pending` (a flicker in *To register*) before the register response lands. It self-heals on the next pull. The optional `row_version` LWW hardening in Step 2 eliminates it; without that, it's a harmless single-user cosmetic blip — don't add complexity beyond Step 2's option to chase it.

---

## Guardrails

- **DO** add a `tasks` Dexie store and extend `applyPull` to merge tasks with the same `deleted`→delete / else→upsert logic. Bump the Dexie schema version (additive, data-safe).
- **DO** run `applyPull` in **one transaction across all three stores** (`captures`, `tasks`, `meta`) so the cursor can't advance past unwritten rows.
- **DO** write both returned rows (the task **and** the updated capture) to Dexie on register for an instant UI; let a later pull reconcile.
- **DO** disable the Register button while the request is in flight, and show a basic inline/`alert` error on failure (no toast system).
- **DO** gate Register on **online** *and* on the capture being **synced** (`!pendingPush`) — registering an unsynced or offline capture would 404.
- **DO** pre-fill the title from `raw_text`; show `location_hint` read-only (the location picker is Phase 3).
- **DON'T** make register offline-queued — it's online-only. Capture creation stays offline-capable.
- **DON'T** conflate `capture.status === 'pending'` (lifecycle) with `pendingPush` (sync flag).
- **DON'T** build the real Board, dependencies, or readiness — *Tasks* is a plain list this milestone.
- **DON'T** style heavily — still plumbing; the mockup Board comes in a later phase.