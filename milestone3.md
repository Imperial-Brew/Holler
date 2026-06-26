# Phase 1 · Milestone 3 — The desk view shows captures

**Goal:** see captures in a browser. A dead-simple web page that calls `GET /sync/pull`, applies the result, and lists what came back. No offline yet — this proves the **full round trip with a live connection**, and it's the first time the frontend and backend talk over the network.

**You'll know it worked when:** you open the page in a browser, the existing (non-deleted) captures appear, and after creating a new capture via `/docs` and hitting **Sync**, it shows up in the list without a page reload — while the tombstoned one never appears.

---

## Context for the agent

Continues Holler. The React/Vite PWA was scaffolded in Phase 0. The API (FastAPI, `http://localhost:8000`) has `GET /sync/pull?since=N` returning `{ captures: [...], cursor: N }` (Milestone 2), and `POST /captures` (Milestone 1). Auth is the Phase-0 stub: a single static bearer token mapping to the owner user.

This milestone is **frontend + one small backend addition (CORS)**. No new tables, models, or migrations.

> **Scope discipline:** this is a wire to prove the round trip, **not** the real Board UI. A plain unstyled list is correct. Do not style it, do not build the mockup screens — that comes later. Keep it boring on purpose.

---

## Steps

### 1. CORS on the API (do this first — it's the thing that will otherwise block everything)

The browser runs the frontend on a different origin (`http://localhost:5173`, Vite's default) than the API (`http://localhost:8000`). Without CORS, every fetch fails with an opaque browser error. Add `CORSMiddleware` to the FastAPI app in `main.py`, allowing the Vite dev origin, with credentials and the `Authorization` header permitted. Pull the allowed origin from config/env so prod can differ.

### 2. A `sync` client module — `src/lib/sync.js` (or `.ts`)

One function that owns talking to the API and one that owns merging. Keep these isolated, because **Milestone 4 reuses this exact merge logic** against offline storage:

- `pull(since)` → `GET ${API}/sync/pull?since=${since}` with header `Authorization: Bearer <stub token>`. Returns the parsed `{ captures, cursor }`.
- `applyPull(state, response)` → pure merge:
  - For each returned capture: **upsert by `id`** into the local map (replace if present, add if not).
  - If a returned capture has `deleted === true`, **remove** it from the local map (tombstone applied).
  - Return the new map plus `response.cursor` as the new cursor.

> Upsert-by-id (not append) is essential: re-syncing the same rows must not create duplicates, and a tombstone must delete, not add.

Read the API base URL and the stub token from Vite env (`import.meta.env.VITE_API_URL`, `VITE_AUTH_TOKEN`) so nothing is hardcoded in a component. Add a frontend `.env` (gitignored) and a committed `.env.example`.

### 3. The view — a single component

Minimal state, in memory only:
- `captures` (a map or array, keyed by `id`) and `cursor` (int, starts `0`).
- On mount, run one sync.
- A **Sync** button that calls `pull(cursor)` → `applyPull(...)` → updates state.
- Render: the cursor value somewhere small, and a list of captures showing `raw_text`, `status`, and `row_version`. An empty state ("No captures yet — add one in /docs and hit Sync") when the list is empty.

> **Storage scope:** keep state in React (`useState`) only this milestone. **Do not** add IndexedDB/Dexie or localStorage yet — offline persistence is Milestone 4. In-memory is correct here.

---

## Acceptance check (in order)

1. API starts with CORS enabled; `GET /health` still `{"db":true}`.
2. Start the Vite dev server; open the page in a browser. No CORS error in the console.
3. The page auto-syncs on load: the existing **non-deleted** captures appear. The Milestone-2 tombstoned capture does **not** appear.
4. In another tab, `POST /captures` a new capture via `/docs`. Back on the page, click **Sync** → the new capture appears in the list, no page reload.
5. Click **Sync** again with nothing changed → list and cursor are unchanged (no duplicates, no flicker of removed rows).

If all five hold, Milestone 3 is done — the round trip is visible end-to-end, and the merge logic Milestone 4 needs is built and proven.

---

## Guardrails

- **DO** add `CORSMiddleware` allowing the Vite origin (`http://localhost:5173`) before anything else — it's the #1 blocker for first frontend↔API contact.
- **DO** send the stub token as `Authorization: Bearer <token>`, read from Vite env, not hardcoded in a component.
- **DO** merge by **upsert-by-`id`** and **remove `deleted === true`** rows. Never blind-append.
- **DO** advance the cursor from `response.cursor`, never compute it client-side.
- **DON'T** add IndexedDB/Dexie/localStorage this milestone — in-memory React state only.
- **DON'T** style it or build real UI — plain functional list; the Board screen comes later.
- **DON'T** add new tables, models, or migrations.