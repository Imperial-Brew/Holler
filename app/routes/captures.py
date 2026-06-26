from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import STUB_USER_ID
from app.database import get_db
from app.models.capture import Capture
from app.schemas.capture import CaptureCreate, CaptureRead

router = APIRouter(tags=["captures"])


@router.post("/captures", response_model=CaptureRead, status_code=201)
async def create_capture(
    body: CaptureCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        pg_insert(Capture)
        .values(
            id=body.id,
            raw_text=body.raw_text,
            location_hint=body.location_hint,
            source=body.source,
            created_by=STUB_USER_ID,
        )
        .on_conflict_do_nothing(index_elements=["id"])
    )
    result = await db.execute(stmt)
    await db.commit()

    # If no row was inserted, it already existed — return 200
    if result.rowcount == 0:
        response.status_code = 200

    row = await db.execute(select(Capture).where(Capture.id == body.id))
    capture = row.scalar_one()
    return capture
