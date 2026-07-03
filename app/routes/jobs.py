import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import STUB_USER_ID
from app.models.job import Job
from app.models.task import Task
from app.models.task_dependency import TaskDependency
from app.models.material import Material, MaterialTransaction
from app.models.tool import Tool
from app.models.task_tool import TaskTool
from app.models.task_material import TaskMaterial
from app.schemas.job import JobRead, JobDetailRead, JobTaskRead, JobToolRead, JobMaterialRead, JobCreate, JobTaskCreate
from app.schemas.material import JobReconcile
from app.holler_auth import get_current_user

router = APIRouter(prefix="/jobs", tags=["jobs"])

@router.get("/", response_model=List[JobRead])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    # Requirement: status derived from milestone task
    stmt = text("""
        SELECT j.id, j.title, j.created_at, t.status
        FROM jobs j
        JOIN tasks t ON t.job_id = j.id AND t.is_milestone = true
        WHERE j.deleted = false AND t.deleted_at IS NULL
        ORDER BY j.created_at DESC
    """)
    result = await db.execute(stmt)
    return [
        JobRead(id=r.id, title=r.title, created_at=r.created_at, status=r.status)
        for r in result
    ]

@router.get("/{job_id}", response_model=JobDetailRead)
async def get_job_detail(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    query = text("""
        SELECT j.id, j.title, t.status
        FROM jobs j
        JOIN tasks t ON t.job_id = j.id AND t.is_milestone = true
        WHERE j.id = :job_id AND j.deleted = false AND t.deleted_at IS NULL
    """)
    job_result = await db.execute(query, {"job_id": job_id})
    job = job_result.first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # 1. Tasks joined with v_task_board
    tasks_query = text("""
        SELECT t.id, t.title, t.status, v.board_state
        FROM tasks t
        JOIN v_task_board v ON v.id = t.id
        WHERE t.job_id = :job_id AND t.deleted_at IS NULL AND t.is_milestone = false
        ORDER BY t.created_at ASC
    """)
    tasks_result = await db.execute(tasks_query, {"job_id": job_id})
    tasks = [
        JobTaskRead(id=r.id, title=r.title, status=r.status, board_state=r.board_state)
        for r in tasks_result
    ]

    # 2. Tools
    tools_query = text("""
        SELECT DISTINCT tl.id, tl.name, tl.status
        FROM tools tl
        JOIN task_tools tt ON tt.tool_id = tl.id
        JOIN tasks t ON t.id = tt.task_id
        WHERE t.job_id = :job_id AND tt.deleted_at IS NULL AND tl.deleted_at IS NULL
    """)
    tools_result = await db.execute(tools_query, {"job_id": job_id})
    tools = [
        JobToolRead(id=r.id, name=r.name, status=r.status)
        for r in tools_result
    ]

    # 3. Materials
    # If job is done, show all materials for reconciliation.
    # Otherwise show only those from non-done tasks.
    status_filter = "AND t.status <> 'done'" if job.status != 'done' else ""
    materials_query = text(f"""
        SELECT m.id AS material_id, m.name, m.unit, 
               SUM(tm.qty_required) AS needed,
               COALESCE(oh.on_hand, 0) AS on_hand,
               SUM(tm.qty_required) - COALESCE(oh.on_hand, 0) AS shortfall
        FROM task_materials tm
        JOIN tasks t ON t.id = tm.task_id
        JOIN materials m ON m.id = tm.material_id
        LEFT JOIN v_material_on_hand oh ON oh.material_id = m.id
        WHERE t.job_id = :job_id 
          AND t.deleted_at IS NULL 
          AND tm.deleted_at IS NULL 
          AND t.is_milestone = false 
          {status_filter}
        GROUP BY m.id, m.name, m.unit, oh.on_hand
    """)
    # Remove HAVING if job is done, so we see all required materials even if no shortfall
    if job.status != 'done':
        materials_query = text(str(materials_query) + " HAVING SUM(tm.qty_required) - COALESCE(oh.on_hand, 0) > 0")

    materials_result = await db.execute(materials_query, {"job_id": job_id})
    materials = [
        JobMaterialRead(
            material_id=r.material_id, 
            name=r.name, 
            unit=r.unit, 
            needed=float(r.needed), 
            on_hand=float(r.on_hand), 
            shortfall=float(r.shortfall)
        )
        for r in materials_result
    ]

    # 4. Reconciled status
    # Check if any 'consumed' transaction exists for the milestone task
    ms_query = select(Task.id).where(Task.job_id == job_id, Task.is_milestone == True, Task.deleted_at.is_(None))
    ms_result = await db.execute(ms_query)
    ms_id = ms_result.scalar_one_or_none()
    
    reconciled = False
    if ms_id:
        recon_query = select(MaterialTransaction).where(
            MaterialTransaction.task_id == ms_id,
            MaterialTransaction.reason == "consumed"
        ).limit(1)
        recon_result = await db.execute(recon_query)
        if recon_result.scalar_one_or_none():
            reconciled = True

    return JobDetailRead(
        id=job.id,
        title=job.title,
        status=job.status,
        reconciled=reconciled,
        tasks=tasks,
        tools=tools,
        materials=materials
    )

@router.post("/", response_model=JobDetailRead)
async def create_job(
    job_in: JobCreate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    job = Job(
        title=job_in.title,
        created_by=STUB_USER_ID
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return await get_job_detail(job.id, db, user)

@router.post("/{job_id}/tasks/", response_model=JobDetailRead)
async def create_job_task(
    job_id: uuid.UUID,
    task_in: JobTaskCreate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    # Verify job exists
    job_check = await db.execute(select(Job).where(Job.id == job_id, Job.deleted == False))
    if not job_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found")

    # Validate dependencies belong to the same job
    if task_in.depends_on_ids:
        dep_check = await db.execute(
            select(Task.id)
            .where(Task.id.in_(task_in.depends_on_ids))
            .where(Task.job_id == job_id)
            .where(Task.deleted_at.is_(None))
        )
        found_ids = list(dep_check.scalars().all())
        if len(found_ids) != len(task_in.depends_on_ids):
             raise HTTPException(status_code=400, detail="One or more dependencies are invalid or belong to another job")

    # Create task
    task = Task(
        title=task_in.title,
        job_id=job_id,
        created_by=STUB_USER_ID
    )
    db.add(task)
    await db.flush() # get task.id

    # Create dependencies
    for dep_id in task_in.depends_on_ids:
        db.add(TaskDependency(task_id=task.id, depends_on_id=dep_id))

    # Create tool requirements
    if task_in.required_tool_ids:
        tool_check = await db.execute(
            select(Tool.id).where(Tool.id.in_(task_in.required_tool_ids), Tool.deleted == False)
        )
        found_tool_ids = list(tool_check.scalars().all())
        if len(found_tool_ids) != len(task_in.required_tool_ids):
            raise HTTPException(status_code=400, detail="One or more tool IDs are invalid")
        
        for tool_id in task_in.required_tool_ids:
            db.add(TaskTool(task_id=task.id, tool_id=tool_id, created_by=STUB_USER_ID))

    # Create material requirements
    if task_in.required_materials:
        material_ids = [rm.material_id for rm in task_in.required_materials]
        mat_check = await db.execute(
            select(Material.id).where(Material.id.in_(material_ids), Material.deleted == False)
        )
        found_material_ids = set(mat_check.scalars().all())
        if len(found_material_ids) != len(set(material_ids)):
            raise HTTPException(status_code=400, detail="One or more material IDs are invalid")

        for rm in task_in.required_materials:
            if rm.qty_required <= 0:
                raise HTTPException(status_code=400, detail="qty_required must be greater than 0")
            db.add(TaskMaterial(
                task_id=task.id,
                material_id=rm.material_id,
                qty_required=rm.qty_required,
                created_by=STUB_USER_ID,
            ))

    await db.commit()
    return await get_job_detail(job_id, db, user)

@router.post("/{job_id}/complete/", response_model=JobDetailRead)
async def complete_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    # Manual completion: finishing the last task no longer auto-completes a job
    # (the trigger only reopens now), so completing is a deliberate action.
    query = text("""
        SELECT j.id, t.id AS ms_id, t.status AS ms_status
        FROM jobs j
        JOIN tasks t ON t.job_id = j.id AND t.is_milestone = true
        WHERE j.id = :job_id AND j.deleted = false AND t.deleted_at IS NULL
    """)
    row = (await db.execute(query, {"job_id": job_id})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    if row.ms_status == "done":
        raise HTTPException(status_code=400, detail="Job already complete")

    # All non-milestone work must be resolved (done or cancelled) first.
    unresolved = (await db.execute(
        text("""
            SELECT count(*) FROM tasks
            WHERE job_id = :job_id AND is_milestone = false AND deleted_at IS NULL
              AND status IN ('open','in_progress')
        """),
        {"job_id": job_id},
    )).scalar_one()
    if unresolved > 0:
        raise HTTPException(
            status_code=400,
            detail="Finish or cancel all tasks before completing the job",
        )

    # Mark milestone + job done. Updating the milestone status fires the
    # completion trigger, but it early-returns for milestone rows.
    await db.execute(text("UPDATE tasks SET status = 'done' WHERE id = :ms_id"), {"ms_id": row.ms_id})
    await db.execute(text("UPDATE jobs SET status = 'done' WHERE id = :job_id"), {"job_id": job_id})

    # Apply any declared tool effects (this moved off the trigger).
    await db.execute(
        text("""
            UPDATE tools t SET status = e.on_complete_status
            FROM job_tool_effects e
            WHERE e.job_id = :job_id AND e.deleted_at IS NULL AND t.id = e.tool_id
        """),
        {"job_id": job_id},
    )

    await db.commit()
    return await get_job_detail(job_id, db, user)

@router.post("/{job_id}/reconcile-materials/", response_model=JobDetailRead)
async def reconcile_job_materials(
    job_id: uuid.UUID,
    recon_in: JobReconcile,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    # 1. Verify job exists and is done
    query = text("""
        SELECT j.id, t.id AS ms_id, t.status
        FROM jobs j
        JOIN tasks t ON t.job_id = j.id AND t.is_milestone = true
        WHERE j.id = :job_id AND j.deleted = false AND t.deleted_at IS NULL
    """)
    job_result = await db.execute(query, {"job_id": job_id})
    job = job_result.first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status != "done":
        raise HTTPException(status_code=400, detail="Reconciliation only allowed for completed jobs")

    # 2. Check if already reconciled
    recon_check = await db.execute(
        select(MaterialTransaction).where(
            MaterialTransaction.task_id == job.ms_id,
            MaterialTransaction.reason == "consumed"
        ).limit(1)
    )
    if recon_check.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Job already reconciled")

    # 3. Get total requirements for this job
    req_query = text("""
        SELECT tm.material_id, SUM(tm.qty_required) AS needed
        FROM task_materials tm
        JOIN tasks t ON t.id = tm.task_id
        WHERE t.job_id = :job_id 
          AND t.deleted_at IS NULL 
          AND tm.deleted_at IS NULL 
          AND t.is_milestone = false
        GROUP BY tm.material_id
    """)
    req_result = await db.execute(req_query, {"job_id": job_id})
    requirements = {r.material_id: float(r.needed) for r in req_result}

    # 4. Create consumption entries
    for item in recon_in.materials:
        required = requirements.get(item.material_id, 0)
        used = max(0, required - item.leftover_qty)
        
        if used > 0:
            db.add(MaterialTransaction(
                material_id=item.material_id,
                delta=-used,
                reason="consumed",
                task_id=job.ms_id,
                created_by=STUB_USER_ID
            ))

    await db.commit()
    return await get_job_detail(job_id, db, user)
