"""Per-provider auth, plan/quota visibility. Credentials are Fernet-encrypted at rest and only
decrypted in memory to build the child-process environment. Official API keys / host CLI logins only:
no session scraping."""
from __future__ import annotations

import asyncio
import logging
import time

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from ..adapters.base import CliAdapter
from ..catalog import PROVIDERS, normalize_pricing
from ..config import Settings
from ..events import EventService
from ..models import Agent, ProviderConnection
from ..security import Vault
from .budget import BudgetService

log = logging.getLogger("uaw.entitlement")


class EntitlementService:
    def __init__(self, sm: async_sessionmaker, settings: Settings, vault: Vault, adapters: dict[str, CliAdapter],
                 budget: BudgetService, events: EventService):
        self._sm, self._settings, self._vault = sm, settings, vault
        self._adapters, self._budget, self._events = adapters, budget, events
        self._version_cache: dict[str, tuple[float, str | None]] = {}
        self._poller: asyncio.Task | None = None

    # ---- connect / disconnect ---------------------------------------------------------------------
    async def connect(self, ws_id: str, provider: str, *, user_id: str | None, api_key: str | None = None,
                      plan: str = "unknown", pricing: dict | None = None, cap_usd: float | None = None) -> dict:
        if provider not in PROVIDERS:
            raise ValueError(f"unsupported provider {provider!r}; supported: {', '.join(PROVIDERS)}")
        adapter = self._adapters[provider]
        pr = normalize_pricing(provider, pricing)
        auth_type = "api_key" if api_key else ("host_session" if adapter.available() else "none")
        cipher = self._vault.encrypt(api_key) if api_key else None
        meta = PROVIDERS[provider]
        async with self._sm() as s:
            conn = (await s.execute(select(ProviderConnection).where(
                ProviderConnection.workspace_id == ws_id, ProviderConnection.provider == provider))).scalar_one_or_none()
            if conn is None:
                conn = ProviderConnection(workspace_id=ws_id, provider=provider)
                s.add(conn)
            conn.auth_type, conn.plan, conn.pricing, conn.connected_by = auth_type, plan, pr, user_id
            if api_key:
                conn.secret_ciphertext = cipher
            elif auth_type != "api_key":
                conn.secret_ciphertext = None
            has_agent = (await s.execute(select(Agent.id).where(
                Agent.workspace_id == ws_id, Agent.provider == provider).limit(1))).first()
            if not has_agent:
                s.add(Agent(workspace_id=ws_id, provider=provider, name=meta["display_name"],
                            model=meta["default_model"], capabilities=dict(meta["capabilities"])))
            await s.commit()
        ledger = await self._budget.ensure(ws_id, provider, cap_usd if cap_usd is not None else self._settings.default_budget_cap_usd)
        if cap_usd is not None and abs(ledger["cap_usd"] - cap_usd) > 1e-9:
            ledger = await self._budget.set_cap(ws_id, provider, cap_usd)
        # Legacy seed names from older catalog revisions ("Codex CLI", "IBM Bob", "Claude Code",
        # "Bob Shell", "Gemini CLI") used to stick in the DB forever and leak into routing
        # rationales and failover lines. Heal them to the current catalog display name.
        if has_agent:
            async with self._sm() as s:
                for row in (await s.execute(select(Agent).where(
                        Agent.workspace_id == ws_id, Agent.provider == provider))).scalars():
                    if row.name != meta["display_name"]:
                        row.name = meta["display_name"]
                await s.commit()
        mode = "real" if adapter.available() else ("simulated" if self._settings.allow_simulation else "unavailable")
        note = {"real": "CLI found on host", "simulated": f"'{adapter.executable()}' CLI not installed - running SIMULATED agent",
                "unavailable": f"'{adapter.executable()}' CLI not installed and simulation disabled"}[mode]
        await self._events.append(
            ws_id, "provider_connected",
            {"provider": provider, "detail": f"{adapter.display_name} connected ({auth_type}); {note}", "mode": mode,
             "auth_type": auth_type, "plan": plan, "pricing_model": pr["model"], "cap_usd": ledger["cap_usd"]},
            provider=provider)
        return await self.provider_status(ws_id, provider)

    async def disconnect(self, ws_id: str, provider: str) -> bool:
        async with self._sm() as s:
            res = await s.execute(delete(ProviderConnection).where(
                ProviderConnection.workspace_id == ws_id, ProviderConnection.provider == provider))
            await s.execute(delete(Agent).where(Agent.workspace_id == ws_id, Agent.provider == provider))
            await s.commit()
            return res.rowcount > 0

    # ---- reads -------------------------------------------------------------------------------------
    async def get_conn(self, ws_id: str, provider: str) -> ProviderConnection | None:
        async with self._sm() as s:
            return (await s.execute(select(ProviderConnection).where(
                ProviderConnection.workspace_id == ws_id, ProviderConnection.provider == provider))).scalar_one_or_none()

    async def list_conns(self, ws_id: str) -> list[ProviderConnection]:
        async with self._sm() as s:
            return list((await s.execute(select(ProviderConnection).where(
                ProviderConnection.workspace_id == ws_id).order_by(ProviderConnection.provider))).scalars())

    async def _version(self, provider: str) -> str | None:
        ts, v = self._version_cache.get(provider, (0.0, None))
        if time.monotonic() - ts > max(30.0, self._settings.entitlement_poll_seconds):
            v = await self._adapters[provider].version()
            self._version_cache[provider] = (time.monotonic(), v)
        return v

    async def provider_status(self, ws_id: str, provider: str) -> dict:
        conn = await self.get_conn(ws_id, provider)
        ledger = await self._budget.state(ws_id, provider) or {"requests": 0}
        ent = await self._adapters[provider].entitlement(conn, ledger)
        ent["cli_version"] = await self._version(provider) if ent["cli_available"] else None
        ent.update(connected=conn is not None, auth_type=conn.auth_type if conn else None,
                   credential_stored=bool(conn and conn.secret_ciphertext),  # never the secret itself
                   budget=ledger if conn else None)
        return ent

    async def status(self, ws_id: str) -> list[dict]:
        return [await self.provider_status(ws_id, c.provider) for c in await self.list_conns(ws_id)]

    def credential_env(self, conn: ProviderConnection, adapter: CliAdapter) -> tuple[dict[str, str], bool]:
        """(env for the child process, keep host HOME so a host CLI login is usable)."""
        if conn.auth_type == "api_key" and conn.secret_ciphertext:
            return {adapter.api_key_env: self._vault.decrypt(conn.secret_ciphertext)}, False
        return {}, conn.auth_type == "host_session"

    # ---- polling -----------------------------------------------------------------------------------
    def start_polling(self) -> None:
        if self._poller is None and self._settings.entitlement_poll_seconds > 0:
            self._poller = asyncio.create_task(self._poll(), name="entitlement-poller")

    async def stop_polling(self) -> None:
        if self._poller:
            self._poller.cancel()
            try:
                await self._poller
            except (asyncio.CancelledError, Exception):
                pass
            self._poller = None

    async def _poll(self) -> None:
        while True:
            try:
                for p in self._adapters:  # refresh CLI availability/version so status reads stay cheap
                    self._version_cache[p] = (time.monotonic(), await self._adapters[p].version())
            except Exception:
                log.exception("entitlement poll failed")
            await asyncio.sleep(self._settings.entitlement_poll_seconds)
