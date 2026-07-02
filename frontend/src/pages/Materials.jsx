import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../lib/db";
import { createMaterial, receiveMaterial, sync } from "../lib/sync";

export default function Materials() {
  // Re-sync on navigation so the Dexie cache isn't stale from an earlier session.
  useEffect(() => {
    if (navigator.onLine) {
      sync();
    }
  }, []);

  const materials = useLiveQuery(() => db.materials.orderBy("name").toArray(), [], []);
  const transactions = useLiveQuery(() => db.material_transactions.toArray(), [], []);

  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newReorderPoint, setNewReorderPoint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [receiveQtys, setReceiveQtys] = useState({});
  const [receivingId, setReceivingId] = useState(null);

  // On-hand = sum of ledger deltas per material.
  const onHand = {};
  for (const mt of transactions ?? []) {
    onHand[mt.material_id] = (onHand[mt.material_id] || 0) + Number(mt.delta);
  }

  const handleAddMaterial = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newUnit.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await createMaterial({
        name: newName.trim(),
        unit: newUnit.trim(),
        reorder_point: newReorderPoint === "" ? null : parseFloat(newReorderPoint),
      });
      setNewName("");
      setNewUnit("");
      setNewReorderPoint("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceive = async (materialId) => {
    const qty = parseFloat(receiveQtys[materialId]);
    if (isNaN(qty) || qty <= 0) return;

    setReceivingId(materialId);
    setError(null);
    try {
      await receiveMaterial(materialId, { qty });
      setReceiveQtys((prev) => ({ ...prev, [materialId]: "" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setReceivingId(null);
    }
  };

  return (
    <div className="materials-page">
      <h2>Materials Catalog</h2>

      <section style={{ marginBottom: "2rem", padding: "1rem", background: "var(--bg-muted)", borderRadius: "8px" }}>
        <h3>Add New Material</h3>
        <form onSubmit={handleAddMaterial} style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label htmlFor="material-name">Name</label>
            <input
              id="material-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Fence post"
              required
              disabled={submitting}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label htmlFor="material-unit">Unit</label>
            <input
              id="material-unit"
              type="text"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="e.g. each, ft, lb"
              required
              disabled={submitting}
              style={{ width: "100px" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label htmlFor="material-reorder">Reorder at (optional)</label>
            <input
              id="material-reorder"
              type="number"
              step="any"
              min="0"
              value={newReorderPoint}
              onChange={(e) => setNewReorderPoint(e.target.value)}
              placeholder="qty"
              disabled={submitting}
              style={{ width: "100px" }}
            />
          </div>
          <button type="submit" disabled={submitting || !newName.trim() || !newUnit.trim()}>
            {submitting ? "Adding..." : "Add Material"}
          </button>
        </form>
        {error && <p style={{ color: "red", marginBottom: 0 }}>{error}</p>}
      </section>

      <section>
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              <th style={{ padding: "0.5rem" }}>Name</th>
              <th style={{ padding: "0.5rem" }}>On Hand</th>
              <th style={{ padding: "0.5rem" }}>Reorder At</th>
              <th style={{ padding: "0.5rem" }}>Receive Stock</th>
            </tr>
          </thead>
          <tbody>
            {materials?.length === 0 && (
              <tr>
                <td colSpan="4" style={{ padding: "1rem", textAlign: "center", color: "gray" }}>
                  No materials in catalog.
                </td>
              </tr>
            )}
            {materials?.map((m) => {
              const have = onHand[m.id] || 0;
              const low = m.reorder_point != null && have <= Number(m.reorder_point);
              return (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem" }}>
                    {m.name}
                    {low && (
                      <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "red", fontWeight: "bold" }}>
                        low
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    {have} {m.unit}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    {m.reorder_point != null ? `${m.reorder_point} ${m.unit}` : "—"}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="qty"
                        style={{ width: "70px", padding: "0.25rem" }}
                        value={receiveQtys[m.id] || ""}
                        onChange={(e) => setReceiveQtys((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        disabled={receivingId === m.id}
                      />
                      <button
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                        onClick={() => handleReceive(m.id)}
                        disabled={!receiveQtys[m.id] || receivingId === m.id}
                      >
                        {receivingId === m.id ? "..." : "Receive"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
