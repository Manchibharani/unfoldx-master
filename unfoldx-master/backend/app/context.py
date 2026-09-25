from __future__ import annotations

from .adapters.providers import build_adapters
from .bus import InMemoryBus, RedisBus
from .config import Settings
from .db import Database
from .events import EventService
from .security import Vault
from .services.budget import BudgetService
from .services.entitlement import EntitlementService
from .services.orchestrator import Orchestrator
from .services.runner import AgentRunner


class AppContext:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.db = Database(settings.database_url)
        self.bus = RedisBus(settings.redis_url) if settings.redis_url else InMemoryBus()
        self.vault = Vault(settings.fernet_key, settings.secret_key)
        self.events = EventService(self.db.sessionmaker, self.bus, settings.secret_key)
        self.adapters = build_adapters(settings)
        self.budget = BudgetService(self.db.sessionmaker)
        self.entitlement = EntitlementService(self.db.sessionmaker, settings, self.vault, self.adapters, self.budget, self.events)
        self.runner = AgentRunner(self)
        self.orchestrator = Orchestrator(self)

    async def startup(self) -> None:
        await self.db.create_all()
        await self.bus.start()
        await self.orchestrator.recover_interrupted()
        if self.settings.seed_demo_workspace and self.settings.auth_mode == "open":
            from .services.workspaces import seed_demo
            await seed_demo(self)
        self.entitlement.start_polling()

    async def shutdown(self) -> None:
        await self.entitlement.stop_polling()
        await self.orchestrator.shutdown()
        await self.bus.stop()
        await self.db.dispose()
