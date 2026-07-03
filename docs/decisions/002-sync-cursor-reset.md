# 002 — Sync Cursor & the Cursor-Reset Rule

*Architectural decision record. How Holler's offline pull works, and the one rule you must follow every time you add a table to the sync payload. This has already caused a production incident once (empty Jobs page + vanished tools on already-synced devices). Read this before touching `db.js` or `/sync/pull`.*

---

## The one thing to remember

**Every time you add a store to `/sync/pull`, bump the Dexie version AND reset the cursor to 0 in that version's `upgrade()` hook. No exceptions.**

If you add the store but not the reset, existing devices will never pull the rows that already existed — the new page renders empty forever, and no amount of re-syncing fixes it.

---

## How sync works

- Every syncable Postgres row has a `row_version` column, set by a trigger from one global monotonic sequence (`row_version_seq`). One sequence across all tables — a single number totally orders every change in the system.
- The client stores a **cursor** (in Dexie `meta`, key `"cursor"`): the highest `row_version` it has pulled.
- `GET /sync/pull?since=<cursor>` returns every row with `row_version > since`, across all synced tables, plus a new `cursor` = the max `row_version` in that response.
- `applyPull` writes those rows into Dexie and saves the new cursor.

The cursor is **monotonic — it only ever moves forward.**

---

## Why that bites when you add a table

The pull filters by `row_version > since` for *every* table, including a newly-added one. So a device whose cursor is already past a new table's existing rows will skip them permanently:

1. Tools/jobs/materials exist in Postgres with `row_version` 1–500.
2. A device syncs everything; its cursor is now 500.
3. You ship a release that adds the `jobs` store to `/sync/pull`.
4. That device pulls with `since=500`. The jobs rows are at `row_version` ≤ 500, so **none come back**. The Jobs page is empty on that device forever.

Fresh installs are fine (cursor starts at 0). Already-synced devices are the victims — which is everyone who actually uses the app.

This exact failure shipped once (jobs added without a reset). The symptom was telling: task cards showed a "🔨 Job" chip with no title (Dexie `jobs` empty) but the link still worked (JobDetail fetches from the network). The fix was a cursor-reset upgrade; the rule below exists so it never recurs.

---

## The rule (and why reset beats the alternatives)

In `db.js`, a version that adds a synced store resets the cursor:

```js
db.version(N)
  .stores({ /* … existing … */, new_store: "id, …" })
  .upgrade((tx) => tx.table("meta").put({ key: "cursor", value: 0 }));
```

On upgrade the device re-pulls **everything** from `row_version 0`. At single-family data volumes a full re-pull is cheap, and `applyPull` is idempotent (keyed by `id`), so re-pulling rows it already has is harmless.

Rejected alternatives:
- **Server-side `UPDATE … SET updated_at = now()` to bump every row past all cursors.** Deploy-order sensitive: a device that syncs through the *old* backend after the bump leaps its cursor past the bumped rows (the old backend never returns the new table), and stays broken. This was tried and failed in the field.
- **Per-table cursors.** Cleaner in theory, but multiplies the surface area and the bug modes for a single-user offline app. Not worth it here.

---

## Checklist when adding a synced table

1. Backend model has a `row_version` column + the `set_row_version` trigger (see the jobs/inventory migration for the pattern).
2. Add it to the `SyncPullResponse` schema and the `/sync/pull` query, and include its versions in the `cursor = max(...)` computation.
3. Add the store to a **new** `db.version(N)` in `db.js` **with a cursor-reset `upgrade()` hook.**
4. Handle it in `applyPull` (put on upsert; delete on `deleted` for soft-deletable tables — append-only ledgers like `material_transactions` have no delete branch).

Miss step 3 and everything else still "works" in dev (fresh IndexedDB) — then breaks on every existing device in production.
