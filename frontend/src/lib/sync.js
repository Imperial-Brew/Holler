import db from "./db";

const API = import.meta.env.VITE_API_URL;
const TOKEN = import.meta.env.VITE_AUTH_TOKEN;

let syncing = false;

export async function createCapture({ raw_text, location_hint, source }) {
  const id = crypto.randomUUID();
  const row = {
    id,
    raw_text,
    location_hint: location_hint ?? null,
    source: source ?? "self",
    status: "pending",
    created_at: new Date().toISOString(),
    deleted: false,
    pendingPush: true,
  };
  await db.captures.put(row);

  if (navigator.onLine) {
    flush(); // fire-and-forget
  }
}

export async function flush() {
  const pending = await db.captures.filter((c) => c.pendingPush).toArray();

  for (const row of pending) {
    try {
      const body = {
        id: row.id,
        raw_text: row.raw_text,
        location_hint: row.location_hint,
        source: row.source,
      };
      const res = await fetch(`${API}/captures`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`POST failed: ${res.status}`);
      const confirmed = await res.json();
      await db.captures.put({ ...confirmed, pendingPush: false });
    } catch (e) {
      console.warn("flush: stopping on error", e);
      break;
    }
  }
}

export async function pull(since) {
  const res = await fetch(`${API}/sync/pull?since=${since}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`pull failed: ${res.status}`);
  return res.json();
}

export async function applyPull(response) {
  const tx = db.transaction("rw", db.captures, db.meta, async () => {
    for (const capture of response.captures) {
      if (capture.deleted) {
        await db.captures.delete(capture.id);
      } else {
        await db.captures.put({ ...capture, pendingPush: false });
      }
    }
    await db.meta.put({ key: "cursor", value: response.cursor });
  });
  await tx;
}

export async function sync() {
  if (syncing) return;
  syncing = true;
  try {
    await flush();
    const meta = await db.meta.get("cursor");
    const since = meta?.value ?? 0;
    const response = await pull(since);
    await applyPull(response);
  } catch (e) {
    console.warn("sync: error (will retry)", e);
  } finally {
    syncing = false;
  }
}
