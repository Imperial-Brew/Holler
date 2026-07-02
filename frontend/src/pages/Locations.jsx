import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../lib/db";
import { sync } from "../lib/sync";
import AddPlaceForm from "../components/AddPlaceForm";

export default function Locations() {
  // Re-sync on navigation so the Dexie cache isn't stale from an earlier session.
  useEffect(() => {
    if (navigator.onLine) {
      sync();
    }
  }, []);

  const locations = useLiveQuery(() => db.locations.toArray(), [], []);
  const locationTypes = useLiveQuery(() => db.location_types.toArray(), [], []);

  const typeMap = {};
  if (locationTypes) {
    for (const lt of locationTypes) typeMap[lt.id] = lt.name;
  }

  const locMap = {};
  if (locations) {
    for (const loc of locations) locMap[loc.id] = loc;
  }

  // To confirm the online state, we'd need to pass it from App, 
  // but let's just assume online for the form or handle it via navigator.
  const online = navigator.onLine;

  return (
    <div className="locations-page">
      <h2>Locations Catalog</h2>

      <section style={{ marginBottom: "2rem", padding: "1rem", background: "var(--bg-muted)", borderRadius: "8px" }}>
        <AddPlaceForm online={online} />
      </section>

      <section>
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              <th style={{ padding: "0.5rem" }}>Name</th>
              <th style={{ padding: "0.5rem" }}>Code</th>
              <th style={{ padding: "0.5rem" }}>Type</th>
              <th style={{ padding: "0.5rem" }}>Parent</th>
            </tr>
          </thead>
          <tbody>
            {locations?.length === 0 && (
              <tr>
                <td colSpan="4" style={{ padding: "1rem", textAlign: "center", color: "gray" }}>
                  No locations found.
                </td>
              </tr>
            )}
            {locations?.map((loc) => (
              <tr key={loc.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.5rem" }}>{loc.name}</td>
                <td style={{ padding: "0.5rem" }}>{loc.code || "—"}</td>
                <td style={{ padding: "0.5rem" }}>{typeMap[loc.type_id] || "—"}</td>
                <td style={{ padding: "0.5rem" }}>
                  {loc.parent_id ? (locMap[loc.parent_id]?.name || "Unknown") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
