import uuid
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: str
    created_at: datetime


class JobSyncRead(BaseModel):
    """Full jobs row for /sync/pull. The status column here is the trigger-
    maintained one; clients derive display status from the milestone task."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: str
    location_id: Optional[uuid.UUID]
    priority: Optional[int]
    due_date: Optional[date]
    created_by: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime
    deleted: bool
    deleted_at: Optional[datetime]
    row_version: int

class JobTaskRead(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    board_state: str # from v_task_board

class JobToolRead(BaseModel):
    id: uuid.UUID
    name: str
    status: str

class JobMaterialRead(BaseModel):
    material_id: uuid.UUID
    name: str
    unit: str
    needed: float
    on_hand: float
    shortfall: float

class JobCreate(BaseModel):
    title: str

class JobTaskCreate(BaseModel):
    title: str
    depends_on_ids: List[uuid.UUID] = []
    required_tool_ids: List[uuid.UUID] = []

class JobDetailRead(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    reconciled: bool = False
    tasks: List[JobTaskRead]
    tools: List[JobToolRead]
    materials: List[JobMaterialRead]
