import uuid
from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.capture import CaptureRead


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    location_id: Optional[uuid.UUID]
    due_date: Optional[date]
    status: str
    priority: int
    est_effort_min: Optional[int]
    assigned_to: Optional[uuid.UUID]
    recurrence_rule: Optional[str]
    series_id: Optional[uuid.UUID]
    origin_capture_id: Optional[uuid.UUID]
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    deleted: bool
    deleted_at: Optional[datetime]
    row_version: int
    depends_on: list[uuid.UUID] = []


class RegisterRequest(BaseModel):
    title: str
    due_date: Optional[date] = None
    location_id: Optional[uuid.UUID] = None


class RegisterResponse(BaseModel):
    task: TaskRead
    capture: CaptureRead
