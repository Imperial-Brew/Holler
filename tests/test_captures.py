"""
Tests for the capture → register flow: idempotent capture creation (offline
retries must not duplicate) and promotion of a capture into a task.
"""
import uuid

from tests.helpers import pull


async def test_create_capture_is_idempotent(client):
    cid = str(uuid.uuid4())
    r1 = await client.post("/captures", json={"id": cid, "raw_text": "x"})
    assert r1.status_code == 201, r1.text
    # Same client-generated id again (an offline retry) — accepted, not duplicated.
    r2 = await client.post("/captures", json={"id": cid, "raw_text": "x"})
    assert r2.status_code == 200

    caps = (await pull(client, since=0))["captures"]
    assert len([c for c in caps if c["id"] == cid]) == 1


async def test_register_promotes_capture_to_task(client):
    cid = str(uuid.uuid4())
    await client.post("/captures", json={"id": cid, "raw_text": "fix gate"})

    r = await client.post(f"/captures/{cid}/register", json={"title": "Fix gate"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["task"]["title"] == "Fix gate"
    assert body["capture"]["status"] == "registered"
    assert body["capture"]["promoted_task_id"] == body["task"]["id"]


async def test_register_is_idempotent(client):
    cid = str(uuid.uuid4())
    await client.post("/captures", json={"id": cid, "raw_text": "fix gate"})
    first = (await client.post(f"/captures/{cid}/register", json={"title": "Fix gate"})).json()

    again = await client.post(f"/captures/{cid}/register", json={"title": "Fix gate"})
    assert again.status_code == 200
    assert again.json()["task"]["id"] == first["task"]["id"]  # same task, not a second one
