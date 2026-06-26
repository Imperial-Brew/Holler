from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.capture import Capture
from app.models.task import Task
from app.schemas.sync import SyncPullResponse

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/pull", response_model=SyncPullResponse)
async def sync_pull(
    since: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    cap_result = await db.execute(
        select(Capture)
        .where(Capture.row_version > since)
        .order_by(Capture.row_version.asc())
    )
    captures = cap_result.scalars().all()

    task_result = await db.execute(
        select(Task)
        .where(Task.row_version > since)
        .order_by(Task.row_version.asc())
    )
    tasks = task_result.scalars().all()

    all_versions = [c.row_version for c in captures] + [t.row_version for t in tasks]
    cursor = max(all_versions) if all_versions else since

    return SyncPullResponse(captures=captures, tasks=tasks, cursor=cursor)
