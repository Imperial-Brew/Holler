import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class GoalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    parent_id: Optional[uuid.UUID]
    rank: int
    status: str
    created_at: datetime
    updated_at: datetime
