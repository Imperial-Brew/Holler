from pydantic import BaseModel

from app.schemas.capture import CaptureRead


class SyncPullResponse(BaseModel):
    captures: list[CaptureRead]
    cursor: int
