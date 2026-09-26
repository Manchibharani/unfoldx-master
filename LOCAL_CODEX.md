# Local Codex with ChatGPT Login

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
LOCAL_WORKER_TOKEN=<long-random-secret>
```

Keep `OPENAI_API_KEY` unset if you want Codex to use ChatGPT authentication through the local worker.

## Local machine

1. Install Codex CLI.
2. Start Codex once and complete its ChatGPT sign-in flow.
3. Install the worker dependency:

```
pip install websockets
```

4. Start the worker:

Windows PowerShell:

```
$env:UNFOLDX_BACKEND_WS="wss://unfoldx-master-production.up.railway.app"
$env:UNFOLDX_WORKER_TOKEN="<same token as Railway>"
$env:UNFOLDX_LOCAL_REPO="C:\path\to\your\workspace"
python backend/scripts/codex_worker.py
```

The worker makes an outbound connection, so Railway does not need to reach your localhost.

When the worker is connected, UNFOLD X routes Codex work through it and labels the execution as **local worker / ChatGPT-authenticated**.

If the worker is offline, Codex is not considered authenticated by the local-worker path.
