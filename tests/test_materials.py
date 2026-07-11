"""
Tests for the material catalog + append-only ledger. The important one is
idempotent receiving: an offline "Got it" retried on reconnect must not
double-count the ledger (that would silently corrupt on-hand).
"""
import uuid

from tests.helpers import create_material, pull


async def test_create_material_appears_in_pull(client):
    m = await create_material(client, "Screws", "box")
    mats = (await pull(client, since=0))["materials"]
    assert any(x["id"] == m["id"] for x in mats)


async def test_receive_is_idempotent(client):
    m = await create_material(client, "Screws", "box")
    tx_id = str(uuid.uuid4())
    body = {"id": tx_id, "qty": 5}

    r1 = await client.post(f"/materials/{m['id']}/receive/", json=body)
    assert r1.status_code == 200, r1.text
    # Same client-generated id again (a retried flush) — must be a no-op.
    r2 = await client.post(f"/materials/{m['id']}/receive/", json=body)
    assert r2.status_code == 200

    txns = [t for t in (await pull(client, since=0))["material_transactions"] if t["material_id"] == m["id"]]
    assert len(txns) == 1
    assert float(txns[0]["delta"]) == 5


async def test_receive_rejects_nonpositive_qty(client):
    m = await create_material(client, "Screws", "box")
    r = await client.post(f"/materials/{m['id']}/receive/", json={"qty": 0})
    assert r.status_code == 422
