# 001 — Goal / Task Prioritization Model

*Architectural decision record. The reasoning behind how Holler ranks and surfaces work. Read this before changing anything in the goals/tasks/priority area — several things here are deliberate and look "wrong" to a refactor.*

---

## The core idea (the one thing to remember)

Don't file each task into one bucket. **Rank the goals once. Let each task point at every goal it advances. A task's priority is computed from the goals it touches — it inherits the highest one.**

A task that points at three goals isn't ambiguous. It's the highest-leverage task. The system floats those *up*, not makes you agonize over where they live.

---

## Two orderings that get tangled

The reason this felt unsolvable at first: "moving in is priority 1, then weatherproofing..." mixes two different things into one list.

- **Priority** = what matters most. (Roof > doors > walls within weatherproofing.)
- **Dependency** = what must come *first*. (Can't move in until it's dry. No point sealing walls under a leaking roof.)

These usually agree but not always. Inventory is low *priority* but it's not a *blocker* to moving in — you can move in and inventory later. Keep these as two separate mechanisms. Don't encode "must come first" as a priority number.

**Move-in is the outcome, not a competitor.** Weatherproofing isn't fighting move-in for the top slot — it's the path to it. Move-in is the root goal; weatherproof / organize / inventory hang underneath as the work that gets there.

---

## The entities

**`goals`** — the ranked hierarchy. The *only* place priority is hand-assigned.
- `id`, `name`, `parent_id` (self-referencing; move-in is root), `rank` (orders siblings), `status`

**`tasks`** — the units of work.
- `id`, `title`, `status`, `location` (drives physical batching), `effort_estimate` (optional)
- *priority is NOT stored here — it's computed*

**`task_goals`** — many-to-many join. A task links to every goal it meaningfully advances.
- `task_id`, `goal_id`. In Dexie, a multi-entry index on `goalId` keeps "all tasks touching goal X" cheap offline.

**`task_dependencies`** — sequencing, separate from priority.
- `task_id`, `depends_on_task_id`. A row means `task_id` depends on `depends_on_task_id`; the latter must finish first. A task is unblocked when all its dependencies are done.

---

## The three axes (how you actually navigate)

A task is the intersection of three things; slice by any of them:

1. **Goal (why)** — drives priority.
2. **Location (where)** — drives *batching*. On the roof, do every roof task; at the east door, do the door + adjacent gap + adjacent wall in one trip. Physical work clusters by place.
3. **Dependency (order)** — drives what's *possible now*.

---

## Effective priority (computed, not stored)

> **effective priority = max( rank of the goals it touches, rank of anything it unblocks )**

- "Tarp east roof leak" touches Roof (top) → top priority.
- "Clear junk under roof" touches Organization (low) *and* Roof → inherits Roof → floats up, correctly, because it's blocking roof work.
- A blocker inherits the urgency of what it blocks (critical-path logic).

Compute it in a Postgres view server-side, mirror the logic in JS for offline. Don't store it — derive it, so it can't go stale.

---

## The "next action" view

1. **Filter** to unblocked tasks (all dependencies satisfied).
2. **Sort** by effective priority.
3. **Group** by location so you're not walking back and forth.

Priority decides *what matters*. Location grouping decides *what's efficient*. The dependency filter decides *what's available now*.

---

## The discipline that makes or breaks it

**Link a task to a goal ONLY if doing it meaningfully advances that goal.**

The failure mode: tag everything "roof" because it feels urgent, priority inflates, and you're back to a flat list where nothing stands out. The entire value of the computed-priority model depends on honest linking. (This is the rule a well-meaning refactor is most likely to optimize away — don't let it.)

A subtlety: when a task *clears the way* for a high-priority task (clearing access to fix the roof), is that a **goal link** (advances Roof) or a **dependency** (blocks the roof-fix task)? Either works as long as effective-priority pulls from both goal-touches *and* things-it-unblocks. Pick one convention and be consistent.

---

## The priority stack (reference)

- **Move in** — root / the outcome
  - **Weatherproof** (prerequisite, not competitor)
    - Roof — rank 1
    - Doors — rank 2
    - Walls & gaps — rank 3
  - **Organize** — rank 2
  - **Inventory** — rank 3

---

## Status

Schema (tables + seed + Dexie stores) is task-01 in `docs/tasks/`. The effective-priority view is deliberately deferred to a later task so it can be tested against real seeded rows rather than an empty schema.
EOF
echo "001 written"