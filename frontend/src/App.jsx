import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "./lib/db";
import { createCapture, sync } from "./lib/sync";

export default function App() {
  const [text, setText] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState(null);

  const captures = useLiveQuery(() => db.captures.toArray(), [], []);
  const cursorRow = useLiveQuery(() => db.meta.get("cursor"), []);
  const cursor = cursorRow?.value ?? 0;

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
      <h1>Holler — Captures</h1>
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

      {captures.length === 0 ? (
        <p>No captures yet</p>
      ) : (
        <ul>
          {captures.map((c) => (
            <li key={c.id}>
              <strong>{c.raw_text}</strong>
              {" — "}
              {c.pendingPush ? (
                <span>⟳ pending</span>
              ) : (
                <span>✓ synced (rv {c.row_version})</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
