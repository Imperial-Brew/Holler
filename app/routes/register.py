import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import STUB_USER_ID
from app.database import get_db
from app.models.capture import Capture
from app.models.location import Location
from app.models.task import Task
from app.schemas.task import RegisterRequest, RegisterResponse

router = APIRouter(tags=["captures"])


@router.post(
    "/captures/{capture_id}/register",
    response_model=RegisterResponse,
    status_code=201,
)
async def register_capture(
    capture_id: uuid.UUID,
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    # 1. Load capture
    result = await db.execute(select(Capture).where(Capture.id == capture_id))
    capture = result.scalar_one_or_none()
    if capture is None:
        raise HTTPException(status_code=404, detail="Capture not found")

    # 2. Idempotency: already registered → return existing task
    if capture.status == "registered" and capture.promoted_task_id is not None:
        task_result = await db.execute(
            select(Task).where(Task.id == capture.promoted_task_id)
        )
        task = task_result.scalar_one()
        response.status_code = 200
        return RegisterResponse(task=task, capture=capture)

    # 3. Validate location_id if provided
    if body.location_id is not None:
        loc_result = await db.execute(
            select(Location).where(Location.id == body.location_id)
        )
        if loc_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=422, detail="location_id does not reference a valid location")

    # 4. Atomic: create task + flip capture in one transaction
    task = Task(
        id=uuid.uuid4(),
        title=body.title,
        due_date=body.due_date,
        location_id=body.location_id,
        origin_capture_id=capture.id,
        created_by=STUB_USER_ID,
    )
    db.add(task)
    # Flush task first so FK on captures.promoted_task_id is satisfied
    await db.flush()

    capture.status = "registered"
    capture.promoted_task_id = task.id

    await db.commit()

    # 4. Refresh to get trigger-set row_versions
    await db.refresh(task)
    await db.refresh(capture)

    return RegisterResponse(task=task, capture=capture)
