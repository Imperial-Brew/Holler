import { useState, useEffect, useCallback } from "react";
import { pull, applyPull } from "./lib/sync";

export default function App() {
  const [captures, setCaptures] = useState(new Map());
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState(null);

  const doSync = useCallback(async () => {
    try {
      setError(null);
      const response = await pull(cursor);
      setCaptures((prev) => {
        const result = applyPull(prev, response);
        setCursor(result.cursor);
        return result.captures;
      });
    } catch (e) {
      setError(e.message);
      console.error(e);
    }
  }, [cursor]);

  useEffect(() => {
    doSync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = [...captures.values()];

  return (
    <div>
      <h1>Holler — Captures</h1>
      <p>
        Cursor: {cursor}{" "}
        <button onClick={doSync}>Sync</button>
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {list.length === 0 ? (
        <p>No captures yet — add one in /docs and hit Sync</p>
      ) : (
        <ul>
          {list.map((c) => (
            <li key={c.id}>
              <strong>{c.raw_text}</strong> — status: {c.status}, row_version:{" "}
              {c.row_version}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
