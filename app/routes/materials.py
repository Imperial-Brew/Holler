import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import get_db
from app.auth import STUB_USER_ID
from app.models.material import Material, MaterialTransaction
from app.schemas.material import MaterialCreate, MaterialRead, MaterialReceive, MaterialTransactionRead
from app.holler_auth import get_current_user

router = APIRouter(prefix="/materials", tags=["materials"])

@router.post("/", response_model=MaterialRead)
async def create_material(
    material_in: MaterialCreate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    material = Material(
        name=material_in.name,
        unit=material_in.unit,
        reorder_point=material_in.reorder_point,
        created_by=STUB_USER_ID,
    )
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return material

@router.post("/{material_id}/receive/", response_model=MaterialTransactionRead)
async def receive_material(
    material_id: uuid.UUID,
    receive_in: MaterialReceive,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    # Verify material exists
    stmt = select(Material).where(Material.id == material_id, Material.deleted == False)
    result = await db.execute(stmt)
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if receive_in.qty <= 0:
        raise HTTPException(status_code=422, detail="qty must be greater than 0")

    # Client-generated id makes this idempotent: an offline "Got it" queues a
    # receive locally, and a retried flush must not double-count the ledger.
    # (note is accepted for API compatibility but there's no column to store it.)
    tx_id = receive_in.id or uuid.uuid4()
    ins = (
        pg_insert(MaterialTransaction)
        .values(
            id=tx_id,
            material_id=material_id,
            delta=receive_in.qty,
            reason="received",
            created_by=STUB_USER_ID,
        )
        .on_conflict_do_nothing(index_elements=["id"])
    )
    await db.execute(ins)
    await db.commit()

    row = await db.execute(
        select(MaterialTransaction).where(MaterialTransaction.id == tx_id)
    )
    return row.scalar_one()
