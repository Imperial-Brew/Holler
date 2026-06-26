import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../lib/db";

export default function LocationPicker({ value, onChange, disabled }) {
  const [filter, setFilter] = useState("");

  const locations = useLiveQuery(() => db.locations.toArray(), [], []);
  const locationTypes = useLiveQuery(() => db.location_types.toArray(), [], []);

  const typeMap = {};
  for (const lt of locationTypes) typeMap[lt.id] = lt.name;

  const locMap = {};
  for (const loc of locations) locMap[loc.id] = loc;

  const lowerFilter = filter.toLowerCase();
  const filtered = locations.filter((loc) => {
    if (!lowerFilter) return true;
    const nameMatch = loc.name.toLowerCase().includes(lowerFilter);
    const codeMatch = loc.code && loc.code.toLowerCase().includes(lowerFilter);
    return nameMatch || codeMatch;
  });

  const selectedLoc = value ? locMap[value] : null;

  const formatOption = (loc) => {
    let label = loc.name;
    if (loc.code) label += ` [${loc.code}]`;
    const typeName = typeMap[loc.type_id];
    const parent = loc.parent_id ? locMap[loc.parent_id] : null;
    const context = [typeName, parent?.name].filter(Boolean).join(" / ");
    if (context) label += ` (${context})`;
    return label;
  };

  return (
    <span>
      {value && (
        <span style={{ marginRight: "0.25rem" }}>
          {selectedLoc ? formatOption(selectedLoc) : value}
          <button
            type="button"
            onClick={() => { onChange(null); setFilter(""); }}
            disabled={disabled}
            style={{ marginLeft: "0.25rem" }}
          >
            ✕
          </button>
        </span>
      )}
      {!value && (
        <span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search location…"
            disabled={disabled}
            style={{ width: "200px", marginRight: "0.25rem" }}
          />
          {filter && filtered.length > 0 && (
            <ul style={{ margin: 0, padding: "0.25rem 0", listStyle: "none", border: "1px solid var(--border)", maxHeight: "150px", overflowY: "auto", position: "absolute", background: "var(--code-bg)", color: "var(--text-h)", zIndex: 10, borderRadius: "4px" }}>
              {filtered.map((loc) => (
                <li key={loc.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(loc.id); setFilter(""); }}
                    disabled={disabled}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "0.25rem 0.5rem", width: "100%", textAlign: "left", color: "inherit" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-bg)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                  >
                    {formatOption(loc)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {filter && filtered.length === 0 && (
            <span style={{ color: "gray" }}>No matches</span>
          )}
        </span>
      )}
    </span>
  );
}
