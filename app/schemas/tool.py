import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class ToolRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    status: str
    location_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    deleted: bool = False
    deleted_at: Optional[datetime] = None
    row_version: int

class ToolCreate(BaseModel):
    name: str
    location_id: Optional[uuid.UUID] = None
