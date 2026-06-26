from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.capture import Capture
from app.schemas.sync import SyncPullResponse

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/pull", response_model=SyncPullResponse)
async def sync_pull(
    since: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Capture)
        .where(Capture.row_version > since)
        .order_by(Capture.row_version.asc())
    )
    captures = result.scalars().all()

    cursor = max(c.row_version for c in captures) if captures else since

    return SyncPullResponse(captures=captures, cursor=cursor)
