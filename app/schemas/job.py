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
