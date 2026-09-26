# Local Agent Bridge with ChatGPT-authenticated Codex

UNFOLD X can execute Codex locally without an OpenAI API key.

## Architecture

```
UNFOLD X frontend
       |
       v
Railway backend  <--- outbound WebSocket ---  local Codex worker
                                              |
                                              v
                                         Codex CLI
                                              |
                                         ChatGPT login
```

Railway never receives the local Codex/ChatGPT credential. The worker runs Codex on the machine where it is started, so file edits happen in `UNFOLDX_LOCAL_REPO`.

## Railway

Set one environment variable on the backend service:

```
UNFOLDX_AGENT_BRIDGE_TOKEN=<long-random-secret>
```

Keep `OPENAI_API_KEY` unset if you want Codex to use ChatGPT authentication through the agent bridge. The bridge token is only for authenticating the worker to UNFOLD X; it is not a ChatGPT/OpenAI credential.

## Local machine

1. Install Codex CLI.
2. Start Codex once and complete its ChatGPT sign-in flow.
3. Install the worker dependency:

```
pip install "websockets>=13,<16"
```

4. Start the worker:

Windows PowerShell:

```
$env:UNFOLDX_BACKEND_WS="wss://unfoldx-master-production.up.railway.app"
$env:UNFOLDX_AGENT_BRIDGE_TOKEN="<same token as Railway>"
$env:UNFOLDX_LOCAL_REPO="C:\path\to\your\workspace"
python backend/scripts/codex_worker.py
```

The worker makes an outbound connection, so Railway does not need to reach your localhost.

When the worker is connected, UNFOLD X routes Codex work through it and labels the execution as **agent bridge / ChatGPT-authenticated**.

If the worker is offline, Codex is not considered authenticated by the agent-bridge path.


## Windows Codex executable

The worker resolves `codex`, `codex.cmd`, and `codex.exe` automatically. If Codex is installed but is not discoverable from the Python process, run `where codex` and set:

```powershell
$env:UNFOLDX_CODEX_BIN="C:\path\to\codex.cmd"
```

The worker handles the Windows `.cmd` launcher itself.

## IBM Bob Shell on Railway

Bob runs non-interactively with `--accept-license` and the official `BOB_API_KEY` environment variable. UNFOLD X also accepts the older `BOBSHELL_API_KEY` variable as a compatibility fallback.
