# Phase 4 · Milestone 2 — Complete, reopen, delete a task (backend)

**Goal:** the events that make the board mean something. Tasks can be marked **done** (and reopened), and **soft-deleted**. Completing or deleting a task is what will flip its dependents from Blocked to Ready in the next milestone.

**You'll know it worked when:** you can PATCH a task to `done` (and watch `completed_at` get stamped), reopen it, and soft-delete one — each bumping `row_version` so the change syncs, with deletes riding the tombstone path.

---

## Context for the agent

Continues Holler. Phase 4 M1 done: dependencies with the `depends_on` list on `TaskRead`. The `tasks` table already has `status`, `completed_at`, `deleted`, `deleted_at` columns — **so this milestone needs no migration.** These are **online-only** desk actions. The `set_row_version` trigger already bumps `row_version` on any `UPDATE` of a task, so a soft-delete (which is an UPDATE) propagates as a tombstone through the existing pull.

> **No hard deletes, ever.** Delete = `deleted = true` + `deleted_at = now()`. The row stays; pull conveys it as a tombstone; the client removes it. This is the machinery from Phase 1 — reuse it.

---

## Steps

### 1. `PATCH /tasks/{task_id}` — partial update (incl. completion)

Accept a partial body — any subset of `{ title?, due_date?, location_id?, status? }`:
1. Load the task → `404` if missing **or already `deleted`** (you can't edit a tombstone).
2. Validate: type `status` as a `Literal["open","in_progress","done","cancelled"]` (or a `StrEnum`) on the `TaskUpdate` schema so **Pydantic rejects bad values with `422` automatically** — don't hand-roll status validation in the route. If `location_id` is provided and non-null, it must exist (else `422`).
3. **Completion side-effect — detect the *transition*, not just the value.** Compare the incoming `status` against the task's **current** status: only set `completed_at = now()` when status goes **from not-done → `done`**, and only clear it (`NULL`) when it goes **from `done` → not-done**. A `done → done` PATCH (or any PATCH that doesn't change status) leaves `completed_at` **untouched** — `completed_at` is the *first* completion time, not re-stamped on every save.
4. **Apply only the fields the client actually sent.** This is critical: with `Optional[...] = None`, "field omitted" and "field set to null" both arrive as `None`, so naively assigning every field would blank out `location_id`/`due_date`/`title` on every PATCH. Iterate over **`body.model_dump(exclude_unset=True)`** and assign only those keys. Commit; the `UPDATE` bumps `row_version` via the trigger.
5. Return `200` with the updated `TaskRead` — **reuse the `_load_task_read` helper from the dependencies module** (extract it to a shared utility if cleaner) so the response includes the `depends_on` list, not a raw ORM object missing it.

> Schema: a `TaskUpdate` Pydantic model with all-optional fields (`status` as a `Literal`). Don't accept `row_version`, `created_by`, `deleted`, timestamps — those aren't client-settable here (delete has its own route).

### 2. `DELETE /tasks/{task_id}` — soft delete

1. Load the task → `404` if missing.
2. Set `deleted = true`, `deleted_at = now()`. Commit (the `UPDATE` bumps `row_version`).
3. **Idempotent:** deleting an already-deleted task is a `200` no-op.
4. Return `200` with the (now soft-deleted) `TaskRead` — again via the shared `_load_task_read` helper so `depends_on` is included.

