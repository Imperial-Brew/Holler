import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../lib/db";
import { sync, receiveMaterial } from "../lib/sync";

export default function ShoppingList() {
  // materialId currently being confirmed, and the entered quantity.
  const [buyingId, setBuyingId] = useState(null);
  const [buyQty, setBuyQty] = useState("");

  // Re-sync on navigation so the list reflects other devices' changes.
  useEffect(() => {
    if (navigator.onLine) {
      sync();
    }
  }, []);

  const materials = useLiveQuery(() => db.materials.toArray(), [], []);
  const transactions = useLiveQuery(() => db.material_transactions.toArray(), [], []);
  const taskMaterials = useLiveQuery(() => db.task_materials.toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);

  const loading =
    materials === undefined ||
    transactions === undefined ||
    taskMaterials === undefined ||
    tasks === undefined;

  // Mirror the server's v_shopping_list: needed comes from open (non-done,
  // non-milestone, non-deleted) tasks' requirements; on-hand is the ledger sum;
  // show materials where needed − on-hand > 0.
  const taskById = {};
  for (const t of tasks ?? []) taskById[t.id] = t;

  const needed = {};
  for (const tm of taskMaterials ?? []) {
    const t = taskById[tm.task_id];
    if (!t || t.deleted || t.is_milestone || t.status === "done") continue;
    needed[tm.material_id] = (needed[tm.material_id] || 0) + Number(tm.qty_required);
  }

  const onHand = {};
  for (const mt of transactions ?? []) {
    onHand[mt.material_id] = (onHand[mt.material_id] || 0) + Number(mt.delta);
  }

  const materialById = {};
  for (const m of materials ?? []) materialById[m.id] = m;

  const rows = Object.keys(needed)
    .map((materialId) => {
      const need = needed[materialId];
      const have = onHand[materialId] || 0;
      const material = materialById[materialId];
      return {
        materialId,
        name: material?.name ?? "Unknown",
        unit: material?.unit ?? "",
        needed: need,
        onHand: have,
        shortfall: need - have,
      };
    })
    .filter((r) => r.shortfall > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const startBuying = (row) => {
    setBuyingId(row.materialId);
    setBuyQty(String(row.shortfall)); // prefill with what's short; editable
  };

  const cancelBuying = () => {
    setBuyingId(null);
    setBuyQty("");
  };

  const confirmBuying = async (materialId) => {
    const qty = parseFloat(buyQty);
    if (isNaN(qty) || qty <= 0) return;
    // Writes a local ledger entry (works offline); once on-hand covers what's
    // needed the row drops off the list automatically.
    await receiveMaterial(materialId, { qty });
    cancelBuying();
  };

  return (
    <div className="shopping-list-page">
      <h2>Shopping List</h2>
      <p style={{ color: "gray", fontSize: "0.9rem" }}>
        What open jobs need beyond what's on hand. Updates as you receive stock
        and complete tasks.
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "gray" }}>Nothing to buy — everything needed is on hand.</p>
      ) : (
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              <th style={{ padding: "0.5rem" }}>Material</th>
              <th style={{ padding: "0.5rem" }}>Needed</th>
              <th style={{ padding: "0.5rem" }}>On Hand</th>
              <th style={{ padding: "0.5rem" }}>Buy</th>
              <th style={{ padding: "0.5rem" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.materialId} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.5rem" }}>{r.name}</td>
                <td style={{ padding: "0.5rem" }}>{r.needed} {r.unit}</td>
                <td style={{ padding: "0.5rem" }}>{r.onHand} {r.unit}</td>
                <td style={{ padding: "0.5rem", color: "#f44336", fontWeight: "bold" }}>
                  {r.shortfall} {r.unit}
                </td>
                <td style={{ padding: "0.5rem", textAlign: "right" }}>
                  {buyingId === r.materialId ? (
                    <span style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        autoFocus
                        value={buyQty}
                        onChange={(e) => setBuyQty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmBuying(r.materialId);
                          if (e.key === "Escape") cancelBuying();
                        }}
                        style={{ width: "70px", padding: "0.2rem" }}
                      />
                      <span style={{ color: "gray", fontSize: "0.85rem" }}>{r.unit}</span>
                      <button onClick={() => confirmBuying(r.materialId)} style={{ padding: "0.2rem 0.5rem" }}>
                        Save
                      </button>
                      <button onClick={cancelBuying} style={{ padding: "0.2rem 0.5rem" }}>
                        ✕
                      </button>
                    </span>
                  ) : (
                    <button onClick={() => startBuying(r)} style={{ padding: "0.2rem 0.6rem" }}>
                      Got it
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
