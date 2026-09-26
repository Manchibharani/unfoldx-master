"""Hash-chained, HMAC-signed provenance log + live fan-out.

hash      = sha256(canonical_json({prev_hash, <all event fields except hash/signature>}))
signature = HMAC-SHA256(secret_key, hash)     -> tamper-evident *and* attributable to this server

Only one writer per workspace chain is supported (a per-workspace asyncio lock serialises appends);
run a single API replica as the chain writer (Redis only fans events out to readers)."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from .bus import InMemoryBus
from .models import EventLogEntry, uid

GENESIS = "0" * 64

EVENT_TYPES = (
    "provider_connected", "task_submitted", "plan_decomposed", "route_decided", "conflict_checked",
    "conflict_detected", "dispatch_started", "log_line", "budget_update", "circuit_breaker_triggered",
    "handoff_emitted", "agent_output", "authorization_denied", "task_completed", "error",
)

_FIELDS = ("id", "workspace_id", "seq", "ts", "event_type", "agent_id", "task_id", "subtask_id", "provider",
           "model", "session_id", "payload", "cost_delta", "tokens_delta")


def canonical(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str).encode()


def compute_hash(prev_hash: str, body: dict) -> str:
    return hashlib.sha256(canonical({"prev_hash": prev_hash, **body})).hexdigest()


def sign(secret: str, digest: str) -> str:
    return hmac.new(secret.encode(), digest.encode(), hashlib.sha256).hexdigest()


def _body(row: EventLogEntry | dict) -> dict:
    g = (lambda k: row[k]) if isinstance(row, dict) else (lambda k: getattr(row, k))
    body = {k: g(k) for k in _FIELDS}
    body["cost_delta"] = round(float(body["cost_delta"] or 0.0), 8)
    body["tokens_delta"] = int(body["tokens_delta"] or 0)
    return body


def row_to_event(row: EventLogEntry) -> dict:
    d = _body(row)
    d.update(prev_hash=row.prev_hash, hash=row.hash, signature=row.signature)
    return d


class EventService:
    def __init__(self, sessionmaker: async_sessionmaker, bus: InMemoryBus, secret_key: str):
        self._sm = sessionmaker
        self._bus = bus
        self._secret = secret_key
        self._locks: dict[str, asyncio.Lock] = {}
        self._heads: dict[str, tuple[int, str]] = {}

    def _lock(self, ws: str) -> asyncio.Lock:
        return self._locks.setdefault(ws, asyncio.Lock())

    async def _head(self, session, ws: str) -> tuple[int, str]:
        if ws not in self._heads:
            row = (await session.execute(
                select(EventLogEntry.seq, EventLogEntry.hash).where(EventLogEntry.workspace_id == ws)
                .order_by(EventLogEntry.seq.desc()).limit(1))).first()
            self._heads[ws] = (row[0], row[1]) if row else (0, GENESIS)
        return self._heads[ws]

    async def append(self, workspace_id: str, event_type: str, payload: dict | None = None, *,
                     agent_id: str | None = None, task_id: str | None = None, subtask_id: str | None = None,
                     provider: str | None = None, model: str | None = None, session_id: str | None = None,
                     cost_delta: float = 0.0, tokens_delta: int = 0) -> dict:
        if event_type not in EVENT_TYPES:
            raise ValueError(f"unknown event_type {event_type!r}")
        payload = json.loads(json.dumps(payload or {}, default=str))  # force JSON-safe
        async with self._lock(workspace_id):
            async with self._sm() as session:
                seq0, prev = await self._head(session, workspace_id)
                body = {
                    "id": uid(), "workspace_id": workspace_id, "seq": seq0 + 1,
                    "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                    "event_type": event_type, "agent_id": agent_id, "task_id": task_id, "subtask_id": subtask_id,
                    "provider": provider, "model": model, "session_id": session_id, "payload": payload,
                    "cost_delta": round(float(cost_delta), 8), "tokens_delta": int(tokens_delta),
                }
                digest = compute_hash(prev, body)
                sig = sign(self._secret, digest)
                session.add(EventLogEntry(**body, prev_hash=prev, hash=digest, signature=sig))
                try:
                    await session.commit()
                except Exception:
                    self._heads.pop(workspace_id, None)  # head cache may be stale; reload next time
                    raise
                self._heads[workspace_id] = (body["seq"], digest)
        event = {**body, "prev_hash": prev, "hash": digest, "signature": sig}
        await self._bus.publish(workspace_id, event)
        return event

    async def list(self, workspace_id: str, after_seq: int = 0, limit: int = 200) -> list[dict]:
        async with self._sm() as session:
            rows = (await session.execute(
                select(EventLogEntry).where(EventLogEntry.workspace_id == workspace_id, EventLogEntry.seq > after_seq)
                .order_by(EventLogEntry.seq.asc()).limit(limit))).scalars().all()
        return [row_to_event(r) for r in rows]

    async def tail(self, workspace_id: str, n: int) -> list[dict]:
        async with self._sm() as session:
            rows = (await session.execute(
                select(EventLogEntry).where(EventLogEntry.workspace_id == workspace_id)
                .order_by(EventLogEntry.seq.desc()).limit(n))).scalars().all()
        return [row_to_event(r) for r in reversed(rows)]

    async def verify(self, workspace_id: str) -> dict:
        """Walk the whole chain: recompute every hash + signature and check linkage/sequence."""
        prev, expected_seq, checked = GENESIS, 1, 0
        async with self._sm() as session:
            offset = 0
            while True:
                rows = (await session.execute(
                    select(EventLogEntry).where(EventLogEntry.workspace_id == workspace_id)
                    .order_by(EventLogEntry.seq.asc()).offset(offset).limit(1000))).scalars().all()
                if not rows:
                    break
                for r in rows:
                    problem = None
                    if r.seq != expected_seq:
                        problem = f"sequence gap: expected {expected_seq}, found {r.seq}"
                    elif r.prev_hash != prev:
                        problem = "prev_hash does not match previous entry"
                    elif compute_hash(r.prev_hash, _body(r)) != r.hash:
                        problem = "hash mismatch (entry content was modified)"
                    elif not hmac.compare_digest(sign(self._secret, r.hash), r.signature):
                        problem = "signature invalid"
                    if problem:
                        return {"valid": False, "checked": checked, "first_invalid_seq": r.seq, "reason": problem}
                    prev, expected_seq, checked = r.hash, expected_seq + 1, checked + 1
                offset += len(rows)
        return {"valid": True, "checked": checked, "head_hash": prev if checked else None}
