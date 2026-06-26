import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../lib/db";
import { createLocation } from "../lib/sync";
import LocationPicker from "./LocationPicker";

export default function AddPlaceForm({ online }) {
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState("");
  const [parentId, setParentId] = useState(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const locationTypes = useLiveQuery(
    () => db.location_types.toArray().then((arr) => arr.sort((a, b) => a.sort - b.sort)),
    [],
    []
  );

  const disabled = !online || submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (disabled || !name.trim() || !typeId) return;
    setSubmitting(true);
    setError(null);
    try {
      await createLocation({
        name: name.trim(),
        type_id: typeId,
        parent_id: parentId || undefined,
        code: code.trim() || undefined,
      });
      setName("");
      setTypeId("");
      setParentId(null);
      setCode("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
      <strong>Add Place</strong>
      {!online && (
        <span style={{ color: "gray", marginLeft: "0.5rem" }}>
          — Connect to add places
        </span>
      )}
      <br />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (required)"
        disabled={disabled}
        style={{ marginRight: "0.25rem" }}
      />
      <select
        value={typeId}
        onChange={(e) => setTypeId(e.target.value)}
        disabled={disabled}
        style={{ marginRight: "0.25rem" }}
      >
        <option value="">Type…</option>
        {locationTypes.map((lt) => (
          <option key={lt.id} value={lt.id}>
            {lt.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Code (optional)"
        disabled={disabled}
        style={{ marginRight: "0.25rem" }}
      />
      <br />
      <span style={{ marginRight: "0.25rem" }}>Parent:</span>
      <LocationPicker value={parentId} onChange={setParentId} disabled={disabled} />
      <br />
      <button type="submit" disabled={disabled || !name.trim() || !typeId}>
        {submitting ? "Adding…" : "Add Place"}
      </button>
      {error && (
        <span style={{ color: "red", marginLeft: "0.5rem" }}>{error}</span>
      )}
    </form>
  );
}
