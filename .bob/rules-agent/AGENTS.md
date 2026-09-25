# Project Coding Rules (Non-Obvious Only)

## Backend (`backend/`)

- **Never** update or delete `EventLogEntry` rows — the log is append-only and hash-chained; breaks chain integrity.
- Use `uid()` from `app/models.py` (not `str(uuid.uuid4())`) for all new primary keys and session IDs — it returns `uuid4().hex` (no hyphens).
- Use `now()` from `app/models.py` for all `datetime` defaults — always UTC.
- New provider adapters must subclass `CliAdapter` in `app/adapters/base.py`, set `provider`/`binary`/`api_key_env_attr`/`cmd_attr`/`plan_cmd_attr` class attrs, and be registered in `app/catalog.py` PROVIDERS dict AND in `build_adapters()` in `app/adapters/providers.py`.
- Adding a new event type requires updating the `Literal[...]` in **both** `app/events.py` (EVENT_TYPES tuple) and `app/schemas.py` (WorkspaceEvent.event_type field) — AND `frontend/lib/types.ts` `EventType` union.
- All router deps must go through `Depends(get_ctx)` / `Depends(get_session)` — never instantiate services directly in route handlers.
- SQLAlchemy JSON columns must default to `dict` or `list` factory (e.g. `default=dict`) not `None`, or queries will fail on empty rows.
- New tests must use the `make_client` fixture (synchronous `TestClient`), not `pytest-asyncio`. No `async def` test functions.
- Do not call `get_settings()` in tests — construct `Settings(...)` directly with overrides (the `@lru_cache` makes it a singleton that leaks state between tests otherwise).
- CLI command templates use `{prompt}` as a **single argv token** replaced by string substitution — never add shell metacharacters or extra quoting.
- New tests must use the `make_client` fixture (synchronous `TestClient`), not `pytest-asyncio`. No `async def` test functions.
- Do not call `get_settings()` in tests — construct `Settings(...)` directly with overrides (the `@lru_cache` makes it a singleton that leaks state between tests otherwise).
- CLI command templates use `{prompt}` as a **single argv token** replaced by string substitution — never add shell metacharacters or extra quoting.
- All modules begin with `from __future__ import annotations`. Relative imports within `app/` only. Logger names follow `uaw.<module>` convention.
- `backend/hocuspocus/` is a **separate Node.js process** — do not import from it in Python code.

## Frontend (`frontend/`)

- Frontend is a **static export** — no server components, no Next.js API routes. `"use client"` is required on every interactive component.
- When adding a new `EventType` in `frontend/lib/types.ts`, also update the backend `Literal[...]` (see above) and `schema/workspace-event.schema.json`.
- All frontend API calls must go through `apiFetch` in `frontend/lib/api.ts` — it transparently attaches the `uaw.access_token` bearer token from `localStorage` and wraps `ApiError`.
- WS JWT is in the query string (`?token=…`), not a header — browsers cannot set headers on WebSocket handshakes.
- `@/` alias maps to the `frontend/` root (tsconfig `paths`). TypeScript strict mode is on (`strict: true`).
