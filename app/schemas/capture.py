import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CaptureCreate(BaseModel):
    id: uuid.UUID
    raw_text: str
    location_hint: Optional[str] = None
    source: str = "self"


class CaptureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    raw_text: str
    location_hint: Optional[str]
    location_id: Optional[uuid.UUID]
    source: str
    status: str
    promoted_task_id: Optional[uuid.UUID]
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    deleted: bool
    deleted_at: Optional[datetime]
    row_version: int
