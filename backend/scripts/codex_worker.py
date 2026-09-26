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
import shutil
import subprocess
from pathlib import Path

import websockets


BACKEND_WS = os.environ.get("UNFOLDX_BACKEND_WS", "").rstrip("/")
TOKEN = os.environ.get("UNFOLDX_AGENT_BRIDGE_TOKEN", "")
REPO_ROOT = Path(os.environ.get("UNFOLDX_LOCAL_REPO", Path.cwd())).resolve()
def resolve_codex_command() -> str:
    """Resolve Codex on Windows too, where npm commonly installs a .cmd shim.

    create_subprocess_exec("codex", ...) can raise WinError 2 even though the
    terminal resolves PATHEXT shims. Pin the discovered launcher path before spawning it.
    """
    configured = os.environ.get("UNFOLDX_CODEX_BIN")
    if configured:
        return configured
    for candidate in ("codex", "codex.cmd", "codex.exe"):
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise FileNotFoundError(
        "Codex CLI was not found on PATH. Run 'where codex' in PowerShell, "
        "or set UNFOLDX_CODEX_BIN to the full path of codex/codex.cmd."
    )


CODEX = resolve_codex_command()


async def run_job(ws, job: dict) -> None:
    session_id = job["session_id"]
    prompt = job["prompt"]
    mode = job.get("mode", "execute")
    args = [CODEX, "exec", "--json", "--skip-git-repo-check"]
    args += ["-s", "read-only" if mode == "plan" else "danger-full-access", prompt]

    try:
        spawn_args = args
        if os.name == "nt" and CODEX.lower().endswith((".cmd", ".bat")):
            # npm installs Codex as a Windows command shim. Launch the shim through
            # cmd.exe while preserving the original argv quoting.
            command_line = subprocess.list2cmdline(args)
            spawn_args = [os.environ.get("COMSPEC") or "cmd.exe", "/d", "/s", "/c", command_line]
        proc = await asyncio.create_subprocess_exec(
            *spawn_args,
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
        raise SystemExit("Set UNFOLDX_BACKEND_WS and UNFOLDX_AGENT_BRIDGE_TOKEN.")
    uri = f"{BACKEND_WS}/ws/agent-bridge?token={TOKEN}"
    print(f"UNFOLD X Codex worker → {BACKEND_WS}")
    print(f"Local repo: {REPO_ROOT}")
    print(f"Codex executable: {CODEX}")
    async with websockets.connect(uri, ping_interval=20, ping_timeout=20, max_size=16 * 1024 * 1024) as ws:
        print("Connected. Waiting for Codex jobs…")
        async for raw in ws:
            job = json.loads(raw)
            if job.get("type") == "job":
                await run_job(ws, job)


if __name__ == "__main__":
    asyncio.run(main())
