import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.task import Task
from app.models.task_dependency import TaskDependency
from app.routes.task_helpers import load_task_read
from app.schemas.task import TaskRead

router = APIRouter(prefix="/tasks", tags=["tasks"])


class AddDependencyRequest(BaseModel):
    depends_on_id: uuid.UUID


@router.post("/{task_id}/dependencies", response_model=TaskRead)
async def add_dependency(
    task_id: uuid.UUID,
    body: AddDependencyRequest,
    db: AsyncSession = Depends(get_db),
):
    # Validate both tasks exist
    for tid, label in [(task_id, "task_id"), (body.depends_on_id, "depends_on_id")]:
        result = await db.execute(select(Task.id).where(Task.id == tid))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail=f"{label} not found")

    # Self-edge check
    if task_id == body.depends_on_id:
        raise HTTPException(status_code=422, detail="A task cannot depend on itself")

    # Cycle prevention: check if depends_on_id already transitively depends on task_id
    cycle_check = await db.execute(
        text("""
            WITH RECURSIVE ancestors AS (
                SELECT depends_on_id AS id FROM task_dependencies WHERE task_id = :depends_on_id
                UNION
                SELECT d.depends_on_id FROM task_dependencies d JOIN ancestors a ON d.task_id = a.id
            )
            SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = :task_id)
        """),
        {"depends_on_id": body.depends_on_id, "task_id": task_id},
    )
    if cycle_check.scalar():
        raise HTTPException(status_code=409, detail="Adding this dependency would create a cycle")

    # Idempotent insert
    stmt = insert(TaskDependency).values(
        task_id=task_id, depends_on_id=body.depends_on_id
    ).on_conflict_do_nothing()
    await db.execute(stmt)
    await db.commit()

    # Refresh to get bumped row_version
    return await load_task_read(db, task_id)


@router.delete("/{task_id}/dependencies/{depends_on_id}", response_model=TaskRead)
async def remove_dependency(
    task_id: uuid.UUID,
    depends_on_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    # Idempotent delete
    await db.execute(
        delete(TaskDependency).where(
            TaskDependency.task_id == task_id,
            TaskDependency.depends_on_id == depends_on_id,
        )
    )
    await db.commit()

    return await load_task_read(db, task_id)
