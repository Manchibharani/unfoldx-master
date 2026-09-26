#!/usr/bin/env python3
"""UNFOLD X local Codex worker.

Run this on the machine whose files Codex should edit. Authenticate Codex locally first
with your ChatGPT account (for example, launch `codex` and complete its sign-in flow).
The worker only makes an outbound WebSocket connection to the Railway backend.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

import websockets


BACKEND_WS = os.environ.get("UNFOLDX_BACKEND_WS", "").rstrip("/")
TOKEN = os.environ.get("UNFOLDX_AGENT_BRIDGE_TOKEN", "")
REPO_ROOT = Path(os.environ.get("UNFOLDX_LOCAL_REPO", Path.cwd())).resolve()
CODEX = os.environ.get("UNFOLDX_CODEX_BIN", "codex")


async def run_job(ws, job: dict) -> None:
    session_id = job["session_id"]
    prompt = job["prompt"]
    mode = job.get("mode", "execute")
    args = [CODEX, "exec", "--json", "--skip-git-repo-check"]
    args += ["-s", "read-only" if mode == "plan" else "danger-full-access", prompt]

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            cwd=str(REPO_ROOT),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None
        while True:
            raw = await proc.stdout.readline()
            if not raw:
                break
            await ws.send(json.dumps({
                "type": "output",
                "session_id": session_id,
                "line": raw.decode(errors="replace").rstrip("\r\n"),
            }))
        rc = await proc.wait()
        await ws.send(json.dumps({"type": "done", "session_id": session_id, "exit_code": rc}))
    except Exception as exc:
        await ws.send(json.dumps({"type": "error", "session_id": session_id, "message": str(exc)}))


async def main() -> None:
    if not BACKEND_WS or not TOKEN:
        raise SystemExit("Set UNFOLDX_BACKEND_WS and UNFOLDX_WORKER_TOKEN.")
    uri = f"{BACKEND_WS}/ws/agent-bridge?token={TOKEN}"
    print(f"UNFOLD X Codex worker → {BACKEND_WS}")
    print(f"Local repo: {REPO_ROOT}")
    async with websockets.connect(uri, ping_interval=20, ping_timeout=20, max_size=16 * 1024 * 1024) as ws:
        print("Connected. Waiting for Codex jobs…")
        async for raw in ws:
            job = json.loads(raw)
            if job.get("type") == "job":
                await run_job(ws, job)


if __name__ == "__main__":
    asyncio.run(main())
