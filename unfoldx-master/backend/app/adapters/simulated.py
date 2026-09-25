"""Simulated agent used ONLY when the provider CLI is not installed (and ALLOW_SIMULATION=1).
Everything it emits is deterministic, templated, and marked simulated=True downstream."""
from __future__ import annotations

import asyncio
import hashlib
import json
from typing import AsyncIterator

from ..services.planning import HANDOFF_INSTRUCTIONS, extract_request, heuristic_plan
from .base import AgentEvent, RunHandle, RunRequest


def _concrete(paths: list[str]) -> list[str]:
    """Turn claim globs into plausible concrete file names for the simulated 'edits'."""
    out = []
    for p in paths:
        out.append(p.replace("**", "module").replace("*", "main") if any(c in p for c in "*?") else p)
    return out


async def simulate(adapter, handle: RunHandle, req: RunRequest) -> AsyncIterator[AgentEvent]:
    delay = adapter.settings.sim_delay_seconds

    async def pause() -> bool:
        """Sleep responsively; return False if a stop was requested."""
        if handle.sim_stop.is_set():
            return False
        if delay > 0:
            try:
                await asyncio.wait_for(handle.sim_stop.wait(), delay)
                return False
            except asyncio.TimeoutError:
                return True
        await asyncio.sleep(0)
        return True

    tin = max(400, len(req.prompt) // 4)
    seed = int(hashlib.sha256((req.title or req.prompt[:80]).encode()).hexdigest()[:6], 16)

    if req.mode == "plan":
        request = extract_request(req.prompt)
        for line in ("Plan mode: reading request and connected-agent capability profiles",
                     "Decomposing into independent subtasks and mapping target files"):
            if not await pause():
                return
            yield AgentEvent("log", text=line)
        yield AgentEvent("usage", tokens_in=tin, tokens_out=900 + seed % 300)
        if not await pause():
            return
        plan = heuristic_plan(request)
        plan["rationale"] = "Simulated Bob Plan-mode output (Bob CLI not installed on this host): " + plan["rationale"]
        yield AgentEvent("result", text="```json\n" + json.dumps(plan) + "\n```")
        return

    files = _concrete(req.target_files)
    yield AgentEvent("log", text=f"Starting: {req.title or 'task'}")
    if not await pause():
        return
    yield AgentEvent("usage", tokens_in=tin, tokens_out=200)
    for f in files:
        yield AgentEvent("log", text=f"Reading {f}")
        if not await pause():
            return
        yield AgentEvent("log", text=f"Editing {f}")
        yield AgentEvent("file", files=[f])
        yield AgentEvent("usage", tokens_in=250, tokens_out=500 + seed % 400)
        if not await pause():
            return
    yield AgentEvent("log", text="Running checks")
    if not await pause():
        return
    yield AgentEvent("usage", tokens_in=150, tokens_out=250)
    handoff = {
        "summary": f"[simulated] Completed '{req.title}'.",
        "decisions": [f"Scoped work to {', '.join(req.target_files) or 'the whole repo'} to avoid overlap with other agents"],
        "constraints": ["Simulated run: no real code was written"],
        "rejected_approaches": ["Touching files outside the claimed paths"],
        "files_touched": files,
    }
    yield AgentEvent("result", text="Done.\n```json\n" + json.dumps(handoff) + "\n```")
