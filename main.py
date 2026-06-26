from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.health import router as health_router
from app.routes.captures import router as captures_router
from app.routes.sync import router as sync_router
from app.routes.register import router as register_router
from app.routes.locations import router as locations_router

app = FastAPI(title="Holler", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(captures_router)
app.include_router(sync_router)
app.include_router(register_router)
app.include_router(locations_router)


@app.get("/")
async def root():
    return {"app": "Holler", "version": "0.1.0"}
