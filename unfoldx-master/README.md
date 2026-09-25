# Universal AI Workspace

A multi-agent coding orchestrator with a shared canvas, budget enforcement, conflict
detection, and tamper-evident provenance. Built for the **IBM Bob 2.0 Hackathon**.

- **`backend/`** — FastAPI orchestrator (Python): runs Bob/Claude Code/Codex/Gemini as
  headless executors behind one interface, exposes the event stream that drives the UI,
  and enforces server-side roles on every call. See [`backend/README.md`](./backend/README.md).
- **`frontend/`** — Next.js canvas (TypeScript): live agent graph over a WebSocket event
  stream, budget strip with circuit-breaker overrides, role-gated controls (view/control/
  approve), and a hash-chain provenance badge. See [`frontend/README.md`](./frontend/README.md).

```
unfoldx/
├─ backend/    # FastAPI app (Python 3.11+), requires-dev.txt, docker-compose for Postgres/Redis
├─ frontend/   # Next.js app (TypeScript), npm
└─ README.md   # this file
```

## Quick start

Start the backend first (`demo-workspace` is seeded automatically with four connected
agents in `AUTH_MODE=open`):

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate     # PowerShell:  source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                               # defaults are fine for a local demo
uvicorn app.main:create_app --factory --reload     # http://localhost:8000/docs (Swagger)
python -m scripts.demo_client "Build a login API and a React dashboard, add tests"
```

Then the frontend:

```bash
cd frontend
npm install
cp .env.example .env.local                        # set NEXT_PUBLIC_MOCK=0 to hit the real backend
npm run dev                                       # http://localhost:3000
```

Docker alternative (Postgres + Redis + API + Yjs canvas sync): `cd backend && docker compose up --build`.

## Demo modes

- **Mock** (`NEXT_PUBLIC_MOCK=1`, the `.env.example` default): the UI runs on the built-in
  event generator; no backend needed. Good for layout/demo without servers.
- **Live** (`NEXT_PUBLIC_MOCK=0`): the canvas connects over
  `ws://localhost:8000/ws/workspace/demo-workspace`, and every control action (submit task,
  stop/redirect, budget override, add agent, attach files) hits the real REST API.
- **Role demo, side by side**: one browser window stays the anonymous guest (`approve`,
  sees the budget override), an incognito window registers a second account as `view` or
  `control` to see the canvas controls gate themselves accordingly. The backend still
  enforces every call and logs a real `authorization_denied` provenance event.

## What it does

| Layer | Where |
|---|---|
| Shared canvas | WS/SSE event stream (`/ws/workspace/{id}`), REST snapshot, role-gated controls, Yjs canvas-sync service (Docker) |
| Orchestration | Bob Plan-mode decomposes each task into validated subtasks (capability tags, file claims, deps), routed by capability/cost/budget score |
| Headless agents | Bob / Claude Code / Codex / Gemini behind one subprocess adapter (JSON-lines; simulated fallback when a CLI is missing) |
| Entitlement | Fernet credential vault, per-provider budget ledger, circuit breaker + approver override |
| Conflicts | Path/glob/resource overlap check: defer conflicting subtasks or flag runtime edits outside claims |
| Provenance | Every event hash-chained (`sha256(prev+payload)`) and HMAC-signed; `GET /workspaces/{id}/events/verify` recomputes the chain and the UI badges it |

## Environment at a glance

| Variable | Applies to | Default | Purpose |
|---|---|---|---|
| `AUTH_MODE` / `OPEN_MODE_ROLE` | backend | `open` / `approve` | open guest auth for demo; `jwt` for tokens |
| `CORS_ORIGINS` | backend | localhost:3000 + GitHub Pages | what origins may call the API |
| `ALLOW_SIMULATION` | backend | `true` | simulated agents when CLIs are missing |
| `NEXT_PUBLIC_MOCK` | frontend | `1` | `1` = built-in mock generator, `0` = real backend |
| `NEXT_PUBLIC_API_URL` | frontend | `http://localhost:8000` | REST base for control actions + auth |
| `NEXT_PUBLIC_WORKSPACE_WS_URL` | frontend | `ws://localhost:8000/ws/workspace` | WebSocket base (app appends `/{id}`, `?token=`) |

Full lists: [`backend/README.md`](./backend/README.md) and [`frontend/README.md`](./frontend/README.md).

## Tooling

```bash
cd frontend && npm run lint     # ESLint
cd frontend && npx tsc --noEmit # typecheck
cd backend  && pytest           # 19 tests
```