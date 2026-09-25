# Project Documentation Context (Non-Obvious Only)

- The "gemini" provider is actually **Antigravity (agy CLI)**, not Google Gemini's own SDK. `gemini_cmd` defaults to `agy -p {prompt} ...`.
- Provider capability scores in `app/catalog.py` are **seed defaults only** — they are overridable per agent via the API and do not reflect current vendor benchmarks or pricing.
- `fake_cli.py` emits Claude-Code-shaped JSON; `fake_agy.py` emits Antigravity-shaped JSON. Both are test stand-ins only.
- The `hocuspocus/` directory at the workspace root is a **separate Node.js collaborative-editing server** — unrelated to this Python backend.
- `schema/` contains JSON Schema files for the event log format — useful reference for the WebSocket wire format.
- Bob Plan-mode planning is the primary decomposition path; `heuristic_plan()` in `app/services/planning.py` is only the fallback and is less capable.
- The `WorkspaceEvent` Pydantic schema in `app/schemas.py` mirrors the frontend `lib/types.ts` — keep them in sync when changing event fields.
- `auth_mode=open` with `open_mode_role=approve` (the defaults) means the demo workspace is fully writable without authentication — this is intentional for demos, not a security bug.
- Frontend is a **Next.js 14 App Router** app (`frontend/app/`). The `@/*` path alias resolves to `frontend/*`.
- `frontend/lib/useWorkspaceSocket.ts` handles WebSocket reconnection and event replay; `ws_replay_default` is 200 events on reconnect.
