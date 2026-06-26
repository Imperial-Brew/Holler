import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.location import Location
from app.models.task import Task
from app.routes.task_helpers import load_task_read
from app.schemas.task import TaskRead, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task is None or task.deleted:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = body.model_dump(exclude_unset=True)

    # Validate location_id if provided and non-null
    if "location_id" in updates and updates["location_id"] is not None:
        loc_result = await db.execute(
            select(Location.id).where(Location.id == updates["location_id"])
        )
        if loc_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=422, detail="location_id not found")

    # Completion side-effect: detect transition
    if "status" in updates:
        new_status = updates["status"]
        old_status = task.status
        if new_status == "done" and old_status != "done":
            updates["completed_at"] = datetime.now(timezone.utc)
        elif new_status != "done" and old_status == "done":
            updates["completed_at"] = None

    for key, value in updates.items():
        setattr(task, key, value)

    await db.commit()
    await db.refresh(task)

    return await load_task_read(db, task_id)


@router.delete("/{task_id}", response_model=TaskRead)
async def delete_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    # Idempotent: already deleted is a 200 no-op
    if not task.deleted:
        task.deleted = True
        task.deleted_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(task)

    return await load_task_read(db, task_id)
