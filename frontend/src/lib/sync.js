import db from "./db";
import { authFetch } from "../holler_auth_client";

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
      const res = await authFetch("/captures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
  const res = await authFetch(`/sync/pull?since=${since}`);
  if (!res.ok) throw new Error(`pull failed: ${res.status}`);
  return res.json();
}

export async function applyPull(response) {
  await db.transaction(
    "rw",
    db.captures,
    db.tasks,
    db.locations,
    db.location_types,
    db.meta,
    async () => {
      for (const capture of response.captures) {
        if (capture.deleted) {
          await db.captures.delete(capture.id);
        } else {
          await db.captures.put({ ...capture, pendingPush: false });
        }
      }
      for (const task of response.tasks ?? []) {
        if (task.deleted) {
          await db.tasks.delete(task.id);
        } else {
          await db.tasks.put(task);
        }
      }
      for (const loc of response.locations ?? []) {
        if (loc.deleted) {
          await db.locations.delete(loc.id);
        } else {
          await db.locations.put(loc);
        }
      }
      for (const lt of response.location_types ?? []) {
        if (lt.deleted) {
          await db.location_types.delete(lt.id);
        } else {
          await db.location_types.put(lt);
        }
      }
      await db.meta.put({ key: "cursor", value: response.cursor });
    }
  );
}

export async function createLocation({ name, type_id, parent_id, code }) {
  const id = crypto.randomUUID();
  const body = { id, name, type_id };
  if (parent_id) body.parent_id = parent_id;
  if (code) body.code = code;

  const res = await authFetch("/locations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Create location failed (${res.status}): ${detail}`);
  }
  const location = await res.json();
  await db.locations.put(location);
  return location;
}

export async function registerCapture(captureId, { title, due_date, location_id }) {
  const res = await authFetch(`/captures/${captureId}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, due_date: due_date || null, location_id: location_id || null }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Register failed (${res.status}): ${detail}`);
  }
  const { task, capture } = await res.json();
  await db.tasks.put(task);
  await db.captures.put({ ...capture, pendingPush: false });
  return { task, capture };
}

export async function setTaskStatus(id, status) {
  const res = await authFetch(`/tasks/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Set status failed (${res.status}): ${detail}`);
  }
  const task = await res.json();
  await db.tasks.put(task);
  return task;
}

export async function deleteTask(id) {
  const res = await authFetch(`/tasks/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Delete task failed (${res.status}): ${detail}`);
  }
  await db.tasks.delete(id);
}

export async function addDependency(taskId, dependsOnId) {
  const res = await authFetch(`/tasks/${taskId}/dependencies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ depends_on_id: dependsOnId }),
  });
  if (res.status === 409) {
    throw new Error("409");
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Add dependency failed (${res.status}): ${detail}`);
  }
  const task = await res.json();
  await db.tasks.put(task);
  return task;
}

export async function removeDependency(taskId, dependsOnId) {
  const res = await authFetch(`/tasks/${taskId}/dependencies/${dependsOnId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Remove dependency failed (${res.status}): ${detail}`);
  }
  const task = await res.json();
  await db.tasks.put(task);
  return task;
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
