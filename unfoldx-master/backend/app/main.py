from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .context import AppContext
from .routers import auth, budget, events, providers, tasks, workspaces, ws

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    ctx = AppContext(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await ctx.startup()
        yield
        await ctx.shutdown()

    app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
    app.state.ctx = ctx
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])

    @app.get("/healthz", tags=["health"])
    async def healthz():
        return {"status": "ok", "auth_mode": settings.auth_mode, "simulation_allowed": settings.allow_simulation,
                "providers": {k: ("real" if a.available() else ("simulated" if settings.allow_simulation else "unavailable"))
                              for k, a in ctx.adapters.items()}}

    for r in (auth.router, workspaces.router, providers.router, tasks.router, budget.router, events.router, ws.router):
        app.include_router(r)
    return app



