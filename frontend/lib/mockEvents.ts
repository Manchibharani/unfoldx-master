import type { WorkspaceEvent } from "./types";

/**
 * Simulates the Day-1 happy path from the architecture doc's backend
 * workflow (steps 2, 3, 5, 6, 7, 8) so the UI can be built and demoed
 * before the FastAPI backend is wired up. Swap NEXT_PUBLIC_MOCK=0 once
 * the real WebSocket endpoint is live — no component code changes needed.
 */

let counter = 0;
let seq = 0;
let prevHash = "";

function fakeHash(): string {
  counter += 1;
  return `${counter.toString(16).padStart(4, "0")}${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

function fakeSignature(): string {
  return `mock-sig-${crypto.randomUUID()}`;
}

function makeEvent(
  partial: Omit<WorkspaceEvent, "id" | "prev_hash" | "hash" | "seq" | "signature" | "ts">
): WorkspaceEvent {
  const hash = fakeHash();
  const event: WorkspaceEvent = {
    ...partial,
    id: crypto.randomUUID(),
    seq,
    prev_hash: prevHash,
    hash,
    signature: fakeSignature(),
    ts: new Date().toISOString(),
  };
  seq += 1;
  prevHash = hash;
  return event;
}

const SCRIPT: Array<Omit<WorkspaceEvent, "id" | "prev_hash" | "hash" | "seq" | "signature" | "ts">> = [
  {
    workspace_id: "demo-workspace",
    provider: "system",
    event_type: "provider_connected",
    payload: { provider: "bob", detail: "Bob connected via hackathon-provisioned account" },
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    provider: "bob",
    event_type: "task_submitted",
    payload: { summary: "Add rate limiting to the /auth endpoint" },
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    provider: "bob",
    event_type: "plan_decomposed",
    payload: {
      subtasks: ["Inspect existing auth middleware", "Implement token-bucket limiter", "Add tests"],
      plan: [
        { id: "task-1.1", title: "Inspect existing auth middleware", files: ["src/middleware/auth.py"] },
        { id: "task-1.2", title: "Implement token-bucket limiter", files: ["src/limiter.py"] },
        { id: "task-1.3", title: "Add tests", files: ["tests/**"] },
      ],
    },
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    subtask_id: "task-1.1",
    agent_id: "bob-shell-1",
    provider: "bob",
    event_type: "route_decided",
    payload: { agent: "bob", reason: "Owns full repo context from decomposition step" },
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    subtask_id: "task-1.1",
    agent_id: "bob-shell-1",
    provider: "bob",
    event_type: "dispatch_started",
    payload: { command: "bob run --output-format stream-json" },
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    subtask_id: "task-1.1",
    agent_id: "bob-shell-1",
    provider: "bob",
    event_type: "log_line",
    payload: { line: "Reading src/middleware/auth.py" },
    tokens_delta: 412,
    cost_delta: 0.006,
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    subtask_id: "task-1.1",
    agent_id: "bob-shell-1",
    provider: "bob",
    event_type: "budget_update",
    payload: { provider: "bob", spent_usd: 0.006, cap_usd: 5.0 },
    cost_delta: 0.006,
    tokens_delta: 412,
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    subtask_id: "task-1.2",
    agent_id: "opencode-1",
    provider: "opencode",
    event_type: "route_decided",
    payload: { agent: "opencode", reason: "Lower cost per token for isolated implementation subtask" },
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    subtask_id: "task-1.2",
    agent_id: "opencode-1",
    provider: "opencode",
    event_type: "dispatch_started",
    payload: { command: "claude run --format json" },
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    subtask_id: "task-1.2",
    agent_id: "opencode-1",
    provider: "opencode",
    event_type: "log_line",
    payload: { line: "Implementing TokenBucketLimiter class" },
    tokens_delta: 890,
    cost_delta: 0.014,
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    subtask_id: "task-1.2",
    agent_id: "opencode-1",
    provider: "opencode",
    event_type: "agent_output",
    payload: {
      text: "Implemented TokenBucketLimiter with a 60 req/min refill rate.\nWired it into the auth middleware and extracted the shared config helper.",
      simulated: false,
      structured: true,
    },
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    subtask_id: "task-1.2",
    agent_id: "opencode-1",
    provider: "opencode",
    event_type: "handoff_emitted",
    payload: {
      decisions: ["Used token-bucket over sliding-window for simplicity"],
      constraints: ["Must not add a new dependency"],
      rejected_approaches: ["Redis-backed limiter — out of scope for this subtask"],
      files_touched: ["src/middleware/auth.py", "src/limiter.py", "src/limiter/config.py"],
    },
  },
  {
    workspace_id: "demo-workspace",
    task_id: "task-1",
    subtask_id: "task-1.2",
    agent_id: "opencode-1",
    provider: "opencode",
    event_type: "task_completed",
    payload: { summary: "Rate limiting implemented and tested" },
  },
];

export function startMockFeed(
  onEvent: (event: WorkspaceEvent) => void,
  onStateChange: (state: "mock") => void
): () => void {
  onStateChange("mock");
  counter = 0;
  seq = 0;
  prevHash = "";
  let i = 0;
  const interval = setInterval(() => {
    if (i >= SCRIPT.length) {
      i = 0; // loop the script so the feed keeps feeling live during a demo
    }
    onEvent(makeEvent(SCRIPT[i]));
    i += 1;
  }, 1400);

  return () => clearInterval(interval);
}
