const API = import.meta.env.VITE_API_URL;
const TOKEN = import.meta.env.VITE_AUTH_TOKEN;

export async function pull(since) {
  const res = await fetch(`${API}/sync/pull?since=${since}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`pull failed: ${res.status}`);
  return res.json();
}

export function applyPull(capturesMap, response) {
  const next = new Map(capturesMap);
  for (const capture of response.captures) {
    if (capture.deleted) {
      next.delete(capture.id);
    } else {
      next.set(capture.id, capture);
    }
  }
  return { captures: next, cursor: response.cursor };
}
