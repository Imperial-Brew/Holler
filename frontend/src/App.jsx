import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "./lib/db";
import { createCapture, registerCapture, sync } from "./lib/sync";

function RegisterForm({ capture, online }) {
  const [title, setTitle] = useState(capture.raw_text);
  const [dueDate, setDueDate] = useState("");
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

  const captures = useLiveQuery(() => db.captures.toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const cursorRow = useLiveQuery(() => db.meta.get("cursor"), []);
  const cursor = cursorRow?.value ?? 0;

  const toRegister = captures.filter(
    (c) => c.status === "pending" && !c.deleted && !c.pendingPush
  );
  const liveTasks = tasks.filter((t) => !t.deleted);

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
    <div>
      <h1>Holler</h1>
      <p>
        {online ? "🟢 Online" : "🔴 Offline"} | Cursor: {cursor}{" "}
        <button onClick={handleSync}>Sync</button>
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ marginBottom: "1rem" }}>
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

      <h2>To Register</h2>
      {toRegister.length === 0 ? (
        <p>No captures waiting for registration</p>
      ) : (
        <ul>
          {toRegister.map((c) => (
            <li key={c.id} style={{ marginBottom: "0.5rem" }}>
              <strong>{c.raw_text}</strong>
              {c.location_hint && (
                <span style={{ color: "gray" }}> — 📍 {c.location_hint}</span>
              )}
              <br />
              <RegisterForm capture={c} online={online} />
            </li>
          ))}
        </ul>
      )}

      <h2>Tasks</h2>
      {liveTasks.length === 0 ? (
        <p>No tasks yet</p>
      ) : (
        <ul>
          {liveTasks.map((t) => (
            <li key={t.id}>
              <strong>{t.title}</strong>
              {t.due_date && <span> — due {t.due_date}</span>}
              <span style={{ color: "gray" }}> [{t.status}]</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
