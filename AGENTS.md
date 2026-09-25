# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Repository structure

| Directory | Purpose |
|---|---|
| `backend/` | Python 3.12 FastAPI orchestrator — source of truth for events/budget/RBAC |
| `frontend/` | Next.js 14 TypeScript canvas — static export (`output: "export"`) |
| `backend/hocuspocus/` | Separate Node.js Yjs collaborative-editing server (unrelated to Python API) |
| `schema/` | JSON Schema for the wire-format event log (canonical language-agnostic reference) |

## Commands

All backend commands must be run from `backend/`; all frontend commands from `frontend/`.

```bash
# Backend — run tests (all)
cd backend && pytest

# Backend — run a single test
cd backend && pytest tests/test_backend.py::test_demo_workspace_seeded_and_chain_valid

# Backend — dev server (must use --factory; app is not a module-level object)
cd backend && uvicorn app.main:create_app --factory --reload --port 8000

# Frontend — dev server (mock mode; set NEXT_PUBLIC_MOCK=0 for live backend)
cd frontend && npm run dev

# Frontend — lint + typecheck
cd frontend && npm run lint
cd frontend && npx tsc --noEmit

# Full stack (Postgres + Redis + API + Yjs)
cd backend && docker compose up --build
```

## Non-obvious rules — backend

See `backend/AGENTS.md` for the full list. Critical summary:

- **Event log is append-only and hash-chained** — never UPDATE or DELETE `EventLogEntry` rows.
- Use `uid()` / `now()` from `backend/app/models.py` (not raw `uuid.uuid4()` / `datetime.utcnow()`).
- New event types → update `Literal[...]` in **both** `backend/app/events.py` AND `backend/app/schemas.py`.
- New provider adapters → subclass `CliAdapter`, register in `backend/app/catalog.py` AND `backend/app/adapters/providers.py`.
- Tests use synchronous `TestClient` + `make_client` fixture — no `async def` test functions, no `pytest-asyncio`.
- Never call `get_settings()` in tests — construct `Settings(...)` directly (lru_cache leaks across tests).
- Router deps must use `Depends(get_ctx)` / `Depends(get_session)` — never instantiate services inline.
- SQLAlchemy JSON columns must default to `dict` or `list` factory, never `None`.

## Non-obvious rules — frontend

- The frontend is a **static export** (`output: "export"` in `next.config.mjs`). No server components or API routes.
- `NEXT_PUBLIC_WORKSPACE_WS_URL` is just the **base** URL; the hook appends `/{workspaceId}` (and `?token=…` when a JWT is present — browsers can't set WS headers).
- `NEXT_PUBLIC_MOCK=1` runs the built-in mock generator (`lib/mockEvents.ts`) — no backend needed.
- `lib/types.ts` is the **canonical frontend contract** — keep it in sync with the backend's Pydantic schemas and `schema/workspace-event.schema.json` when changing event fields.
- The "gemini" provider in code maps to **Antigravity (`agy` CLI)**, not Google's own SDK.
- `@/` path alias resolves to the `frontend/` root (configured in `tsconfig.json`).
- All interactive components must include `"use client"` at the top (Next.js 14 App Router default is server components).
