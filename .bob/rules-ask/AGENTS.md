# Project Documentation Context (Non-Obvious Only)

## Backend

- The "gemini" provider is actually **Antigravity (agy CLI)**, not Google Gemini's own SDK. `gemini_cmd` defaults to `agy -p {prompt} ...`.
- Provider capability scores in `app/catalog.py` are **seed defaults only** — they are overridable per agent via the API and do not reflect current vendor benchmarks or pricing.
- `fake_cli.py` emits Claude-Code-shaped JSON; `fake_agy.py` emits Antigravity-shaped JSON. Both are test stand-ins only.
- The `hocuspocus/` directory at the workspace root is a **separate Node.js collaborative-editing server** — unrelated to this Python backend.
- `schema/` contains JSON Schema files for the event log format — useful reference for the WebSocket wire format.
- Bob Plan-mode planning is the primary decomposition path; `heuristic_plan()` in `app/services/planning.py` is only the fallback and is less capable.
- The `WorkspaceEvent` Pydantic schema in `app/schemas.py` mirrors the frontend `lib/types.ts` — keep them in sync when changing event fields.
- `auth_mode=open` with `open_mode_role=approve` (the defaults) means the demo workspace is fully writable without authentication — this is intentional for demos, not a security bug.

## Frontend

- The frontend is a **static export** (`output: "export"`) — cannot use `getServerSideProps`, API routes, or any server-only Next.js features.
- `NEXT_PUBLIC_MOCK=1` (the `.env.example` default) runs the built-in mock generator from `lib/mockEvents.ts`; no backend is needed.
- `lib/types.ts` is the **canonical type contract** for the WebSocket wire format — the JSON Schema in `schema/workspace-event.schema.json` is the language-agnostic authoritative source.
- The WS hook (`lib/useWorkspaceSocket.ts`) caps in-memory events at 500 and reconnects with exponential backoff (max 10 s). WebSocket replays up to `WS_REPLAY_DEFAULT` (default 200) events on reconnect from the backend DB.
- `NEXT_PUBLIC_BASE_PATH` is read by `next.config.mjs` to support GitHub Pages deployment with a sub-path prefix.
