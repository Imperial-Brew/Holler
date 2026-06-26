from pydantic import BaseModel

from app.schemas.capture import CaptureRead
from app.schemas.location import LocationRead, LocationTypeRead
from app.schemas.task import TaskRead


class SyncPullResponse(BaseModel):
    captures: list[CaptureRead]
    tasks: list[TaskRead]
    locations: list[LocationRead]
    location_types: list[LocationTypeRead]
    cursor: int
