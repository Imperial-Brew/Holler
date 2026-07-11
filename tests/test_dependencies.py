"""
Tests for the task dependency graph: adding an edge, and the two guards that
keep it a DAG (no self-edges, no cycles). The cycle check is recursive SQL —
exactly the kind of thing that's easy to break silently.
"""
from tests.helpers import register_task


async def test_add_dependency(client):
    a = await register_task(client, "A")
    b = await register_task(client, "B")

    r = await client.post(f"/tasks/{a}/dependencies", json={"depends_on_id": b})
    assert r.status_code == 200, r.text
    assert b in r.json()["depends_on"]


async def test_self_dependency_is_rejected(client):
    a = await register_task(client, "A")
    r = await client.post(f"/tasks/{a}/dependencies", json={"depends_on_id": a})
    assert r.status_code == 422


async def test_cycle_is_rejected(client):
    a = await register_task(client, "A")
    b = await register_task(client, "B")

    # a depends on b …
    assert (await client.post(f"/tasks/{a}/dependencies", json={"depends_on_id": b})).status_code == 200
    # … so b depending on a would close a loop.
    r = await client.post(f"/tasks/{b}/dependencies", json={"depends_on_id": a})
    assert r.status_code == 409
