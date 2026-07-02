import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../lib/db";
import { createTool } from "../lib/sync";
import LocationPicker from "../components/LocationPicker";

export default function Tools() {
  const tools = useLiveQuery(() => db.tools.orderBy("name").toArray(), [], []);
  const locations = useLiveQuery(() => db.locations.toArray(), [], []);
  
  const [newName, setNewName] = useState("");
  const [newLocationId, setNewLocationId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const locMap = {};
  if (locations) {
    for (const loc of locations) locMap[loc.id] = loc;
  }

  const handleAddTool = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setSubmitting(true);
    try {
      await createTool({ name: newName.trim(), location_id: newLocationId });
      setNewName("");
      setNewLocationId(null);
    } catch (err) {
      alert("Failed to create tool: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tools-page">
      <h2>Tools Catalog</h2>

      <section style={{ marginBottom: "2rem", padding: "1rem", background: "var(--bg-muted)", borderRadius: "8px" }}>
        <h3>Add New Tool</h3>
        <form onSubmit={handleAddTool} style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label htmlFor="tool-name">Tool Name</label>
            <input
              id="tool-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Circular Saw"
              required
              disabled={submitting}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label>Location (Optional)</label>
            <LocationPicker 
              value={newLocationId} 
              onChange={setNewLocationId} 
              disabled={submitting}
            />
          </div>
          <button type="submit" disabled={submitting || !newName.trim()}>
            {submitting ? "Adding..." : "Add Tool"}
          </button>
        </form>
      </section>

      <section>
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              <th style={{ padding: "0.5rem" }}>Name</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>Location</th>
            </tr>
          </thead>
          <tbody>
            {tools?.length === 0 && (
              <tr>
                <td colSpan="3" style={{ padding: "1rem", textAlign: "center", color: "gray" }}>
                  No tools found in catalog.
                </td>
              </tr>
            )}
            {tools?.map((tool) => (
              <tr key={tool.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.5rem" }}>{tool.name}</td>
                <td style={{ padding: "0.5rem" }}>
                  <span style={{ 
                    fontSize: "0.8rem", 
                    padding: "0.2rem 0.4rem", 
                    borderRadius: "4px",
                    background: tool.status === 'available' ? '#e8f5e9' : '#f5f5f5',
                    color: tool.status === 'available' ? '#2e7d32' : '#616161'
                  }}>
                    {tool.status}
                  </span>
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {tool.location_id ? (locMap[tool.location_id]?.name || "Unknown") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
