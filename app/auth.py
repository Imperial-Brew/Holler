"""Auth stub for Phase 0.

Provides a hardcoded owner user UUID. Replace with real auth
(e.g. JWT / session) when the requester role lands in Phase 8.
"""
import uuid

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User

STUB_USER_ID = uuid.UUID("00000000-0000-4000-a000-000000000001")


async def get_current_user(db: AsyncSession = Depends(get_db)) -> User:
    result = await db.execute(select(User).where(User.id == STUB_USER_ID))
    user = result.scalar_one_or_none()
    if user is None:
        raise RuntimeError(
            "Stub user not found. Run the seed script: "
            "python -m app.seed"
        )
    return user
