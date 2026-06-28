# Phase 1 · Milestone 3 — The desk view shows captures

**Goal:** see captures in a browser. A dead-simple web page that calls `GET /sync/pull`, applies the result, and lists what came back. No offline yet — this proves the **full round trip with a live connection**, and it's the first time the frontend and backend talk over the network.

**You'll know it worked when:** you open the page in a browser, the existing (non-deleted) captures appear, and after creating a new capture via `/docs` and hitting **Sync**, it shows up in the list without a page reload — while the tombstoned one never appears.

---

## Context for the agent

Continues Holler. **Note: the frontend does not exist yet** — although the Phase 0 plan called for scaffolding a Vite PWA, Phase 0 shipped backend-only (no `package.json`, no `src/`). So this milestone **scaffolds the frontend first** (Step 0). The API (FastAPI, `http://localhost:8000`) has `GET /sync/pull?since=N` returning `{ captures: [...], cursor: N }` (Milestone 2), and `POST /captures` (Milestone 1). Auth is the Phase-0 stub: a single static bearer token mapping to the owner user.

This milestone is **frontend + one small backend addition (CORS)**. No new tables, models, or migrations.

> **Scope discipline:** this is a wire to prove the round trip, **not** the real Board UI. A plain unstyled list is correct. Do not style it, do not build the mockup screens — that comes later. Keep it boring on purpose.

---

## Steps

### 0. Scaffold the frontend (it doesn't exist yet)

From the repo root, create a Vite React app in a `frontend/` subdirectory:

```
npm create vite@latest frontend -- --template react   # (or react-ts if you prefer TypeScript)
cd frontend && npm install && npm run dev
```

Confirm the default Vite page loads at `http://localhost:5173` before writing any app code. Vite's template already includes a `.gitignore` covering `node_modules` — verify it's there.

> **PWA scope:** M3 needs only the Vite **React app** running and able to `fetch` the API. The actual PWA pieces — service worker, offline cache, install manifest — are **Milestone 4's** job (they exist to support offline). Don't add them here.

### 1. CORS on the API (do this next — it's the thing that will otherwise block everything)

The browser runs the frontend on a different origin (`http://localhost:5173`, Vite's default) than the API (`http://localhost:8000`). Without CORS, every fetch fails with an opaque browser error. Add `CORSMiddleware` to the FastAPI app in `main.py`, with credentials and the `Authorization` header permitted, pulling allowed origins from config/env so prod can differ. **Allow both `http://localhost:5173` and `http://127.0.0.1:5173`** — browsers treat `localhost` and `127.0.0.1` as distinct origins, and mismatching the host the page is served from against the host the API allows is a common silent CORS failure. (A local-dev wildcard is acceptable too; just don't ship the wildcard to prod.)

### 2. A `sync` client module — `frontend/src/lib/sync.js` (or `.ts`)

One function that owns talking to the API and one that owns merging. Keep these isolated, because **Milestone 4 reuses this exact merge logic** against offline storage:

- `pull(since)` → `GET ${API}/sync/pull?since=${since}` with header `Authorization: Bearer <stub token>`. Returns the parsed `{ captures, cursor }`. **Let fetch errors propagate for now** (online-only milestone) — do not build retry/offline handling; that's Milestone 4. A thrown error that surfaces in the console is the correct behavior here.
- `applyPull(state, response)` → pure merge. For each returned capture, branch on `deleted` so order can't bite you:
  - if `capture.deleted === true` → **delete** that `id` from the local map (tombstone applied);
  - else → **upsert by `id`** (replace if present, add if not).
  - Return the new map plus `response.cursor` as the new cursor.

> Two essentials: (1) **upsert by id, never append** — re-syncing the same rows must not duplicate them; (2) **branch on `deleted` first** — a `since=0` pull returns tombstones mixed in with live rows, and checking `deleted` before deciding upsert-vs-remove handles them correctly regardless of arrival order.

> **Auth note:** the Phase-0 backend stub doesn't actually *validate* the token yet — it hardcodes the owner UUID — so the header you send isn't read by anything right now. Send it anyway: it establishes the pattern so nothing changes on the client when real auth lands. Don't be thrown when removing the header doesn't break the call.

Read the API base URL and the stub token from Vite env (`import.meta.env.VITE_API_URL`, `VITE_AUTH_TOKEN`) so nothing is hardcoded in a component. Add a frontend `.env` (gitignored) and a committed `.env.example`.

### 3. The view — a single component

Minimal state, in memory only:
- `captures` stored **keyed by `id`** (a `Map` or plain object — O(1) upsert/delete in `applyPull`), and `cursor` (int, starts `0`). Derive an array from the values for rendering (`[...map.values()]`).
- On mount, run one sync.
- A **Sync** button that calls `pull(cursor)` → `applyPull(...)` → updates state.
- Render: the cursor value somewhere small, and a list of captures showing `raw_text`, `status`, and `row_version`. An empty state ("No captures yet — add one in /docs and hit Sync") when the list is empty.

> **Storage scope:** keep state in React (`useState`) only this milestone. **Do not** add IndexedDB/Dexie or localStorage yet — offline persistence is Milestone 4. In-memory is correct here.

---

## Acceptance check (in order)

1. `frontend/` exists; `npm run dev` serves the default Vite page at `http://localhost:5173`.
2. API starts with CORS enabled (both `localhost` and `127.0.0.1` origins); `GET /health` still `{"db":true}`.
3. Open the page in a browser. No CORS error in the console. The page auto-syncs on load: the existing **non-deleted** captures appear; the Milestone-2 tombstoned capture does **not** appear.
4. In another tab, `POST /captures` a new capture via `/docs`. Back on the page, click **Sync** → the new capture appears in the list, no page reload.
5. Click **Sync** again with nothing changed → list and cursor are unchanged (no duplicates, no flicker of removed rows).

If all five hold, Milestone 3 is done — the round trip is visible end-to-end, and the merge logic Milestone 4 needs is built and proven.

---

## Guardrails

- **DO** scaffold `frontend/` first (it doesn't exist) — `npm create vite@latest frontend -- --template react`. Confirm the default page loads before adding code.
- **DO** add `CORSMiddleware` allowing **both** `http://localhost:5173` and `http://127.0.0.1:5173` before anything else — it's the #1 blocker for first frontend↔API contact.
- **DO** send the stub token as `Authorization: Bearer <token>`, read from Vite env, not hardcoded in a component. (The backend doesn't validate it yet — that's expected; you're establishing the pattern.)
- **DO** merge by branching on `deleted` per row (remove if `deleted`, else upsert-by-`id`). Store captures keyed by `id`; never blind-append.
- **DO** advance the cursor from `response.cursor`, never compute it client-side.
- **DO** let pull errors propagate this milestone — no retry/offline handling (that's Milestone 4).
- **DON'T** add IndexedDB/Dexie/localStorage or any PWA/service-worker setup this milestone — in-memory React state only; PWA/offline is Milestone 4.
- **DON'T** style it or build real UI — plain functional list; the Board screen comes later.
- **DON'T** add new tables, models, or migrations.