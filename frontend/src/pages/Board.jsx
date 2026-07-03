import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../lib/db";
import { createCapture, registerCapture, setTaskStatus, deleteTask, addDependency, removeDependency } from "../lib/sync";
import LocationPicker from "../components/LocationPicker";
import TaskPicker from "../components/TaskPicker";

function DependencyEditor({ taskId, dependsOnIds, taskMap, online }) {
  const [error, setError] = useState(null);
  const disabled = !online;

  const handleAdd = async (depId) => {
    try {
      setError(null);
      await addDependency(taskId, depId);
    } catch (e) {
      if (e.message === "409") {
        setError("would create a cycle");
        setTimeout(() => setError(null), 3000);
      } else {
        setError(e.message);
      }
    }
  };

  const handleRemove = async (depId) => {
    try {
      setError(null);
      await removeDependency(taskId, depId);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{ marginTop: "var(--sp-3)", fontSize: "0.9em" }}>
      {dependsOnIds.length > 0 && (
        <div className="row row--wrap" style={{ gap: "var(--sp-1)", marginBottom: "var(--sp-2)" }}>
          {dependsOnIds.map(id => {
            const depTask = taskMap[id];
            return (
              <span key={id} className="chip">
                {depTask ? depTask.title : id}
                <button onClick={() => handleRemove(id)} disabled={disabled} aria-label="Remove dependency">✕</button>
              </span>
            );
          })}
        </div>
      )}
      <TaskPicker onPick={handleAdd} excludeTaskId={taskId} disabled={disabled} />
      {error && <span style={{ color: "var(--danger)", marginLeft: "var(--sp-2)" }}>{error}</span>}
      {!online && <span className="muted" style={{ fontSize: "0.8em", display: "block" }}>Online only</span>}
    </div>
  );
}

function TaskCard({ task, taskMap, locMap, jobMap, online, type }) {
  const [submitting, setSubmitting] = useState(false);
  const place = task.location_id ? locMap[task.location_id] : null;
  const job = task.job_id ? jobMap[task.job_id] : null;
  const disabled = !online || submitting;

  const handleToggleStatus = async () => {
    setSubmitting(true);
    try {
      const newStatus = task.status === "done" ? "open" : "done";
      await setTaskStatus(task.id, newStatus);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete task?")) return;
    setSubmitting(true);
    try {
      await deleteTask(task.id);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        marginBottom: "var(--sp-3)",
        borderLeft: type === "blocked" ? "3px solid var(--info)" : "3px solid var(--primary)",
        opacity: task.status === "done" ? 0.65 : 1,
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "var(--sp-3)" }}>
        <div>
          <strong style={{ fontSize: "1.05em", color: "var(--ink)", textDecoration: task.status === "done" ? "line-through" : "none" }}>{task.title}</strong>
          <div className="row row--wrap" style={{ gap: "var(--sp-2)", marginTop: "var(--sp-1)" }}>
            {task.due_date && <span className="muted" style={{ fontSize: "0.85em" }}>📅 {task.due_date}</span>}
            {place && (
              <span className="muted" style={{ fontSize: "0.85em" }}>
                📍 {place.name}{place.code ? ` [${place.code}]` : ""}
              </span>
            )}
            {task.job_id && (
              <Link to={`/jobs/${task.job_id}`} className="badge badge--wood">
                {job ? job.title : "Job"}
              </Link>
            )}
          </div>
        </div>
        <div className="row" style={{ gap: "var(--sp-1)", flexShrink: 0 }}>
          <button className="btn--sm" onClick={handleToggleStatus} disabled={disabled}>
            {task.status === "done" ? "Reopen" : "Done"}
          </button>
          <button className="btn--sm btn--danger" onClick={handleDelete} disabled={disabled}>Delete</button>
        </div>
      </div>

      {type === "blocked" && task.blockers && task.blockers.length > 0 && (
        <div className="muted" style={{ marginTop: "var(--sp-2)", fontSize: "0.85em" }}>
          waiting on: {task.blockers.map(b => b.title).join(", ")}
        </div>
      )}

      {task.status !== "done" && (
        <DependencyEditor
          taskId={task.id}
          dependsOnIds={task.depends_on || []}
          taskMap={taskMap}
          online={online}
        />
      )}
    </div>
  );
}

