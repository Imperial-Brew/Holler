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
    <div style={{ marginTop: "0.5rem", fontSize: "0.9em" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginBottom: "0.25rem" }}>
        {dependsOnIds.map(id => {
          const depTask = taskMap[id];
          return (
            <span key={id} style={{ background: "var(--code-bg)", padding: "0.1rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border)" }}>
              {depTask ? depTask.title : id}
              <button
                onClick={() => handleRemove(id)}
                disabled={disabled}
                style={{ marginLeft: "0.25rem", border: "none", background: "none", cursor: "pointer", padding: 0 }}
              >✕</button>
            </span>
          );
        })}
      </div>
      <TaskPicker onPick={handleAdd} excludeTaskId={taskId} disabled={disabled} />
      {error && <span style={{ color: "red", marginLeft: "0.5rem" }}>{error}</span>}
      {!online && <span style={{ color: "gray", fontSize: "0.8em", display: "block" }}>Online only</span>}
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
    <div style={{
      border: "1px solid var(--border)",
      padding: "0.75rem",
      marginBottom: "0.75rem",
      borderRadius: "4px",
      opacity: task.status === "done" ? 0.6 : 1,
      background: task.status === "done" ? "rgba(0,0,0,0.05)" : "transparent"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          <strong style={{ fontSize: "1.1em" }}>{task.title}</strong>
          {task.due_date && <span style={{ marginLeft: "0.5rem" }}>📅 {task.due_date}</span>}
          {place && (
            <span style={{ marginLeft: "0.5rem", color: "gray" }}>
              📍 {place.name}{place.code ? ` [${place.code}]` : ""}
            </span>
          )}
          {task.job_id && (
            <Link
              to={`/jobs/${task.job_id}`}
              style={{
                marginLeft: "0.5rem",
                fontSize: "0.8em",
                padding: "0.1rem 0.4rem",
                borderRadius: "10px",
                border: "1px solid var(--border)",
                textDecoration: "none",
              }}
            >
              🔨 {job ? job.title : "Job"}
            </Link>
          )}
        </div>
        <div>
          <button onClick={handleToggleStatus} disabled={disabled}>
            {task.status === "done" ? "Reopen" : "Done"}
          </button>
          <button onClick={handleDelete} disabled={disabled} style={{ marginLeft: "0.25rem" }}>Delete</button>
        </div>
      </div>

      {type === "blocked" && task.blockers && task.blockers.length > 0 && (
        <div style={{ marginTop: "0.5rem", color: "var(--text-dim)", fontSize: "0.9em" }}>
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
    <form onSubmit={handleSubmit} style={{ display: "inline" }}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={disabled}
        style={{ marginRight: "0.25rem" }}
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        disabled={disabled}
        style={{ marginRight: "0.25rem" }}
      />
      <span style={{ position: "relative", display: "inline-block", marginRight: "0.25rem" }}>
        <LocationPicker value={locationId} onChange={setLocationId} disabled={disabled} />
      </span>
      <button type="submit" disabled={disabled}>
        {submitting ? "Registering…" : "Register"}
      </button>
      {error && (
        <span style={{ color: "red", marginLeft: "0.5rem" }}>{error}</span>
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
      <p>
        {online ? "🟢 Online" : "🔴 Offline"} | Cursor: {useLiveQuery(() => db.meta.get("cursor"), [])?.value ?? 0}{" "}
        <button onClick={onSync}>Sync</button>
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ marginBottom: "2rem", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="New capture…"
          style={{ width: "300px", marginRight: "0.5rem" }}
        />
        <button onClick={handleAdd}>Add</button>
      </div>

      {failedCaptures.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ color: "red" }}>Failed to Sync</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {failedCaptures.map((c) => (
              <li key={c.id} style={{ marginBottom: "0.5rem", padding: "0.5rem", border: "1px solid red", borderRadius: "4px" }}>
                <strong>{c.raw_text}</strong>
                <span style={{ color: "red", marginLeft: "0.5rem", fontSize: "0.9em" }}>{c.pushError}</span>
                <button
                  onClick={() => db.captures.put({ ...c, pendingPush: true, pushError: null })}
                  style={{ marginLeft: "0.5rem" }}
                >
                  Retry
                </button>
                <button
                  onClick={() => confirm("Discard this capture? It was never saved to the server.") && db.captures.delete(c.id)}
                  style={{ marginLeft: "0.25rem" }}
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {toRegister.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2>To Register</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {toRegister.map((c) => (
              <li key={c.id} style={{ marginBottom: "1rem", padding: "0.5rem", border: "1px dashed var(--border)" }}>
                <strong>{c.raw_text}</strong>
                <br />
                <RegisterForm capture={c} online={online} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <label style={{ fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={readyOnly}
            onChange={(e) => setReadyOnly(e.target.checked)}
          />
          What can I do right now?
        </label>
      </div>

      <section>
        <h2>Ready</h2>
        {ready.length === 0 ? <p style={{ color: "gray" }}>Nothing ready.</p> : (
          ready.map(t => (
            <TaskCard key={t.id} task={t} taskMap={taskMap} locMap={locMap} jobMap={jobMap} online={online} type="ready" />
          ))
        )}
      </section>

      {!readyOnly && (
        <>
          <section>
            <h2>Blocked</h2>
            {blocked.length === 0 ? <p style={{ color: "gray" }}>Nothing blocked.</p> : (
              blocked.map(t => (
                <TaskCard key={t.id} task={t} taskMap={taskMap} locMap={locMap} jobMap={jobMap} online={online} type="blocked" />
              ))
            )}
          </section>

          <section>
            <h2>Done</h2>
            {done.length === 0 ? <p style={{ color: "gray" }}>Nothing done yet.</p> : (
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
