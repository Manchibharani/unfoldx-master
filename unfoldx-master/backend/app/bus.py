"""Event fan-out. In-memory by default; Redis pub/sub when REDIS_URL is set so several API
processes can serve the same workspace. Subscribers get a bounded queue; a slow consumer is dropped
(the WebSocket then closes and the client reconnects and replays from the DB)."""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import AsyncIterator

log = logging.getLogger("uaw.bus")
OVERFLOW = object()


class InMemoryBus:
    def __init__(self, maxsize: int = 2000):
        self._subs: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._maxsize = maxsize

    async def start(self) -> None: ...
    async def stop(self) -> None: ...

    async def publish(self, workspace_id: str, event: dict) -> None:
        self.deliver_local(workspace_id, event)

    def deliver_local(self, workspace_id: str, event: dict) -> None:
        for q in list(self._subs.get(workspace_id, ())):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                self._subs[workspace_id].discard(q)
                try:  # make room for the overflow marker so the reader wakes up and disconnects
                    q.get_nowait()
                    q.put_nowait(OVERFLOW)
                except Exception:
                    pass

    @asynccontextmanager
    async def subscribe(self, workspace_id: str) -> AsyncIterator[asyncio.Queue]:
        q: asyncio.Queue = asyncio.Queue(maxsize=self._maxsize)
        self._subs[workspace_id].add(q)
        try:
            yield q
        finally:
            self._subs[workspace_id].discard(q)
            if not self._subs[workspace_id]:
                self._subs.pop(workspace_id, None)


class RedisBus(InMemoryBus):
    def __init__(self, url: str, client=None):
        super().__init__()
        self._url = url
        self._client = client
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._client is None:
            import redis.asyncio as aioredis
            self._client = aioredis.from_url(self._url, decode_responses=True)
        self._task = asyncio.create_task(self._listen(), name="redis-bus-listener")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        if self._client is not None:
            await self._client.aclose()

    async def publish(self, workspace_id: str, event: dict) -> None:
        await self._client.publish(f"uaw:ws:{workspace_id}", json.dumps(event))

    async def _listen(self) -> None:
        pubsub = self._client.pubsub()
        await pubsub.psubscribe("uaw:ws:*")
        try:
            async for msg in pubsub.listen():
                if msg.get("type") != "pmessage":
                    continue
                ws_id = msg["channel"].split("uaw:ws:", 1)[1]
                try:
                    self.deliver_local(ws_id, json.loads(msg["data"]))
                except Exception:
                    log.exception("bad bus message")
        except asyncio.CancelledError:
            raise
        finally:
            await pubsub.aclose()