function RegisterForm({ capture, online }) {
  const [title, setTitle] = useState(capture.raw_text);
  const [dueDate, setDueDate] = useState("");
  const [locationId, setLocationId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const disabled = !online || submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (disabled || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await registerCapture(capture.id, {
        title: title.trim(),
        due_date: dueDate || null,
        location_id: locationId || null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="row row--wrap" style={{ gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={disabled}
        style={{ flex: "2 1 160px", width: "auto" }}
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        disabled={disabled}
        style={{ flex: "1 1 140px", width: "auto" }}
      />
      <span style={{ position: "relative", display: "inline-block" }}>
        <LocationPicker value={locationId} onChange={setLocationId} disabled={disabled} />
      </span>
      <button type="submit" className="btn--primary" disabled={disabled}>
        {submitting ? "Registering…" : "Register"}
      </button>
      {error && (
        <span style={{ color: "var(--danger)", marginLeft: "var(--sp-2)" }}>{error}</span>
      )}
    </form>
  );
}

export default function Board({ online, onSync }) {
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [readyOnly, setReadyOnly] = useState(false);

  useEffect(() => {
    if (online) {
      onSync();
    }
  }, []);

  const captures = useLiveQuery(() => db.captures.toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const locations = useLiveQuery(() => db.locations.toArray(), [], []);
  const jobs = useLiveQuery(() => db.jobs.toArray(), [], []);
  const cursor = useLiveQuery(() => db.meta.get("cursor"), [])?.value ?? 0;

  const locMap = {};
  if (locations) for (const loc of locations) locMap[loc.id] = loc;

  const jobMap = {};
  if (jobs) for (const j of jobs) jobMap[j.id] = j;

  const toRegister = (captures ?? []).filter(
    (c) => c.status === "pending" && !c.deleted && !c.pendingPush && !c.pushError
  );
  const failedCaptures = (captures ?? []).filter((c) => c.pushError && !c.deleted);

  const taskMap = {};
  // Milestone tasks are job bookkeeping — they live on the job page, not the board.
  const activeTasks = (tasks ?? []).filter(t => !t.deleted && !t.is_milestone);
  for (const t of activeTasks) taskMap[t.id] = t;

  const ready = [];
  const blocked = [];
  const done = [];

  for (const t of activeTasks) {
    if (t.status === "done") {
      done.push(t);
    } else {
      const blockers = (t.depends_on || [])
        .map(id => taskMap[id])
        .filter(dep => dep && dep.status !== "done");

      const isReady = blockers.length === 0;
      const augmentedTask = { ...t, isReady, blockers };

      if (isReady) {
        ready.push(augmentedTask);
      } else {
        blocked.push(augmentedTask);
      }
    }
  }

  const handleAdd = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      setError(null);
      await createCapture({ raw_text: trimmed });
      setText("");
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="statusbar">
        <span>
          <span className={`dot ${online ? "dot--on" : "dot--off"}`} />
          {online ? "Online" : "Offline"}
        </span>
        {import.meta.env.DEV && <span>Cursor {cursor}</span>}
        <button className="btn--ghost btn--sm" onClick={onSync}>Sync</button>
      </div>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="row" style={{ gap: "var(--sp-2)", marginBottom: "var(--sp-6)" }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Capture a thought…"
          className="grow"
        />
        <button className="btn--primary" onClick={handleAdd}>Add</button>
      </div>

      {failedCaptures.length > 0 && (
        <div className="section">
          <div className="section__head">
            <h2 style={{ color: "var(--danger)" }}>Failed to Sync</h2>
            <span className="section__count">{failedCaptures.length}</span>
          </div>
          <div className="stack">
            {failedCaptures.map((c) => (
              <div key={c.id} className="card" style={{ borderColor: "var(--danger)", borderLeft: "3px solid var(--danger)" }}>
                <div className="row row--wrap" style={{ gap: "var(--sp-2)" }}>
                  <strong style={{ color: "var(--ink)" }}>{c.raw_text}</strong>
                  <span style={{ color: "var(--danger)", fontSize: "0.85em" }}>{c.pushError}</span>
                </div>
                <div className="row" style={{ gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
                  <button className="btn--sm" onClick={() => db.captures.put({ ...c, pendingPush: true, pushError: null })}>
                    Retry
                  </button>
                  <button
                    className="btn--sm btn--danger"
                    onClick={() => confirm("Discard this capture? It was never saved to the server.") && db.captures.delete(c.id)}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toRegister.length > 0 && (
        <div className="section">
          <div className="section__head">
            <h2>To Register</h2>
            <span className="section__count">{toRegister.length}</span>
          </div>
          <div className="stack">
            {toRegister.map((c) => (
              <div key={c.id} className="card card--muted" style={{ borderStyle: "dashed" }}>
                <strong style={{ color: "var(--ink)" }}>{c.raw_text}</strong>
                <RegisterForm capture={c} online={online} />
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="card card--muted" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", cursor: "pointer", fontWeight: 650, color: "var(--ink)", marginBottom: "var(--sp-6)", padding: "var(--sp-3) var(--sp-4)" }}>
        <input
          type="checkbox"
          checked={readyOnly}
          onChange={(e) => setReadyOnly(e.target.checked)}
        />
        What can I do right now?
      </label>

      <section className="section">
        <div className="section__head">
          <h2>Ready</h2>
          <span className="section__count">{ready.length}</span>
        </div>
        {ready.length === 0 ? <p className="empty">Nothing ready.</p> : (
          ready.map(t => (
            <TaskCard key={t.id} task={t} taskMap={taskMap} locMap={locMap} jobMap={jobMap} online={online} type="ready" />
          ))
        )}
      </section>

      {!readyOnly && (
        <>
          <section className="section">
            <div className="section__head">
              <h2>Blocked</h2>
              <span className="section__count">{blocked.length}</span>
            </div>
            {blocked.length === 0 ? <p className="empty">Nothing blocked.</p> : (
              blocked.map(t => (
                <TaskCard key={t.id} task={t} taskMap={taskMap} locMap={locMap} jobMap={jobMap} online={online} type="blocked" />
              ))
            )}
          </section>

          <section className="section">
            <div className="section__head">
              <h2>Done</h2>
              <span className="section__count">{done.length}</span>
            </div>
            {done.length === 0 ? <p className="empty">Nothing done yet.</p> : (
              done.map(t => (
                <TaskCard key={t.id} task={t} taskMap={taskMap} locMap={locMap} jobMap={jobMap} online={online} type="done" />
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
