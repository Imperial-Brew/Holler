# Phase 1 · Milestone 4 — Capture offline, sync on reconnect

**Goal — the prize.** Create a capture with no network, have it persist locally, and watch it sync to the server the moment the connection returns. This is the milestone the whole architecture exists to make safe; everything before it was laying track so this one is debuggable.

**You'll know it worked when:** with the app open, you go offline, jot a few captures (they appear immediately, marked *pending*), go back online, and they automatically push to the server and flip to *synced* — with the server confirming them and no duplicates.

---

## Context for the agent

Continues Holler. Frontend is a Vite 6 + React app in `frontend/`. `frontend/src/lib/sync.js` already has `pull(since)` and a pure `applyPull(map, response)` merge (branch on `deleted` → remove, else upsert-by-`id`). The API has idempotent `POST /captures` (`201` create / `200` duplicate) and `GET /sync/pull?since=N`. The whole point of client-generated UUIDs and idempotent POST — decided back in the build plan — pays off here.

---

## Scope — read this, it keeps the milestone focused

This milestone is the offline **data layer**: an IndexedDB outbox, optimistic display, and a flush-on-reconnect. It is **NOT** the installable-PWA / service-worker work (caching the app shell so the page *loads* while fully offline). That asset-caching piece is real but **separable**, and it does not change the data architecture — defer it to a follow-up (call it M4b).

Concretely: the acceptance test keeps the tab **open** across the offline period. Do **not** require reloading-while-offline, and do **not** build a service worker here. The architectural risk being retired in M4 is *data integrity across an offline gap* — prove that; asset caching is independent.

---

## Steps

### 0. Add IndexedDB tooling

```
cd frontend && npm install dexie dexie-react-hooks
```

