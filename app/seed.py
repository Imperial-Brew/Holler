"""Seed the stub owner user. Idempotent — safe to re-run."""
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import STUB_USER_ID
from app.database import async_session
from app.models.user import User


async def seed():
    async with async_session() as session:  # type: AsyncSession
        existing = await session.execute(
            select(User).where(User.id == STUB_USER_ID)
        )
        if existing.scalar_one_or_none() is not None:
            print("Stub user already exists — skipping.")
            return

        user = User(id=STUB_USER_ID, name="Owner", role="owner")
        session.add(user)
        await session.commit()
        print(f"Seeded stub user: {user.id}")


if __name__ == "__main__":
    asyncio.run(seed())
