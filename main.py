from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.holler_auth import router as auth_router, get_current_user
from app.routes.health import router as health_router
from app.routes.captures import router as captures_router
from app.routes.sync import router as sync_router
from app.routes.register import router as register_router
from app.routes.locations import router as locations_router
from app.routes.dependencies import router as dependencies_router
from app.routes.tasks import router as tasks_router
from app.routes.jobs import router as jobs_router
from app.routes.materials import router as materials_router
from app.routes.tools import router as tools_router

app = FastAPI(title="Holler", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(health_router)
app.include_router(captures_router, dependencies=[Depends(get_current_user)])
app.include_router(sync_router, dependencies=[Depends(get_current_user)])
app.include_router(register_router, dependencies=[Depends(get_current_user)])
app.include_router(locations_router, dependencies=[Depends(get_current_user)])
app.include_router(dependencies_router, dependencies=[Depends(get_current_user)])
app.include_router(tasks_router, dependencies=[Depends(get_current_user)])
app.include_router(jobs_router, dependencies=[Depends(get_current_user)])
app.include_router(materials_router, dependencies=[Depends(get_current_user)])
app.include_router(tools_router, dependencies=[Depends(get_current_user)])


@app.get("/")
async def root():
    return {"app": "Holler", "version": "0.1.0"}
