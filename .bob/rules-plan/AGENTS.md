# Project Architecture Rules (Non-Obvious Only)

## Backend

- **Single writer per workspace** event chain. Redis is fan-out only — it does NOT replicate chain writes. Run exactly one API process as the chain writer; additional replicas are read-only event consumers.
- `AppContext` is created once per `create_app()` call and stored on `app.state.ctx`. It is NOT a singleton — each `TestClient` gets its own `AppContext` with its own DB, bus, and services. Do not introduce module-level service state.
- The orchestrator uses a **per-workspace asyncio lock** to serialise event appends. Do not call `EventService.append()` concurrently for the same workspace without holding that lock.
- Adapter subprocess process groups: on Linux/Mac, processes are started with `start_new_session=True` so `stop()` can `SIGKILL` the entire process group. On Windows, individual `proc.terminate()`/`proc.kill()` is used instead.
- The `RedisBus` is a fan-out layer only — it does NOT persist events. The `event_log` table is the source of truth. WebSocket reconnects replay from DB via `ws_replay_default` (default 200 events).
- Budget circuit breaker state (`closed`/`open`) lives in `BudgetLedger.breaker_state`. Tripped breakers exclude that provider from routing but do not cancel running subtasks.
- Subtask status transitions: `pending → blocked → running → paused_budget → completed/failed/cancelled`. `blocked` means unsatisfied `depends_on`; `paused_budget` means budget cap hit mid-run.
- Planning always uses Bob **plan mode** (`bob_plan_cmd`), not execute mode. If Bob is unavailable, `heuristic_plan()` produces a static decomposition — it cannot call any external service.
- `Settings` is constructed with `model_validator(mode="after")` which creates `data_dir`, generates `secret_key`, and derives `database_url` at construction time. Any code path that modifies these after construction will not be persisted.
- Subtask status transitions: `pending → blocked → running → paused_budget → completed/failed/cancelled`. `blocked` means unsatisfied `depends_on`; `paused_budget` means budget cap hit mid-run.
- Planning always uses Bob **plan mode** (`bob_plan_cmd`), not execute mode. If Bob is unavailable, `heuristic_plan()` produces a static decomposition — it cannot call any external service.
- `Settings` is constructed with `model_validator(mode="after")` which creates `data_dir`, generates `secret_key`, and derives `database_url` at construction time. Any code path that modifies these after construction will not be persisted.

## Frontend

- **Frontend and backend are completely separate deployments.** The frontend is a static Next.js App Router app; it communicates with the backend only via HTTP REST (`/api/*`) and WebSocket (`/ws/*`). No server-side Python is involved in the Next.js build.
- The frontend is a **static export** (`next.config.mjs`: `output: "export"`). The entire canvas is one `<Workspace>` component; there is no routing beyond the single page (`app/page.tsx`).
- Budget state is derived **entirely client-side** from `budget_update` / `circuit_breaker_triggered` events received over the WebSocket — there is no separate REST budget polling endpoint consumed by the UI.
- Role enforcement is **dual-layer**: the frontend gates UI controls via `lib/permissions.ts`, but the backend re-enforces every action and emits an `authorization_denied` event if bypassed.
- The canvas graph layout is managed by `@xyflow/react` (React Flow v12). Agent node positions are ephemeral (not persisted to the backend).
- `frontend/lib/types.ts` is the **shared type contract** between frontend and backend. When the backend wire format changes, this file must be updated — there is no code-generation step.
