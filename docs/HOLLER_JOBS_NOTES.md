# Holler jobs + inventory — migration notes

`holler_jobs_inventory.sql` adds the work-order layer on top of your existing
tasks/goals/dependencies: jobs (with an auto-milestone), tools, materials, an
append-only material ledger, the two junctions (allocation vs BOM), and the
job→tool completion effect. Plus four views that do all the derived work.

It's been run end-to-end against Postgres 16 — schema applies clean, and the
fence scenario (tractor gate → cascade, and the pocket shopping list) produces
the expected results.

---

## Wire-up before you run it against Holler

Four names to reconcile with your real schema (all flagged `>>> WIRE-UP` in the
SQL):

1. **row_version mechanism** — the file creates a `holler_row_version_seq` +
   `holler_set_row_version()` trigger. If you already have one, delete that
   block and attach your existing trigger to the new tables instead.
2. **task_dependencies columns** — assumed `(task_id = dependent,
   depends_on_task_id = prerequisite)`, plus a partial unique index on
   `(task_id, depends_on_task_id) WHERE deleted_at IS NULL` (the milestone
   auto-edge uses it as the `ON CONFLICT` target). Match your real names.
3. **`'done'`** is the terminal task status the completion logic checks for.
4. **`locations(id)`** is assumed present for job/tool `location_id` FKs.

---

## Two design choices worth knowing

**Why materials use a ledger but tools use a stored status.** It's the same
offline-sync reasoning, landing in two different places:
- A material decrement (`-4 posts`) is *not* idempotent — replay it or lose it
  under last-write-wins and your count is wrong. So on-hand is never stored;
  it's `SUM(delta)` over an append-only ledger that merges as addition.
- A tool "set to available" *is* idempotent and forward-only — applying it
  twice is harmless and LWW converges. So a stored `status` field is safe, and
  the job effect just sets it on completion. No ledger needed.

**Where the automation lives.** The milestone creation, edge maintenance, and
completion/effect firing are Postgres triggers — server-side authority, so the
truth is consistent regardless of which client synced last. The offline client
should mirror milestone creation optimistically (or just accept that a brand-
new job's milestone shows up on first sync). Crucially, *readiness itself is
derived by the views*, not stored — so the board still lights up offline from
base data without waiting on the server.

---

## The two features, and the views behind them

**Cascade board → `v_task_board`.** Returns `ready / blocked / done` per task.
A task is `blocked` if any dependency isn't done *or* any required tool isn't
available; `ready` otherwise. Completing a task (or a whole job, via its
milestone) re-derives the view, so dependents flip to `ready` on the next read.
Cross-job gates work because a dependency can point at another job's milestone.

**Pocket shopping list → `v_shopping_list`.** For every material, compares what
all not-yet-done tasks still need against live on-hand, and lists only the
shortfalls with how much to buy. Because it's pure SQL over base tables, the
identical logic re-expressed in Dexie runs **client-side, offline** — so it
works standing in the hardware store aisle with no signal, straight from your
last sync.

Supporting views: `v_material_on_hand` (the ledger sum) and
`v_open_material_need` (rollup of open BOM lines).

---

## Open choices I left for you (not bugs)

- **Job reopen.** Completion fires tool effects forward; reopening a completed
  job does not auto-reverse them (un-completing the tractor job won't re-break
  the auger). Simplest is to handle that manually; say the word if you want
  symmetric reverse-on-reopen and I'll add it.
- **Empty jobs.** A job with zero real tasks never auto-completes (guarded by
  `total > 0`), so a fresh job doesn't read as done.
- **Ledger corrections.** `material_transactions` is immutable by convention —
  fix a mistake with a reversing row, never an edit. That's what preserves the
  traceable history.

---

## Next layer (when you want it)

The FastAPI endpoints + Dexie stores to drive this from the app: job/tool/
material CRUD, a "consume materials" action that writes ledger rows, and the
client-side mirror of `v_task_board` / `v_shopping_list` so the board and the
shopping list both work offline. Say the word and I'll build it in the same
validated style.
