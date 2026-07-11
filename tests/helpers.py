"""Small helpers so tests read like descriptions of behavior, not HTTP plumbing."""
import uuid


async def create_capture(client, raw_text="a note"):
    cid = str(uuid.uuid4())
    r = await client.post("/captures", json={"id": cid, "raw_text": raw_text})
    assert r.status_code in (200, 201), r.text
    return r.json()


async def register_task(client, title="A task"):
    """Capture then promote to a real task; returns the task id."""
    cid = str(uuid.uuid4())
    await client.post("/captures", json={"id": cid, "raw_text": title})
    r = await client.post(f"/captures/{cid}/register", json={"title": title})
    assert r.status_code in (200, 201), r.text
    return r.json()["task"]["id"]


async def create_job(client, title="A job"):
    r = await client.post("/jobs/", json={"title": title})
    assert r.status_code == 200, r.text
    return r.json()


async def create_material(client, name="Material", unit="ea", reorder_point=None):
    r = await client.post(
        "/materials/", json={"name": name, "unit": unit, "reorder_point": reorder_point}
    )
    assert r.status_code == 200, r.text
    return r.json()


async def pull(client, since=0):
    r = await client.get(f"/sync/pull?since={since}")
    assert r.status_code == 200, r.text
    return r.json()
