"""
Shared test setup for the Holler backend.

Holler's job logic lives partly in Postgres triggers, so these tests run
against a REAL Postgres — a throwaway one that testcontainers starts in Docker
just for the test run and throws away afterward. It never touches your dev or
production database.

What this file does, in order:
  1. Start a throwaway Postgres in Docker.
  2. Point the app at it (via env vars) BEFORE the app is imported.
  3. Build the schema by running the real Alembic migrations (so the triggers
     and views under test are exactly the ones that ship).
  4. Seed the one "owner" user rows reference as their creator.
  5. Give each test an HTTP client that talks to the app with auth bypassed,
     and wipe the data tables between tests so they can't leak into each other.
"""
import os
import sys
import asyncio

# Make `import main` / `import app` work no matter where pytest is invoked from.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Disable testcontainers' "Ryuk" reaper — it needs a helper container whose
# port Docker Desktop won't reliably expose. We stop our container ourselves in
# pytest_unconfigure, so we don't need the reaper.
os.environ.setdefault("TESTCONTAINERS_RYUK_DISABLED", "true")

from testcontainers.postgres import PostgresContainer

# --- 1 & 2: throwaway Postgres, wired up before the app is imported ---------
_PG = PostgresContainer("postgres:16")
_PG.start()

_CONN = f"{_PG.username}:{_PG.password}@{_PG.get_container_host_ip()}:{_PG.get_exposed_port(5432)}/{_PG.dbname}"
os.environ["DATABASE_URL"] = f"postgresql+asyncpg://{_CONN}"
os.environ["DATABASE_URL_SYNC"] = f"postgresql+psycopg2://{_CONN}"
# Auth env just so importing app.holler_auth doesn't raise; tests bypass auth.
os.environ.setdefault("HOLLER_JWT_SECRET", "test-secret")
os.environ.setdefault("HOLLER_PW_HASH", "test-hash")

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from alembic import command
from alembic.config import Config

# Safe now: settings read the test DB URL set above.
import main
from app import holler_auth
from app.database import get_db
from app.auth import STUB_USER_ID

# A dedicated engine for tests. NullPool = a fresh connection each time, which
# keeps SQLAlchemy happy across pytest-asyncio's per-test event loops.
_engine = create_async_engine(os.environ["DATABASE_URL"], poolclass=NullPool)
_Session = async_sessionmaker(_engine, expire_on_commit=False)

# Data tables wiped between tests (reference data — users — is kept).
_DATA_TABLES = (
    "jobs, tasks, captures, locations, tools, materials, material_transactions, "
    "task_dependencies, task_tools, task_materials, job_tool_effects"
)


def pytest_configure(config):
    """Once per run: build the schema from real migrations, seed the owner."""
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = Config(os.path.join(repo_root, "alembic.ini"))
    command.upgrade(cfg, "head")
    asyncio.run(_seed_owner())


def pytest_unconfigure(config):
    """Tear the throwaway Postgres down when the run finishes."""
    _PG.stop()


async def _seed_owner():
    # created_by columns FK to users, so the stub owner must exist.
    # row_version is filled by the set_row_version trigger, so we omit it.
    eng = create_async_engine(os.environ["DATABASE_URL"], poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO users (id, name, role, created_at, updated_at, deleted) "
                "VALUES (:id, 'Test Owner', 'owner', now(), now(), false) "
                "ON CONFLICT (id) DO NOTHING"
            ),
            {"id": str(STUB_USER_ID)},
        )
    await eng.dispose()


async def _override_get_db():
    async with _Session() as session:
        yield session


@pytest_asyncio.fixture(autouse=True)
async def _clean_between_tests():
    """Wipe mutable data after each test so tests stay independent."""
    yield
    async with _engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {_DATA_TABLES} RESTART IDENTITY CASCADE"))


@pytest_asyncio.fixture
async def client():
    """An HTTP client wired to the app, with auth bypassed (auth isn't under test)."""
    main.app.dependency_overrides[get_db] = _override_get_db
    main.app.dependency_overrides[holler_auth.get_current_user] = lambda: "test-owner"
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c
    main.app.dependency_overrides.clear()
