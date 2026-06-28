# Phase 4 · Milestone 3 — The Board (frontend)

**Goal:** the screen the whole app was sketched around. The client walks each task's `depends_on` edges to compute **Ready** vs **Blocked**, shows them in two sections, lights up the **"what can I do right now"** filter, and wires in completing, deleting, and editing dependencies. This is where the proto-list becomes the board.

**You'll know it worked when:** a task with an unfinished prerequisite sits under **Blocked** ("waiting on …"); completing that prerequisite moves it to **Ready** on its own; the filter hides everything but Ready; and adding/removing a dependency reshuffles the board live.

---

## Context for the agent

Continues Holler. All backend pieces exist: tasks carry a `depends_on: list[UUID]` in pull; `POST`/`DELETE /tasks/{id}/dependencies` manage edges (cycle-safe, `409` on cycle); `PATCH /tasks/{id}` sets status (completion stamps `completed_at`); `DELETE /tasks/{id}` soft-deletes (tombstone). The frontend has Dexie (`tasks` etc.), `useLiveQuery`, the `sync.js` helpers, and a readable picker pattern (the `LocationPicker`, dark-mode fixed).

**Styling is explicitly out of scope** — keep it minimal and functional. Do **not** build the field-instrument/mockup aesthetic; that's a later dedicated design pass. The only visual requirement: legible (no white-on-white; reuse the picker's dark styling for any new dropdown). All these mutations are **online-only** desk actions.

---

## The readiness computation (the heart of this milestone)

A **pure function** over the local tasks, recomputed every render (so the board updates live as Dexie changes):

```
byId = Map of id -> task, for all non-deleted tasks
for each task T that is NOT deleted and status !== 'done':
    blockers = T.depends_on
        .map(id => byId.get(id))
        .filter(dep => dep && dep.status !== 'done')   // present AND not done = blocks
    T.isReady   = blockers.length === 0
    T.blockers  = blockers                              // for "waiting on …" display
```

> The rule, precisely: a prerequisite blocks only if it resolves to a **local task that is present and not done.** A prereq that is `done`, or **absent** (soft-deleted → tombstoned → removed, so not in `byId`), does **not** block. Because this runs live off `useLiveQuery(db.tasks)`, completing or deleting a prerequisite frees its dependents automatically on the next render — no server round-trip, no manual refresh.

Bucket the non-deleted tasks: **Ready** (`isReady`, not done), **Blocked** (not `isReady`, not done), **Done** (`status === 'done'`).

---

## Steps

### 1. Client mutation helpers — `frontend/src/lib/sync.js`

Online-only; each returns the updated `TaskRead` → write it to Dexie for instant UI (a later pull reconciles). Surface errors to the caller (basic message; the cycle case returns `409`).

- `setTaskStatus(id, status)` → `PATCH /tasks/{id}` `{ status }`; `db.tasks.put(returned)`. (Used for done + reopen.)
- `deleteTask(id)` → `DELETE /tasks/{id}`; on success **remove it locally**: `db.tasks.delete(id)` (it's a tombstone; a later pull's tombstone is then a harmless no-op).
- `addDependency(taskId, dependsOnId)` → `POST /tasks/{taskId}/dependencies` `{ depends_on_id }`; `db.tasks.put(returned)`. On `409`, surface "that would create a cycle" — don't write anything.
- `removeDependency(taskId, dependsOnId)` → `DELETE /tasks/{taskId}/dependencies/{dependsOnId}`; `db.tasks.put(returned)`.

### 2. A `TaskPicker` component

Same flat-searchable pattern as `LocationPicker`, over `db.tasks` (non-deleted, not done). Used to add a prerequisite. **Exclude the task itself** from the options. (Don't pre-filter for cycles — let the backend reject with `409` and show the message; computing the cycle set client-side isn't worth it here.)

### 3. The Board — replace the flat Tasks list in `App.jsx`

Read tasks via `useLiveQuery(db.tasks)`, run the readiness function, render three sections:

- **Ready** — ready tasks. Each card: title, place (name + code, resolved as in Phase 3), due date, status; a **Done** button (`setTaskStatus(id,'done')`); a **Delete** button; and the dependency editor (Step 4).
- **Blocked** — blocked tasks. Same card, plus **"waiting on: …"** listing the `blockers`' titles (resolve blocker ids → titles).
- **Done** — completed tasks (dimmed/simple). A **Reopen** button (`setTaskStatus(id,'open')`).

### 4. Dependency editor on Ready/Blocked cards

- Show the task's current prerequisites as **chips** — resolve each `depends_on` id → that task's title (+ code); each chip has an **×** that calls `removeDependency(taskId, depId)`.
- An **"add prerequisite"** control using `TaskPicker` → `addDependency(taskId, picked)`. On a `409`, show a brief inline "would create a cycle" note.

### 5. The "What I can do now" filter

A single toggle near the top. On → show **only the Ready section** (hide Blocked and Done). Off → show all three. This is the mockup's hero interaction — make it obvious and instant.

> **Gate the mutations on connectivity:** Done/Reopen/Delete and add/remove-dependency are online-only — disable them (with a short hint) when `!navigator.onLine`. Capture creation stays offline-capable.

---

## Acceptance check (in order)

1. App loads/syncs. Existing open tasks appear under **Ready** (those with no unfinished prereqs) or **Blocked**; done tasks under **Done**.
2. **Create a dependency:** on task B, add prerequisite A (A is open) → B moves to **Blocked**, shows "waiting on A" and an A chip.
3. **Complete the blocker:** click **Done** on A → A moves to **Done**, and B moves **Blocked → Ready on its own** (no refresh).
4. **Reopen:** Reopen A → B returns to **Blocked**.
5. **Remove the dependency:** click the A chip's × on B → B returns to **Ready**.
6. **Filter:** toggle "What I can do now" → only Ready shows; Blocked and Done hidden. Toggle off → all return.
7. **Delete:** Delete a task → it disappears from the board; `GET /sync/pull?since=0` confirms the tombstone.
8. **Cycle guard:** with B depending on A, try to add B as a prerequisite of A → inline "would create a cycle", no change (backend `409`).
9. **Offline gate:** offline → Done/Delete/dependency controls disable with a hint; capture still works; back online → controls return.
10. **Refresh** → board state persists (Dexie); readiness recomputes correctly on load.

If all ten hold, **Phase 4 is complete** — the dependency-aware board is live, and "what can I do right now" actually works.

---

## Guardrails

- **DO** compute readiness **client-side, live**, as a pure function over `useLiveQuery(db.tasks)` each render. Blocked = some `depends_on` id resolves to a **present, not-done** local task; done/absent prereqs don't block.
- **DO** bucket into **Ready / Blocked / Done**; show blocker titles on Blocked cards.
- **DO** make the "what I can do now" toggle show **only Ready**.
- **DO** dependency editing with removable **chips** + a `TaskPicker` (exclude self); on `409` show "would create a cycle".
- **DO** wire Done/Reopen/Delete + add/remove-dependency to the existing endpoints; `db.tasks.put` the returned task; on delete, `db.tasks.delete(id)` locally.
- **DO** gate all these mutations **online-only**; capture stays offline-capable.
- **DON'T** invest in styling — minimal/functional only (just legible; no white-on-white). The field-instrument design is a later dedicated pass.
- **DON'T** pre-compute the cycle set client-side — rely on the backend `409`.
- **DON'T** add backend (it all exists) or build resources / "while you have it" (Phase 5).