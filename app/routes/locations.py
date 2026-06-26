import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import STUB_USER_ID
from app.database import get_db
from app.models.location import Location
from app.models.location_type import LocationType
from app.schemas.location import LocationCreate, LocationRead

router = APIRouter(tags=["locations"])


@router.post("/locations", response_model=LocationRead, status_code=201)
async def create_location(
    body: LocationCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    # Validate type_id exists
    type_result = await db.execute(
        select(LocationType).where(LocationType.id == body.type_id)
    )
    if type_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=422, detail="type_id does not reference a valid location type")

    # Validate parent_id exists when non-null
    if body.parent_id is not None:
        if body.parent_id == body.id:
            raise HTTPException(status_code=422, detail="parent_id cannot equal id (no self-parent)")
        parent_result = await db.execute(
            select(Location).where(Location.id == body.parent_id)
        )
        if parent_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=422, detail="parent_id does not reference a valid location")

    # Idempotent insert (same pattern as captures)
    location = Location(
        id=body.id,
        name=body.name,
        code=body.code,
        type_id=body.type_id,
        parent_id=body.parent_id,
        lat=body.lat,
        lng=body.lng,
        notes=body.notes,
        created_by=STUB_USER_ID,
    )
    db.add(location)

    try:
        await db.flush()
    except Exception:
        await db.rollback()
        # Already exists — return existing row
        result = await db.execute(select(Location).where(Location.id == body.id))
        existing = result.scalar_one()
        response.status_code = 200
        return existing

    await db.commit()
    await db.refresh(location)
    return location
