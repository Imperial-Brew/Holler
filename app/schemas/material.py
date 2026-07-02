import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class MaterialCreate(BaseModel):
    name: str
    unit: str
    reorder_point: Optional[float] = None

class MaterialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    unit: str
    reorder_point: Optional[float]
    created_by: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime
    deleted: bool
    deleted_at: Optional[datetime]
    row_version: int

class MaterialTransactionRead(BaseModel):
    """Append-only ledger row for /sync/pull; clients sum deltas for on-hand."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    material_id: uuid.UUID
    delta: float
    reason: str
    task_id: Optional[uuid.UUID]
    occurred_at: datetime
    created_by: Optional[uuid.UUID]
    created_at: datetime
    row_version: int

class TaskMaterialRead(BaseModel):
    """Task→material requirement edge for /sync/pull; powers the shopping list."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    material_id: uuid.UUID
    qty_required: float
    created_by: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime
    deleted: bool
    deleted_at: Optional[datetime]
    row_version: int

class MaterialReceive(BaseModel):
    qty: float
    note: Optional[str] = None

class MaterialLeftover(BaseModel):
    material_id: uuid.UUID
    leftover_qty: float

class JobReconcile(BaseModel):
    materials: List[MaterialLeftover]
