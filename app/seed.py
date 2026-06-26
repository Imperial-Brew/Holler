"""Seed the stub owner user and starter location types. Idempotent — safe to re-run."""
import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import STUB_USER_ID
from app.database import async_session
from app.models.user import User
from app.models.location_type import LocationType

LOCATION_TYPE_NAMESPACE = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

STARTER_LOCATION_TYPES = [
    ("pasture", 0),
    ("field", 1),
    ("gate", 2),
    ("building", 3),
    ("room", 4),
    ("water", 5),
    ("fence line", 6),
    ("equipment pad", 7),
    ("other", 8),
]


async def seed():
    async with async_session() as session:  # type: AsyncSession
        # Seed stub user
        existing = await session.execute(
            select(User).where(User.id == STUB_USER_ID)
        )
        if existing.scalar_one_or_none() is not None:
            print("Stub user already exists — skipping.")
        else:
            user = User(id=STUB_USER_ID, name="Owner", role="owner")
            session.add(user)
            await session.commit()
            print(f"Seeded stub user: {user.id}")

        # Seed starter location types (deterministic UUIDs)
        seeded = 0
        for name, sort_order in STARTER_LOCATION_TYPES:
            type_id = uuid.uuid5(LOCATION_TYPE_NAMESPACE, name)
            existing = await session.execute(
                select(LocationType).where(LocationType.id == type_id)
            )
            if existing.scalar_one_or_none() is not None:
                continue
            lt = LocationType(id=type_id, name=name, sort=sort_order)
            session.add(lt)
            seeded += 1

        if seeded:
            await session.commit()
            print(f"Seeded {seeded} location types.")
        else:
            print("All location types already exist — skipping.")


if __name__ == "__main__":
    asyncio.run(seed())
