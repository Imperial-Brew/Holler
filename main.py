from fastapi import FastAPI

from app.routes.health import router as health_router
from app.routes.captures import router as captures_router
from app.routes.sync import router as sync_router

app = FastAPI(title="Holler", version="0.1.0")

app.include_router(health_router)
app.include_router(captures_router)
app.include_router(sync_router)


@app.get("/")
async def root():
    return {"app": "Holler", "version": "0.1.0"}
