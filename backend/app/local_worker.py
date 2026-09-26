"""Outbound local-agent bridge for provider CLIs authenticated on the user's machine.

Railway never receives the local Codex/ChatGPT credential. A local worker opens the WebSocket
outbound, receives jobs, runs Codex in the user's checkout, and streams stdout back.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any


@dataclass
class _Job:
    session_id: str
    workspace_id: str
    prompt: str
    mode: str
    queue: asyncio.Queue


class LocalAgentBridge:
    def __init__(self, token: str | None):
        self.token = token or ""
        self._pending: asyncio.Queue[_Job] = asyncio.Queue()
        self._jobs: dict[str, _Job] = {}
        self._worker_count = 0

    @property
    def enabled(self) -> bool:
        return bool(self.token)

    @property
    def connected(self) -> bool:
        return self._worker_count > 0

    async def enqueue(self, *, session_id: str, workspace_id: str, prompt: str, mode: str) -> asyncio.Queue:
        if not self.enabled:
            raise RuntimeError("agent bridge is not configured")
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        job = _Job(session_id, workspace_id, prompt, mode, q)
        self._jobs[session_id] = job
        await self._pending.put(job)
        return q

    async def cancel(self, session_id: str) -> None:
        job = self._jobs.get(session_id)
        if job:
            await job.queue.put({"type": "cancel"})

    def finish(self, session_id: str) -> None:
        self._jobs.pop(session_id, None)

    async def worker_loop(self, websocket) -> None:
        self._worker_count += 1
        try:
            while True:
                job = await self._pending.get()
                await websocket.send_json({
                    "type": "job",
                    "session_id": job.session_id,
                    "workspace_id": job.workspace_id,
                    "prompt": job.prompt,
                    "mode": job.mode,
                })
                while True:
                    msg = await websocket.receive_json()
                    if msg.get("session_id") != job.session_id:
                        continue
                    await job.queue.put(msg)
                    if msg.get("type") in {"done", "error"}:
                        self.finish(job.session_id)
                        break
        finally:
            self._worker_count = max(0, self._worker_count - 1)
            # Fail any queued job whose worker disappeared so the backend does not hang forever.
            for job in list(self._jobs.values()):
                await job.queue.put({"type": "error", "message": "agent bridge disconnected"})
                self.finish(job.session_id)
