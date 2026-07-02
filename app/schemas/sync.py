from pydantic import BaseModel

from app.schemas.capture import CaptureRead
from app.schemas.job import JobSyncRead
from app.schemas.location import LocationRead, LocationTypeRead
from app.schemas.task import TaskRead
from app.schemas.tool import ToolRead


class SyncPullResponse(BaseModel):
    captures: list[CaptureRead]
    tasks: list[TaskRead]
    locations: list[LocationRead]
    location_types: list[LocationTypeRead]
    tools: list[ToolRead]
    jobs: list[JobSyncRead]
    cursor: int
