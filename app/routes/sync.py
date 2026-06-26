from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.capture import Capture
from app.models.location import Location
from app.models.location_type import LocationType
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

    loc_result = await db.execute(
        select(Location)
        .where(Location.row_version > since)
        .order_by(Location.row_version.asc())
    )
    locations = loc_result.scalars().all()

    lt_result = await db.execute(
        select(LocationType)
        .where(LocationType.row_version > since)
        .order_by(LocationType.row_version.asc())
    )
    location_types = lt_result.scalars().all()

    all_versions = (
        [c.row_version for c in captures]
        + [t.row_version for t in tasks]
        + [l.row_version for l in locations]
        + [lt.row_version for lt in location_types]
    )
    cursor = max(all_versions) if all_versions else since

    return SyncPullResponse(
        captures=captures,
        tasks=tasks,
        locations=locations,
        location_types=location_types,
        cursor=cursor,
    )
