import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "./lib/db";
import { createCapture, registerCapture, sync, setTaskStatus, deleteTask, addDependency, removeDependency } from "./lib/sync";
import LocationPicker from "./components/LocationPicker";
import AddPlaceForm from "./components/AddPlaceForm";
import TaskPicker from "./components/TaskPicker";

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

function TaskCard({ task, taskMap, locMap, online, type }) {
  const [submitting, setSubmitting] = useState(false);
  const place = task.location_id ? locMap[task.location_id] : null;
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <strong style={{ fontSize: "1.1em" }}>{task.title}</strong>
          {task.due_date && <span style={{ marginLeft: "0.5rem" }}>📅 {task.due_date}</span>}
          {place && (
            <span style={{ marginLeft: "0.5rem", color: "gray" }}>
              📍 {place.name}{place.code ? ` [${place.code}]` : ""}
            </span>
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
      {capture.location_hint && (
        <span style={{ color: "gray", fontSize: "0.85em", marginRight: "0.25rem" }}>
          hint: {capture.location_hint}
        </span>
      )}
      <button type="submit" disabled={disabled}>
        {submitting ? "Registering…" : "Register"}
      </button>
      {!online && (
        <span style={{ color: "gray", marginLeft: "0.5rem" }}>
          Connect to register
        </span>
      )}
      {error && (
        <span style={{ color: "red", marginLeft: "0.5rem" }}>{error}</span>
      )}
    </form>
  );
}

export default function App() {
  const [text, setText] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState(null);
  const [readyOnly, setReadyOnly] = useState(false);

  const captures = useLiveQuery(() => db.captures.toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const locations = useLiveQuery(() => db.locations.toArray(), [], []);

  const locMap = {};
  for (const loc of locations) locMap[loc.id] = loc;

  const toRegister = (captures ?? []).filter(
    (c) => c.status === "pending" && !c.deleted && !c.pendingPush
  );

  const taskMap = {};
  const activeTasks = (tasks ?? []).filter(t => !t.deleted);
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

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      sync();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (navigator.onLine) {
      sync();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleSync = async () => {
    try {
      setError(null);
      await sync();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "1rem" }}>
      <h1>Holler</h1>
      <p>
        {online ? "🟢 Online" : "🔴 Offline"} | Cursor: {useLiveQuery(() => db.meta.get("cursor"), [])?.value ?? 0}{" "}
        <button onClick={handleSync}>Sync</button>
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <AddPlaceForm online={online} />

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

      {toRegister.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2>To Register</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {toRegister.map((c) => (
              <li key={c.id} style={{ marginBottom: "1rem", padding: "0.5rem", border: "1px dashed var(--border)" }}>
                <strong>{c.raw_text}</strong>
                {c.location_hint && (
                  <span style={{ color: "gray" }}> — 📍 {c.location_hint}</span>
                )}
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
            <TaskCard key={t.id} task={t} taskMap={taskMap} locMap={locMap} online={online} type="ready" />
          ))
        )}
      </section>

      {!readyOnly && (
        <>
          <section>
            <h2>Blocked</h2>
            {blocked.length === 0 ? <p style={{ color: "gray" }}>Nothing blocked.</p> : (
              blocked.map(t => (
                <TaskCard key={t.id} task={t} taskMap={taskMap} locMap={locMap} online={online} type="blocked" />
              ))
            )}
          </section>

          <section>
            <h2>Done</h2>
            {done.length === 0 ? <p style={{ color: "gray" }}>Nothing done yet.</p> : (
              done.map(t => (
                <TaskCard key={t.id} task={t} taskMap={taskMap} locMap={locMap} online={online} type="done" />
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