(`dexie-react-hooks`’ `useLiveQuery` lets the list re-render automatically when the local DB changes — clean for this. Manual re-reads after each op are an acceptable alternative if you'd rather not add it.)

### 1. Local database — `frontend/src/lib/db.js`

A Dexie database with two stores:
- **`captures`**, keyed by `id`. Holds the local read model — both rows pulled from the server *and* rows created locally. Add a client-only flag **`pendingPush`** marking rows created on this device that haven't been confirmed by the server yet. (`pendingPush` is local state, never sent to the API.)
- **`meta`**, a tiny key/value store holding `cursor` (the pull cursor, starts `0`).

> **Don't index `pendingPush` as a boolean — IndexedDB can't index booleans.** (A reasonable-looking schema like `captures: 'id, pendingPush'` with `true`/`false` values silently matches nothing on `.where('pendingPush').equals(true)` — a classic Dexie footgun.) Two clean options: (a) **simplest — don't index it; use `db.captures.filter(c => c.pendingPush).toArray()`** in `flush()`. The outbox is inherently tiny (only unsynced rows), so the full scan is free here. Or (b) if you want a real index, store the flag as **`1`/`0`** (numbers are valid keys) and index that (`captures: 'id, pendingPush'`). Go with (a) for v1.

### 2. Rework `sync.js` to persist to Dexie

Same merge *logic* as M3 — only the storage changes (in-memory Map → Dexie). Functions:

- **`createCapture({ raw_text, location_hint, source })`** — runs fully offline:
  - generate the id with `crypto.randomUUID()` **at creation time** (this is why we chose client UUIDs — an offline device must mint its own stable id),
  - write a row to `captures` carrying **the `CaptureCreate` fields** (`id`, `raw_text`, `location_hint`, `source`) **plus the client-only/display fields** (`status: 'pending'`, `created_at: now`, `deleted: false`, `pendingPush: true`),
  - if `navigator.onLine`, fire `flush()` (don't await — keep the UI snappy); offline, it just waits.
  - The row shows in the list immediately (optimistic).
- **`flush()`** — push the outbox:
  - read the pending rows (`db.captures.filter(c => c.pendingPush)` — see Step 1),
  - **process them one at a time in a loop, each in its own `try/catch`** (not all wrapped in a single try/catch — one failure must not skip the rest, and confirmed ones must stay confirmed). **Sequential is the right default** for v1: on reconnect you don't want to fire N simultaneous requests. (Parallel via `Promise.all` would be correctness-safe thanks to idempotency, but sequential is gentler and makes partial failure trivial — prefer it.)
  - For each, **POST only the `CaptureCreate` subset** (`id`, `raw_text`, `location_hint`, `source`) — **not the whole Dexie row.** Don't send `pendingPush` (client-only), `status`, `created_at`, or `deleted` (server-owned). On success, update the local row from the server response (it now carries the real `row_version`) and set `pendingPush: false`.
  - On network failure for a row, **leave its `pendingPush: true`** and stop the loop (the rest will all fail too on a dead network) — never drop a capture; everything unconfirmed retries on the next flush. Tolerate failure quietly (no throw that loses data).
- **`applyPull` → write to Dexie** — same per-row branch as M3 (`deleted` → delete the id from `captures`; else upsert). When upserting an id that exists locally as `pendingPush`, the **server row is authoritative** — overwrite and clear `pendingPush` (the server has confirmed it). Persist the new cursor to `meta`.
- **`sync()`** = `await flush(); await pull(meta.cursor) → applyPull(...)`. This is what the Sync button and the reconnect handler call.

> Idempotency is the safety net, and it covers the nasty edge case too: if a POST *succeeded* but the network dropped before the response arrived, the row stays `pendingPush: true`, the next `flush()` re-POSTs it, gets a `200` (no duplicate), and the following `pull()` overwrites the local row with the confirmed server copy. Same `id` throughout, so no capture is ever lost or doubled — exactly the property you proved in Milestone 1.

### 3. Connectivity handling — in the app or a small hook

- On `window` `'online'` → call `sync()` (flush the backlog, then pull).
- Track `navigator.onLine` (+ `'offline'`/`'online'` events) for a small **online/offline indicator** in the UI.
- **Guard `sync()` against re-entry.** The `'online'` event can fire several times in quick succession on flaky Wi-Fi; without a guard you'd stack overlapping flush+pull cycles. A module-level flag is enough: `if (syncing) return; syncing = true; try { … } finally { syncing = false; }`. (Harmless at v1 scale thanks to idempotency, but it avoids redundant churn.)

### 4. View — `frontend/src/App.jsx`

- **On mount:** the list renders from Dexie immediately (instant, works offline) via `useLiveQuery`; *then* call `sync()` **only if `navigator.onLine`**. This replaces M3's unconditional `pull()`-on-mount — read local first, sync second, and never block the UI on a network call.
- An **Add capture** text input + button → `createCapture({ raw_text })`. Must work with no network.
- The list reads from Dexie (`useLiveQuery(() => db.captures.toArray())`), so new and synced rows appear without manual refresh. Show per-row state: **pending** (⟳, `pendingPush` truthy) vs **synced** (shows `row_version`).
- The online/offline indicator and a **Sync** button (calls `sync()`).
- Keep it unstyled/minimal — still plumbing, not the Board.

---

## Acceptance check — the airplane-mode test (in order)

1. App loads online; existing server captures appear as **synced** (with `row_version`). *(Assumes the M1–M3 captures are still in the DB. On a fresh database there'll be none — just create one while online first to have a synced baseline to compare against.)*
2. Go **offline** — DevTools → Network → *Offline* (or actual airplane mode). Indicator shows offline. **Keep the tab open.**
3. Add 2–3 captures while offline. Each appears in the list **immediately**, marked **pending**. No console errors. (IndexedDB writes work offline.)
4. Confirm they survived locally: they're still listed, still pending. (Optionally check DevTools → Application → IndexedDB → your DB → `captures`.)
5. Go back **online**. The `'online'` event fires → `flush()` pushes the pending captures → `pull()` reconciles → their badges flip from **pending** to **synced**, now carrying server `row_version`s. No manual action required.
6. Confirm server-side: in `/docs`, `GET /sync/pull?since=0` (or psql) shows the offline-created captures **persisted on the server** with real `row_version`s.
7. Click **Sync** once more → no duplicates appear locally or on the server (flush + pull + idempotent POST cooperate).

If all seven hold, **Phase 1 is complete** — a capture made on a disconnected device reaches the server exactly once when it reconnects. That's the walking skeleton, and the architecture is proven end to end.

---

## Guardrails

- **DO** mint the capture `id` with `crypto.randomUUID()` at creation, offline-safe. This is the payoff of client-generated UUIDs — never wait for the server to assign an id.
- **DO** write captures to IndexedDB and display them optimistically; **capture creation must never block on the network.**
- **DO** find pending rows with `.filter(c => c.pendingPush)`, **not** a boolean index — IndexedDB can't index booleans. (Or store the flag as `1`/`0` if you want an index.)
- **DO** process `flush()` **sequentially, one row per `try/catch`** — one failure must not skip the others, and confirmed rows stay confirmed.
- **DO** POST **only the `CaptureCreate` subset** (`id`, `raw_text`, `location_hint`, `source`) — not the whole Dexie row.
- **DO** mark local rows `pendingPush` and only clear it once the server confirms (via POST response or a pull).
- **DO** make `flush()` loss-proof: a failed push leaves `pendingPush` set for the next attempt; never drop a capture.
- **DO** treat the server row as authoritative on `id` collision during pull (overwrite local, clear `pendingPush`).
- **DO** guard `sync()` against re-entry (a flag), since `'online'` can fire repeatedly.
- **DO** on mount, render from Dexie first, then `sync()` only if `navigator.onLine`.
- **DO** trigger `sync()` on the `'online'` event and the Sync button. Lean on POST idempotency so flush+pull can't duplicate.
- **DON'T** build a service worker / installable-PWA / offline app-shell this milestone — that's the separable M4b. The test keeps the tab open; don't require reload-while-offline.
- **DON'T** send `pendingPush`, `status`, `created_at`, or `deleted` to the API — client-only or server-owned.
- **DON'T** hard-delete from Dexie except when applying a tombstone (`deleted: true`) from a pull.
- **DON'T** style or build the real Board — still the plain list.