from pydantic import BaseModel

from app.schemas.capture import CaptureRead
from app.schemas.task import TaskRead


class SyncPullResponse(BaseModel):
    captures: list[CaptureRead]
    tasks: list[TaskRead]
    cursor: int
