import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.task_dependency import TaskDependency


async def load_task_read(session: AsyncSession, task_id: uuid.UUID) -> dict:
    """Load a task and its depends_on list, return as a dict suitable for TaskRead."""
    result = await session.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one()
    edge_result = await session.execute(
        select(TaskDependency.depends_on_id)
        .where(TaskDependency.task_id == task_id)
    )
    depends_on = [row[0] for row in edge_result]
    td = {c.key: getattr(task, c.key) for c in task.__table__.columns}
    td["depends_on"] = depends_on
    return td
