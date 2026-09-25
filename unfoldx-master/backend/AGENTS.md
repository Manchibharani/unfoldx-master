# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Stack

Python 3.12, FastAPI (async), SQLAlchemy 2.0 async, aiosqlite (dev) / asyncpg (prod), Pydantic v2, PyJWT, fakeredis (tests).

## Commands

```bash
# Run all tests
pytest

# Run a single test by name
pytest tests/test_backend.py::test_demo_workspace_seeded_and_chain_valid

# Run a single test file
pytest tests/test_backend.py

# Start dev server
uvicorn app.main:create_app --factory --reload --port 8000

# Docker (production)
docker-compose up
```

No linter config exists in the repo; no formatting tool is configured.

## Architecture

`create_app()` in [`app/main.py`](app/main.py) is a **factory function** (not a module-level app). Uvicorn is invoked with `--factory`. The single `AppContext` object (attached to `app.state.ctx`) owns all service instances: `Database`, `InMemoryBus`/`RedisBus`, `Vault`, `EventService`, `Orchestrator`, `AgentRunner`, `BudgetService`, `EntitlementService`.

Request flow: HTTP/WS → router → `Depends(get_ctx)` → `AppContext` → service.

## Non-Obvious Patterns

### Provider CLI Adapters
- All four providers (`bob`, `claude_code`, `codex`, `gemini`) are wrapped as CLI subprocesses — there is **no SDK/HTTP client**. The binary is resolved via `shutil.which()` at runtime.
- On Windows with a `SelectorEventLoop` (Uvicorn reload mode), the adapter falls back to `subprocess.Popen` + `asyncio.to_thread` instead of `asyncio.create_subprocess_exec`. See `_use_threaded_subprocess()` in [`app/adapters/base.py`](app/adapters/base.py).
- The `{prompt}` placeholder in CLI command templates is replaced as a **single argv token** (no shell). Templates are configured via env vars / `.env` (e.g. `BOB_CMD`, `CLAUDE_CMD`).
- `gemini` provider (Antigravity/agy CLI) always runs with `keep_host_home=True` on Windows because it needs the real user profile for config discovery.

### Event Log
- The event log is **append-only and hash-chained** (SHA-256 over canonical JSON + HMAC-SHA256 signature). Never update or delete `EventLogEntry` rows. Only one writer per workspace is supported (serialised by asyncio lock). See [`app/events.py`](app/events.py).
- `GENESIS = "0" * 64` is the sentinel `prev_hash` for the first event in a workspace.
- Event types are an exhaustive closed set defined in both [`app/events.py`](app/events.py) and [`app/schemas.py`](app/schemas.py) as `Literal[...]`.

### Auth / RBAC
- Three roles with strict rank ordering: `view < control < approve` (integers 1/2/3 in `RANK` dict in [`app/deps.py`](app/deps.py)).
- `auth_mode=open` (default) means no token is required; all anonymous callers get `open_mode_role` (default `"approve"`). Production must set `AUTH_MODE=jwt`.
- Guest users are auto-created via `get_or_create_guest()` in `auth_mode=open`.
- `workspace not found` is returned (404) even when the workspace exists but the caller lacks membership, to avoid existence disclosure.

### Planning & Routing
- Bob Plan-mode is always tried **first** for task decomposition. Falls back to `heuristic_plan()` only when no enabled Bob adapter is available — not simulated Bob.
- Routing score = `0.6 * capability_fit + 0.2 * cost_efficiency + 0.2 * budget_headroom + 0.03 Bob bonus`. Agents whose CLI is not installed are excluded when at least one real CLI is available.
- Capability tags are seeded from [`app/catalog.py`](app/catalog.py) but are **editable per agent** through the API.

### Database
- SQLite is used in dev/test; PostgreSQL (asyncpg) in Docker. SQLite is configured with WAL mode, `synchronous=NORMAL`, and `busy_timeout=30000` automatically on every connection.
- Default DB path: `{DATA_DIR}/workspace.db`. Override via `DATABASE_URL` env var.
- All primary keys are `uuid4().hex` strings (not integers). Workspace IDs can also be human-readable slugs (e.g. `demo-workspace`).

### Testing
- Tests are **synchronous** (`TestClient` from Starlette, not `pytest-asyncio`). No `async def` test functions.
- `conftest.py` strips `PATH` to just Python's own directory + OS system dirs to prevent real provider CLIs from leaking into tests and flipping adapters from simulated to real.
- The `make_client` fixture uses `tmp_path`, sets `sim_delay_seconds=0.0`, and wires `gemini_cmd` to `fake_agy.py` so Antigravity appears "installed" for routing tests.
- `wait_event()` / `wait_for()` poll with 50 ms interval up to a 15 s timeout for async pipeline completion — tests are integration tests, not unit tests.
- `sql()` helper in `conftest.py` gives raw SQLite access via `db_path(client)` for state inspection.

### Code Style
- All modules begin with `from __future__ import annotations` (deferred evaluation for PEP 563 style annotations).
- SQLAlchemy models use `Mapped[T]` + `mapped_column()` (SQLAlchemy 2.0 declarative style). JSON columns default to `dict` or `list` factory (never `None`).
- Pydantic v2 (`model_validate`, `model_config`, `SettingsConfigDict`). `Settings` is loaded via `@lru_cache` `get_settings()`; tests bypass it by constructing `Settings(...)` directly.
- Relative imports everywhere within `app/` (e.g. `from ..models import ...`).
- Logger names follow `uaw.<module>` convention (e.g. `logging.getLogger("uaw.orchestrator")`).
