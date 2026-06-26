import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../lib/db";

export default function TaskPicker({ onPick, excludeTaskId, disabled }) {
  const [filter, setFilter] = useState("");

  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);

  const lowerFilter = filter.toLowerCase();
  const filtered = (tasks ?? []).filter((t) => {
    if (t.id === excludeTaskId) return false;
    if (t.status === 'done') return false;
    if (t.deleted) return false;
    if (!lowerFilter) return true;
    return t.title.toLowerCase().includes(lowerFilter);
  });

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Add prerequisite…"
        disabled={disabled}
        style={{ width: "200px" }}
      />
      {filter && (
        <ul style={{
          margin: 0,
          padding: "0.25rem 0",
          listStyle: "none",
          border: "1px solid var(--border)",
          maxHeight: "150px",
          overflowY: "auto",
          position: "absolute",
          background: "var(--code-bg)",
          color: "var(--text-h)",
          zIndex: 10,
          borderRadius: "4px",
          width: "100%",
          left: 0,
          top: "100%"
        }}>
          {filtered.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(t.id);
                  setFilter("");
                }}
                disabled={disabled}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0.25rem 0.5rem",
                  width: "100%",
                  textAlign: "left",
                  color: "inherit"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-bg)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "none"}
              >
                {t.title}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li style={{ padding: "0.25rem 0.5rem", color: "gray" }}>No matches</li>
          )}
        </ul>
      )}
    </div>
  );
}
