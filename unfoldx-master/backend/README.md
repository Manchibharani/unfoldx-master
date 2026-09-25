# Universal AI Workspace: Backend

FastAPI orchestrator for the IBM Bob 2.0 Hackathon project. It implements all six layers from the
project definition and speaks the exact event contract the Next.js frontend consumes.

```
Shared canvas    WebSocket /ws/workspace/{id}, SSE, REST state snapshot, Hocuspocus (Yjs) service, server-side roles
Conflict check   app/services/conflicts.py     path/glob/resource overlap, defer-until-clear + runtime detection
Handoff+Prov.    events.py + orchestrator      hash-chained, HMAC-signed log; structured HandoffObjects
Orchestration    services/orchestrator.py      Bob Plan-mode decomposition -> capability/cost-aware routing
Headless runtime adapters/                     Bob / Claude Code / Codex / Gemini behind one interface
Entitlement      services/entitlement.py       Fernet vault, plan/quota view, budget ledger + circuit breaker
```

## Run it

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:create_app --factory --reload      # http://localhost:8000/docs
pytest                                              # 19 tests
python -m scripts.demo_client "Build a login API and a React dashboard, add tests"
```

Docker (Postgres + Redis + API + canvas sync): `docker compose up --build`.

### Connect the frontend
In the frontend's `.env.local`:
```
NEXT_PUBLIC_MOCK=0
NEXT_PUBLIC_WORKSPACE_WS_URL=ws://localhost:8000/ws/workspace     # frontend appends /{workspace_id}
NEXT_PUBLIC_WORKSPACE_ID=demo-workspace
```
`demo-workspace` is created on startup (AUTH_MODE=open) with all four providers connected. The deployed
GitHub Pages site is HTTPS, so its backend must be reachable over **wss://** (put the API behind TLS) and
its origin must be in `CORS_ORIGINS` (`https://aashvarsha26.github.io` is preconfigured).

## Event contract (one JSON `WorkspaceEvent` per WebSocket frame)
Envelope: `id, workspace_id, seq, ts, event_type, agent_id, task_id, subtask_id, provider, model, session_id,
payload, cost_delta, tokens_delta, prev_hash, hash, signature`. Schema: `schema/workspace-event.schema.json`.

| event_type | payload (fields the frontend README says it reads, plus extras) |
|---|---|
| provider_connected | provider, detail (+mode, plan, cap_usd) |
| task_submitted | summary (+task_id, attachments) |
| plan_decomposed | subtasks: string[] (+rationale, planner{provider,mode}, plan[{id,title,capabilities,files,depends_on}]) |
| route_decided | agent, reason (+score, est_cost_usd, remaining_usd, breakdown) |
| conflict_detected | detail (+paths, blocked_by, averted, resolution) |
| dispatch_started | command (+agent, provider, mode plan/execute, simulated) |
| log_line | line |
| budget_update | spent_usd, cap_usd (+remaining_usd, provider, breaker, override); deltas in top-level cost_delta / tokens_delta |
| circuit_breaker_triggered | provider, detail |
| handoff_emitted | decisions, constraints, rejected_approaches, files_touched (+summary, structured) |
| authorization_denied | detail (+user, role, required, action) |
| task_completed | summary (+status `completed` or `stopped`, cost_usd, tokens) |
| error | message |

Only the 13 documented types are emitted, so the UI can't meet an unknown type. Consequences: a **stopped**
task is `task_completed` with `payload.status="stopped"`; a **failed** task is an `error` with
`payload.status="failed"`; a budget override is a `budget_update` with `payload.override=true`.

