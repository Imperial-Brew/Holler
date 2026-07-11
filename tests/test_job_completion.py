"""
Tests for manual job completion (the trigger + endpoint logic changed in the
"manual job completion" migration).

The rules being pinned down:
  - Creating a job auto-creates a hidden milestone but the job starts open.
  - Finishing every task does NOT auto-complete the job (it becomes completable,
    not complete).
  - POST /jobs/{id}/complete/ marks it done, and only when no task is still open.
  - Adding a task to a completed job reopens it.
  - A cancelled task counts as resolved (it doesn't block completion).
"""


async def _create_job(client, title="Fence line"):
    r = await client.post("/jobs/", json={"title": title})
    assert r.status_code == 200, r.text
    return r.json()


async def _add_task(client, job_id, title="Dig post holes"):
    r = await client.post(
        f"/jobs/{job_id}/tasks/",
        json={"title": title, "depends_on_ids": [], "required_tool_ids": [], "required_materials": []},
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _set_status(client, task_id, status):
    r = await client.patch(f"/tasks/{task_id}", json={"status": status})
    assert r.status_code == 200, r.text
    return r.json()


async def _get_job(client, job_id):
    r = await client.get(f"/jobs/{job_id}")
    assert r.status_code == 200, r.text
    return r.json()


async def test_new_job_starts_open_with_a_milestone(client):
    job = await _create_job(client)
    assert job["status"] == "open"
    # The milestone is hidden; the detail view lists only real (non-milestone) tasks.
    assert job["tasks"] == []


async def test_finishing_all_tasks_does_not_autocomplete(client):
    job = await _create_job(client)
    detail = await _add_task(client, job["id"])
    task_id = detail["tasks"][0]["id"]

    await _set_status(client, task_id, "done")

    after = await _get_job(client, job["id"])
    # The whole point of manual completion: all tasks done != job done.
    assert after["status"] != "done"


async def test_complete_job_marks_it_done(client):
    job = await _create_job(client)
    detail = await _add_task(client, job["id"])
    await _set_status(client, detail["tasks"][0]["id"], "done")

    r = await client.post(f"/jobs/{job['id']}/complete/")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "done"
    assert (await _get_job(client, job["id"]))["status"] == "done"


async def test_cannot_complete_with_an_open_task(client):
    job = await _create_job(client)
    await _add_task(client, job["id"])  # left open

    r = await client.post(f"/jobs/{job['id']}/complete/")
    assert r.status_code == 400, r.text
    assert (await _get_job(client, job["id"]))["status"] != "done"


async def test_adding_a_task_to_a_completed_job_reopens_it(client):
    job = await _create_job(client)
    detail = await _add_task(client, job["id"])
    await _set_status(client, detail["tasks"][0]["id"], "done")
    completed = (await client.post(f"/jobs/{job['id']}/complete/")).json()
    assert completed["status"] == "done"

    # New work arrives on a finished job.
    reopened = await _add_task(client, job["id"], title="Extra gate")
    assert reopened["status"] != "done"
    assert (await _get_job(client, job["id"]))["status"] != "done"


async def test_cancelled_task_does_not_block_completion(client):
    job = await _create_job(client)
    detail = await _add_task(client, job["id"])
    await _set_status(client, detail["tasks"][0]["id"], "cancelled")

    r = await client.post(f"/jobs/{job['id']}/complete/")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "done"
