import uuid
from typing import Optional, List
from pydantic import BaseModel

class MaterialReceive(BaseModel):
    qty: float
    note: Optional[str] = None

class MaterialLeftover(BaseModel):
    material_id: uuid.UUID
    leftover_qty: float

class JobReconcile(BaseModel):
    materials: List[MaterialLeftover]