## REST API (all under `/api`; Swagger at `/docs`)
| Action | Endpoint | Min role |
|---|---|---|
| register / login / me | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | - |
| create / list workspace, members | `POST/GET /workspaces`, `GET/PUT /workspaces/{id}/members` | any / approve |
| canvas snapshot | `GET /workspaces/{id}/state` | view |
| connect provider (API key encrypted) | `POST /workspaces/{id}/providers` | approve |
| entitlement / quota / budget | `GET /workspaces/{id}/providers`, `GET .../budget` | view |
| drop agent on canvas, tune capabilities | `POST/PATCH /workspaces/{id}/agents` | control |
| upload attachment | `POST /workspaces/{id}/attachments` (multipart) | control |
| **submit task** (returns 202) | `POST /workspaces/{id}/tasks` `{prompt, attachment_ids}` | control |
| stop / redirect | `POST /tasks/{id}/stop`, `POST /tasks/{id}/subtasks/{sid}/redirect` | control + (task owner or approve) |
| set cap / override | `PUT /workspaces/{id}/budget/{provider}`, `POST .../override` | approve |
| events, tamper check, SSE | `GET .../events`, `.../events/verify`, `.../events/stream` | view |
| handoffs, conflicts | `GET .../handoffs`, `GET .../conflicts` | view |

Roles are enforced server-side on every call and on the WebSocket; a denied action from a workspace member is
also written to the provenance log as `authorization_denied`. Non-members get 404.

## How Bob is used (for the hackathon README)
1. **Plan mode is mandatory.** A task cannot be submitted unless Bob is connected (409), and Bob cannot be disconnected.
   Every task starts with a Bob Plan-mode run whose JSON output (subtasks, capability tags, file claims, dependencies)
   is validated and becomes the work graph.
2. **Bob is an executor** (headless `bob run --output-format stream-json`) competing on capability/cost with the other agents,
   and is the planner's tie-break favourite (+0.03 score) as conductor.
3. Bob's own spend goes through the same normalised budget ledger and circuit breaker.

## Behaviours worth knowing
- **Routing**: `0.6*capability_fit + 0.2*cost_efficiency + 0.2*budget_headroom`; agents with an open breaker or
  exhausted seat quota are excluded; every decision stores its full score breakdown and a readable rationale.
- **Circuit breaker**: each usage event updates the ledger; crossing the cap kills the agent's process group, emits
  `circuit_breaker_triggered`, and pauses the subtask. An approver override (or raising the cap) resumes it.
- **Conflicts**: subtasks whose claimed paths overlap an in-flight subtask are deferred (`averted: true`); an agent
  editing outside its claim onto another's claimed file is reported (`averted: false`).
- **Handoffs**: agents are told to finish with a JSON handoff block; it is parsed into a HandoffObject and injected
  into dependent subtasks' prompts. If an agent omits it, the object is derived from observed file edits (`structured: false`).
- **Provenance**: `hash = sha256(prev_hash + event fields)`, signed with HMAC; `GET .../events/verify` walks the chain.

## Honest limitations / things to verify
- **Real CLI output formats are best-effort.** Claude Code and Codex parsers follow their public JSON-lines shapes; Bob's
  `stream-json` schema, flags (`--mode plan`), and API-key env var (`BOBSHELL_API_KEY`) are **assumptions**: adjust
  the command templates in `.env` and `adapters/normalize.py:generic_event` after running `bob` once. The pipeline is
  proven end-to-end with a fake Claude-shaped CLI (subprocess, kill, timeout, cost reconciliation) and the simulator.
- **Simulation**: with a CLI missing and `ALLOW_SIMULATION=1`, a labelled simulated agent runs (`simulated: true` on
  `dispatch_started`/`log_line`; provider `mode: "simulated"`). It writes no real code. Set `ALLOW_SIMULATION=0` in prod.
- **Seed capability scores and prices are placeholders**, not benchmarks or current price lists; edit per agent/provider.
- **Sandboxing** is process-level only (scrubbed env, per-workspace HOME and cwd, own process group, timeout), not a container.
- **Jobs** run as in-process asyncio tasks (no RQ/Celery); Redis is used only for cross-process event fan-out. Run **one**
  API replica as the log writer. Tasks in flight at restart are marked failed.
- Postgres/Redis paths are covered by config + a fakeredis test, but were not run against real servers here.
- Secrets: Fernet key derives from `SECRET_KEY` in dev; production needs a KMS and key rotation.
