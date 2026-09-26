# Universal AI Workspace — Frontend

Realtime browser UI for an agent-orchestration workspace. It streams live
events from the backend over a WebSocket, renders a live event feed, tracks a
per-provider budget ledger, and provides a draggable canvas to compose, route,
prompt, and wire up AI agents.

## Features

- **Live event feed** — streamed `WorkspaceEvent`s rendered one per frame, with
  connection state (connecting / connected / reconnecting / offline).
- **Agent hub canvas** — a movable taskbar pinned over an infinite canvas
  (`@xyflow/react`). Click an agent logo to drop it on the canvas.
- **Task routing** — type a command and hit **Route** to have it decomposed and
  dispatched to an agent.
- **Agent orchestration** — pause/resume/stop agents, approve budget overrides,
  redirect subtasks, prompt agents directly, and connect agents together.
- **Budget ledger strip** — live spend vs. cap per provider, token usage, and
  red circuit-breaker state.
- **Attachments** — attach files to any agent node; they persist as chips and
  ride along with the next command.
- **Live preview window** — floats over the canvas and renders the app the
  agents are producing in an iframe.
- **Mock mode** — run fully offline against a built-in event generator when the
  backend isn't up yet.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, static export) |
| Language | TypeScript (strict) |
| UI | React 18 |
| Canvas | `@xyflow/react` (React Flow) |
| Styling | Tailwind CSS, IBM Plex Sans/Mono via `next/font/google` |

## Getting Started

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. With `NEXT_PUBLIC_MOCK=1` (the default) the app runs
entirely against the built-in mock event generator, so the UI is demoable before
any backend is running.

## Environment Variables

All variables are read at build/runtime via `NEXT_PUBLIC_*`.

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_WORKSPACE_WS_URL` | `ws://localhost:8000/ws/workspace` | WebSocket base URL; the app appends `/{workspace_id}`. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | REST base URL for control actions (submit task, stop/redirect, budget override, add agent, attach files) and auth. Unset ⇒ those actions stay local-only with a "not yet connected to backend" note. |
| `NEXT_PUBLIC_WORKSPACE_ID` | `demo-workspace` | Workspace to open on load. |
| `NEXT_PUBLIC_MOCK` | `1` | `1` = built-in mock event generator; `0` = real backend. |
| `NEXT_PUBLIC_PREVIEW_URL` | *(empty)* | Optional URL of a separately-running app to show in the live preview. |
| `NEXT_PUBLIC_BASE_PATH` | *(empty)* | Base path for the static export (e.g. `/unfoldx_frontend` on GitHub Pages). |

## Sessions & Roles

The header has a minimal **Sign in / Register** flow backed by the real backend:

- **Sign in** calls `POST /api/auth/login`, stores the returned JWT, then loads the
  identity via `GET /api/auth/me` and the caller's in-workspace role via
  `GET /api/workspaces/{id}` (role is per-workspace: `view < control < approve`).
- **Register (demo)** calls `POST /api/auth/register` and, when the backend runs in
  `AUTH_MODE=open` (its default), joins this workspace as the chosen role through
  the members endpoint. If the backend isn't in open mode it fails with a hint to
  have an approver add you.
- The role visibly gates the canvas: `view` sessions cannot submit/stop/redirect,
  prompt, add agents or attach files (inputs/buttons disabled with an explaining
  label); `approve` sessions also see the **Approve override** button. This is a
  UI convenience only — the backend still enforces every call and logs a real
  `authorization_denied` websocket event on refusal.

To demo two roles side by side: open one normal window (anonymous guest ⇒
`approve`) and one incognito window, register a second account there as `view` or
`control`, and compare the same workspace.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server on http://localhost:3000 |
| `npm run build` | Build a static export into `./out` |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## Backend Contract

The app consumes one WebSocket endpoint:

```
GET {NEXT_PUBLIC_WORKSPACE_WS_URL}/{workspace_id}   (upgraded to WebSocket)
```

Every message is a single `WorkspaceEvent` JSON object. The TypeScript contract
lives in [`lib/types.ts`](./lib/types.ts); the language-agnostic JSON Schema is
in [`schema/workspace-event.schema.json`](./schema/workspace-event.schema.json)
(validate against it from the backend too).

Payload shape per `event_type` (the UI degrades gracefully on unknown fields):

| event_type | payload fields read |
|---|---|
| `provider_connected` | `provider`, `detail` |
| `task_submitted` | `summary` |
| `plan_decomposed` | `subtasks: string[]` |
| `route_decided` | `agent`, `reason` |
| `conflict_detected` | `detail` |
| `dispatch_started` | `command` |
| `log_line` | `line` |
| `budget_update` | `spent_usd`, `cap_usd` (also top-level `cost_delta`/`tokens_delta`) |
| `circuit_breaker_triggered` | none — presence trips the provider's red state |
| `handoff_emitted` | `decisions[]`, `constraints[]`, `rejected_approaches[]`, `files_touched[]` |
| `authorization_denied` | `detail` |
| `task_completed` | `summary` |
| `error` | `message` |

Event hashes: each event carries `prev_hash` and `hash`, and the UI displays the
first 8 characters of `hash` as a visual anchor. The "Event chain" header also
shows a live **chain verified ✓ / ⚠ chain broken** badge that calls
`GET /api/workspaces/{id}/events/verify` — the backend recomputes the whole
chain (linkage, hash, and HMAC signature) and the UI polls it while events flow.

## Project Structure

```
app/                 # Next.js App Router entry (layout, page -> Workspace)
components/
  canvas/            # Agent hub canvas (React Flow), nodes, attachments
  BudgetStrip.tsx    # Per-provider budget ledger strip
  EventFeed.tsx      # Live event stream
  ConnectionStatus.tsx
  LivePreview.tsx    # Iframe preview of the produced app
  Taskbar.tsx        # Agent hub taskbar
  Workspace.tsx      # Main workspace shell
lib/
  types.ts           # WorkspaceEvent / budget / connection types
  useWorkspaceSocket.ts   # WebSocket hook with reconnection + mock mode
  useOrchestration.ts     # Agent control actions (pause, route, prompt, ...)
  mockEvents.ts      # Built-in mock event generator
  graph.ts           # Agent/provider layout, task routing, attachments
  attachments.ts     # Attachment helpers
  eventSummary.ts    # Event-type -> human summary
schema/              # workspace-event.schema.json contract
.github/workflows/   # GitHub Pages deployment
```

## Deployment

The app is configured for static export (`output: "export"`). Pushes to `main`
deploy automatically via `.github/workflows/deploy-pages.yml` to GitHub Pages.
In the repository settings, set **Pages → Source → GitHub Actions**. The site
then publishes at:

```
https://<owner>.github.io/unfoldx_frontend/
```

For other static hosts, build with `npm run build` and serve the `./out`
directory. Set `NEXT_PUBLIC_BASE_PATH` to the subpath if the site is not served
from the domain root.