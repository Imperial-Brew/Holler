import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class LocationTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sort: int
    created_at: datetime
    updated_at: datetime
    deleted: bool
    deleted_at: Optional[datetime]
    row_version: int


class LocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: Optional[str]
    type_id: uuid.UUID
    parent_id: Optional[uuid.UUID]
    lat: Optional[float]
    lng: Optional[float]
    geometry: Optional[dict]
    notes: Optional[str]
    photo_url: Optional[str]
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    deleted: bool
    deleted_at: Optional[datetime]
    row_version: int


class LocationCreate(BaseModel):
    id: uuid.UUID
    name: str
    type_id: uuid.UUID
    code: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    notes: Optional[str] = None
