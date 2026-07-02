from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.capture import Capture
from app.models.job import Job
from app.models.location import Location
from app.models.location_type import LocationType
from app.models.material import Material, MaterialTransaction
from app.models.task import Task
from app.models.task_dependency import TaskDependency
from app.models.tool import Tool
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
    tasks = list(task_result.scalars().all())

    # Batch-load dependency edges for all tasks in the pull set
    if tasks:
        task_ids = [t.id for t in tasks]
        edge_result = await db.execute(
            select(TaskDependency.task_id, TaskDependency.depends_on_id)
            .where(TaskDependency.task_id.in_(task_ids))
        )
        dep_map = defaultdict(list)
        for tid, did in edge_result:
            dep_map[tid].append(did)
    else:
        dep_map = {}

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

    tool_result = await db.execute(
        select(Tool)
        .where(Tool.row_version > since)
        .order_by(Tool.row_version.asc())
    )
    tools = tool_result.scalars().all()

    job_result = await db.execute(
        select(Job)
        .where(Job.row_version > since)
        .order_by(Job.row_version.asc())
    )
    jobs = job_result.scalars().all()

    material_result = await db.execute(
        select(Material)
        .where(Material.row_version > since)
        .order_by(Material.row_version.asc())
    )
    materials = material_result.scalars().all()

    mt_result = await db.execute(
        select(MaterialTransaction)
        .where(MaterialTransaction.row_version > since)
        .order_by(MaterialTransaction.row_version.asc())
    )
    material_transactions = mt_result.scalars().all()

    all_versions = (
        [c.row_version for c in captures]
        + [t.row_version for t in tasks]
        + [l.row_version for l in locations]
        + [lt.row_version for lt in location_types]
        + [tl.row_version for tl in tools]
        + [j.row_version for j in jobs]
        + [m.row_version for m in materials]
        + [mt.row_version for mt in material_transactions]
    )
    cursor = max(all_versions) if all_versions else since

    # Attach depends_on to each task for serialization
    task_dicts = []
    for t in tasks:
        td = {c.key: getattr(t, c.key) for c in t.__table__.columns}
        td["depends_on"] = dep_map.get(t.id, [])
        task_dicts.append(td)

    return SyncPullResponse(
        captures=captures,
        tasks=task_dicts,
        locations=locations,
        location_types=location_types,
        tools=tools,
        jobs=jobs,
        materials=materials,
        material_transactions=material_transactions,
        cursor=cursor,
    )
