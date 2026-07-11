"""
Tests for the offline sync pull — the cursor mechanics and the "is every table
actually in the payload" guard. A test like test_job_and_material_in_pull would
have caught the empty-Jobs incident (a store added to Dexie but not to /sync/pull).
"""
from tests.helpers import create_capture, create_job, create_material, pull


async def test_pull_returns_new_rows_then_is_idempotent(client):
    await create_capture(client, "feed the goats")

    first = await pull(client, since=0)
    assert len(first["captures"]) == 1
    cursor = first["cursor"]
    assert cursor > 0

    # Pulling again from the new cursor returns nothing, and the cursor holds.
    second = await pull(client, since=cursor)
    assert second["captures"] == []
    assert second["cursor"] == cursor


async def test_cursor_advances_with_each_change(client):
    await create_capture(client, "first")
    c1 = (await pull(client, since=0))["cursor"]

    await create_capture(client, "second")
    r2 = await pull(client, since=c1)
    assert len(r2["captures"]) == 1  # only the newer one
    assert r2["cursor"] > c1


async def test_jobs_and_materials_are_in_the_pull_payload(client):
    """Guards the regression where a table exists but isn't synced."""
    job = await create_job(client, "Barn")
    material = await create_material(client, "Nails", "box")

    resp = await pull(client, since=0)
    assert any(j["id"] == job["id"] for j in resp["jobs"])
    assert any(m["id"] == material["id"] for m in resp["materials"])