> **Intentional asymmetry on already-deleted tasks:** `PATCH` treats a deleted task as gone → `404` (you can't edit a tombstone); `DELETE` treats it as already-done → `200` no-op (re-deleting is harmless and idempotent). These differ on purpose — don't unify them.

**Do not cascade.** Deleting a task does **not** delete its dependency edges or any dependent tasks. The edge rows referencing it stay (the FK is still valid — the row exists, just flagged). The dependents' readiness is handled client-side next milestone (see the rule below).

Register the route(s) in `main.py`. (Put `PATCH`/`DELETE` in a new `app/routes/tasks.py`, or add them to the existing dependencies router — either works; both share `prefix="/tasks"` and FastAPI merges them. If separate, the dependencies file name stays accurate.)

---

## The readiness rule (for context — implemented in M3, not here)

Stating it now so this milestone's delete/complete semantics are clearly aimed:

> A task is **Blocked** iff some id in its `depends_on` resolves to a **local task that is present and not `done`.** A prerequisite that is `done`, or that is **absent from the client's store** (because it was soft-deleted → tombstoned → removed, or completed-and-filtered), does **not** block. Because the client recomputes readiness **live from local state** every render, completing or deleting a prerequisite frees its dependents automatically — no server-side cascade, no bumping of dependents required.

This is why M2 doesn't cascade: the client's live recomputation handles it.

---

## Acceptance check (in order)

1. Server starts; `GET /health` `{"db":true}`. (No migration this milestone.)
2. **Complete:** `PATCH /tasks/{id}` `{ "status": "done" }` → `200`, response `status: "done"` with a non-null `completed_at`. A `pull` shows it with a bumped `row_version`.
3. **Reopen:** `PATCH /tasks/{id}` `{ "status": "open" }` → `completed_at` is now `null`, `status: "open"`.
4. **Edit:** `PATCH /tasks/{id}` `{ "title": "New title" }` → title updated, **other fields (location_id, due_date, status) untouched** — confirm a status-only or title-only PATCH does **not** blank the others (the `exclude_unset` check). `row_version` bumped.
5. **done → done is not a re-stamp:** PATCH `{ "status": "done" }` on an already-done task → `completed_at` is unchanged (still the original completion time).
6. **Validation:** `PATCH` with `{ "status": "banana" }` → `422`; with a bogus `location_id` → `422`. Missing task → `404`. **PATCH a soft-deleted task → `404`** (can't edit a tombstone).
7. **Soft-delete:** `DELETE /tasks/{id}` → `200`, `deleted: true`. `GET /sync/pull?since=<prior cursor>` returns that task as a **tombstone** (`deleted: true`, bumped `row_version`).
8. **Idempotent delete:** `DELETE` the same task again → `200`, still one tombstone, no error.
9. **No cascade:** with B depending on A, `DELETE /tasks/{A}` → A is tombstoned, **the edge `(B → A)` still exists**, and B is untouched. The returned/ pulled `TaskRead` for any task still carries its `depends_on`.

If all eight hold, Milestone 2 is done — tasks can be completed, reopened, and deleted, and every change syncs.

---

## Guardrails

- **DO** use the existing `status` / `completed_at` / `deleted` / `deleted_at` columns — **no migration.**
- **DO** apply only the fields the client sent: iterate `body.model_dump(exclude_unset=True)`. **Never assign every optional field** — that blanks `location_id`/`due_date`/`title` to null on every PATCH.
- **DO** type `status` as a `Literal`/`StrEnum` so Pydantic does the `422` validation; don't hand-roll it.
- **DO** stamp `completed_at` only on the not-done → `done` **transition**, clear it only on `done` → not-done. `done → done` leaves it untouched.
- **DO** return `TaskRead` via the shared `_load_task_read` helper so `depends_on` is included.
- **DO** keep the asymmetry: PATCH a deleted task → `404`; DELETE an already-deleted task → `200` no-op.
- **DO** soft-delete only (`deleted = true` + `deleted_at`); **NEVER hard-delete.** The tombstone syncs via the existing pull; the client removes it.
- **DO** validate: `404` missing, `422` bad `status`/`location_id`.
- **DON'T cascade** on delete — leave dependency edges and dependent tasks alone; readiness is client-side (M3).
- **DON'T** accept `row_version`/`created_by`/`deleted`/timestamps in the `PATCH` body — not client-settable there.
- **DON'T** build the Board, readiness computation, the dependency picker, or any UI — that's Milestone 3.