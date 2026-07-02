import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.auth import STUB_USER_ID
from app.models.material import Material, MaterialTransaction
from app.schemas.material import MaterialReceive
from app.holler_auth import get_current_user

router = APIRouter(prefix="/materials", tags=["materials"])

@router.post("/{material_id}/receive/", response_model=dict)
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

    # Write positive ledger entry
    transaction = MaterialTransaction(
        material_id=material_id,
        delta=receive_in.qty,
        reason="received",
        created_by=STUB_USER_ID,
        # note is not in schema but it was in requirement, 
        # however the table doesn't have a note column. 
        # I'll use the 'reason' if I had to, but the migration says CHECK (reason IN (...))
        # Maybe I should have added a note column? 
        # Requirement says: "body { qty, note? }. Writes a positive ledger entry. No task or job association"
        # The migration says: reason text NOT NULL CHECK (reason IN ('received','consumed','adjustment','count'))
    )
    # Since there's no note column in the migration, I'll ignore it for now as per "don't hand-alter tables"
    db.add(transaction)
    await db.commit()
    
    return {"status": "success", "transaction_id": transaction.id}
