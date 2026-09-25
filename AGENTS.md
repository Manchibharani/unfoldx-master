# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Structure

Two independent sub-projects — run all commands from inside their own directory:

- `backend/` — Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2
- `frontend/` — Next.js 14 (App Router), TypeScript strict, Tailwind CSS, `@xyflow/react`
- `backend/hocuspocus/` — **Separate** Node.js collaborative-editing server, unrelated to the Python backend

## Backend Commands (run from `backend/`)

```bash
pytest                                              # all tests
pytest tests/test_backend.py::test_demo_workspace_seeded_and_chain_valid  # single test
uvicorn app.main:create_app --factory --reload --port 8000  # dev server
docker-compose up                                   # production
```

No linter or formatter is configured.

## Frontend Commands (run from `frontend/`)

```bash
npm run dev    # dev server (localhost:3000)
npm run build  # production build
npm run lint   # next lint
```

Backend URL defaults to `http://localhost:8000`; override with `NEXT_PUBLIC_API_URL` in `.env.local`.

## Critical Cross-Cutting Rules

- **`frontend/lib/types.ts` mirrors `app/schemas.py`** (`WorkspaceEvent`, `EventType`). Keep both in sync when adding event types.
- **`EventLogEntry` is append-only and hash-chained** — never update or delete rows.
- All primary keys are `uuid4().hex` strings (no hyphens). Use `uid()` from `app/models.py`.
- Use `now()` from `app/models.py` for `datetime` defaults — always UTC.
- Adding a new event type requires updating `Literal[...]` in both `app/events.py` AND `app/schemas.py`.

## Backend-Specific Rules

- New provider adapters: subclass `CliAdapter` in `app/adapters/base.py`, register in `app/catalog.py` PROVIDERS dict AND `build_adapters()` in `app/adapters/providers.py`.
- All router deps via `Depends(get_ctx)` / `Depends(get_session)` — never instantiate services directly in handlers.
- SQLAlchemy JSON columns must default to `dict` or `list` factory (not `None`).
- Tests use synchronous `TestClient` + `make_client` fixture. No `async def` tests, no `pytest-asyncio`.
- Never call `get_settings()` in tests — construct `Settings(...)` directly (avoids `@lru_cache` singleton leak).
- Logger names follow `uaw.<module>` convention. All modules begin with `from __future__ import annotations`.

## Frontend-Specific Rules

- All API calls go through `apiFetch` in `frontend/lib/api.ts` — it attaches the bearer token automatically.
- Auth token is stored under `uaw.access_token` in `localStorage`.
- `@/*` path alias maps to `frontend/*` (see `tsconfig.json`).
- `"gemini"` provider in `app/catalog.py` maps to the **Antigravity (`agy`) CLI** — not Google Gemini SDK.
