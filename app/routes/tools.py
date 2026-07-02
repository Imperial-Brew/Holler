import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.auth import STUB_USER_ID
from app.models.tool import Tool
from app.schemas.tool import ToolRead, ToolCreate
from app.holler_auth import get_current_user

router = APIRouter(prefix="/tools", tags=["tools"])

@router.get("/", response_model=list[ToolRead])
async def list_tools(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    stmt = select(Tool).where(Tool.deleted == False).order_by(Tool.name)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/", response_model=ToolRead)
async def create_tool(
    tool_in: ToolCreate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    tool = Tool(
        name=tool_in.name,
        location_id=tool_in.location_id,
        created_by=STUB_USER_ID,
    )
    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    return tool
