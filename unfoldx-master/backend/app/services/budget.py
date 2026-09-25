"""Cross-provider budget ledger + stop-loss circuit breaker. Every cost is normalised to USD
(catalog.estimate_cost) so one cap/ledger works across token-metered, credit and seat pricing."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from ..models import BudgetLedger


def _state(b: BudgetLedger) -> dict:
    return {"provider": b.provider, "cap_usd": round(b.cap_usd, 6), "spent_usd": round(b.spent_usd, 6),
            "remaining_usd": round(max(0.0, b.cap_usd - b.spent_usd), 6), "tokens_in": b.tokens_in,
            "tokens_out": b.tokens_out, "requests": b.requests, "breaker_state": b.breaker_state,
            "tripped_at": b.tripped_at.isoformat() if b.tripped_at else None}


class BudgetService:
    def __init__(self, sm: async_sessionmaker):
        self._sm = sm
        self._locks: dict[tuple[str, str], asyncio.Lock] = {}

    def _lock(self, ws: str, provider: str) -> asyncio.Lock:
        return self._locks.setdefault((ws, provider), asyncio.Lock())

    async def _get(self, session, ws: str, provider: str) -> BudgetLedger | None:
        return (await session.execute(select(BudgetLedger).where(
            BudgetLedger.workspace_id == ws, BudgetLedger.provider == provider))).scalar_one_or_none()

    async def ensure(self, ws: str, provider: str, cap_usd: float) -> dict:
        async with self._lock(ws, provider), self._sm() as s:
            b = await self._get(s, ws, provider)
            if b is None:
                b = BudgetLedger(workspace_id=ws, provider=provider, cap_usd=cap_usd)
                s.add(b)
                await s.commit()
            return _state(b)

    async def state(self, ws: str, provider: str) -> dict | None:
        async with self._sm() as s:
            b = await self._get(s, ws, provider)
            return _state(b) if b else None

    async def all(self, ws: str) -> list[dict]:
        async with self._sm() as s:
            rows = (await s.execute(select(BudgetLedger).where(BudgetLedger.workspace_id == ws)
                                    .order_by(BudgetLedger.provider))).scalars().all()
            return [_state(b) for b in rows]

    async def record(self, ws: str, provider: str, *, cost: float = 0.0, tokens_in: int = 0, tokens_out: int = 0,
                     requests: int = 0) -> dict:
        """Apply one usage delta atomically. `tripped_now` is True exactly once per breaker trip."""
        async with self._lock(ws, provider), self._sm() as s:
            b = await self._get(s, ws, provider)
            if b is None:
                raise KeyError(f"no budget ledger for {provider} in workspace {ws}")
            b.spent_usd = max(0.0, b.spent_usd + cost)
            b.tokens_in += tokens_in
            b.tokens_out += tokens_out
            b.requests += requests
            b.updated_at = datetime.now(timezone.utc)
            tripped_now = False
            if b.breaker_state == "closed" and b.spent_usd + 1e-12 >= b.cap_usd and (cost > 0 or b.cap_usd <= 0):
                b.breaker_state, b.tripped_at, tripped_now = "open", datetime.now(timezone.utc), True
            await s.commit()
            st = _state(b)
            st["tripped_now"] = tripped_now
            return st

    async def set_cap(self, ws: str, provider: str, cap_usd: float) -> dict:
        async with self._lock(ws, provider), self._sm() as s:
            b = await self._get(s, ws, provider)
            if b is None:
                raise KeyError(provider)
            b.cap_usd = cap_usd
            if b.spent_usd + 1e-12 < b.cap_usd:
                b.breaker_state, b.tripped_at = "closed", None
            else:
                b.breaker_state = "open"
            await s.commit()
            return _state(b)

    async def override(self, ws: str, provider: str, additional_usd: float) -> dict:
        """Approver-authorised budget override: raises the cap and closes the breaker."""
        async with self._lock(ws, provider), self._sm() as s:
            b = await self._get(s, ws, provider)
            if b is None:
                raise KeyError(provider)
            b.cap_usd = max(b.cap_usd, b.spent_usd) + additional_usd
            b.breaker_state, b.tripped_at = "closed", None
            await s.commit()
            return _state(b)
