import type { Provider, WorkspaceEvent } from "./types";

/**
 * Folds the append-only event stream into the node/edge model the Agent Hub
 * renders. Pure and framework-agnostic on purpose: the canvas only maps this
 * to React Flow nodes, so the real backend (or a test) can feed the same shape.
 *
 * Mirrors the architecture doc's layers: Bob's plan decomposition, capability
 * routing, per-provider budget/entitlement, and the stop-loss circuit breaker.
 */

/** Providers shown as agent nodes around the hub. Bob is the hub itself. */
export const AGENT_PROVIDERS: Provider[] = ["claude_code", "codex", "gemini"];

export const PROVIDER_LABEL: Record<Provider, string> = {
  bob: "Bob",
  claude_code: "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
  system: "System",
};

export const PROVIDER_ACCENT: Record<Provider, string> = {
  bob: "#D9A441",
  claude_code: "#4FB8A6",
  codex: "#8D7BE0",
  gemini: "#8A93A6",
  system: "#8A93A6",
};

export const PROVIDER_CAPABILITIES: Record<Provider, string[]> = {
  bob: ["decomposition", "coordination", "repo-context"],
  claude_code: ["implementation", "refactor", "tests"],
  codex: ["algorithms", "optimization", "implementation"],
  gemini: ["research", "docs", "analysis"],
  system: ["scheduling"],
};

export const LAYOUT = {
  subtaskX: 0,
  hubX: 340,
  agentX: 720,
  subtaskGap: 132,
  agentGap: 250,
};

export type AgentStatus = "idle" | "running" | "paused" | "stopped" | "tripped";
export type SubtaskStatus = "submitted" | "queued" | "running" | "done" | "blocked";
export type ActivityKind = "log" | "command" | "result" | "prompt" | "route" | "status";

export interface ActivityLine {
  id: string;
  at: string;
  kind: ActivityKind;
  text: string;
}

/** A file the user picked from disk, before it's pinned to an agent. */
export interface FileDraft {
  id: string;
  name: string;
  size: number;
  type: string;
  /** Truncated text content when readable; "" for binaries beyond the cap. */
  content: string;
  /** Original browser File (kept for real multipart uploads to the backend). */
  raw?: File;
}

/** A file pinned to an agent node (agentId) or staged on the taskbar (null). */
export interface Attachment extends FileDraft {
  agentId: string | null;
  at: string;
}

export interface AgentState {
  /** React Flow node id: "hub-bob", "agent-<provider>", or "agent-<uuid>". */
  id: string;
  provider: Provider;
  label: string;
  builtIn: boolean;
  connected: boolean;
  active: boolean;
  status: AgentStatus;
  spentUsd: number;
  capUsd: number;
  tokensUsed: number;
  breakerTripped: boolean;
  eventCount: number;
  lastEventType: WorkspaceEvent["event_type"] | null;
  /** Latest task the backend reported (needed for task-level control calls). */
  activeTaskId: string | null;
  capabilities: string[];
  activity: ActivityLine[];
  attachments: Attachment[];
}

export interface SubtaskState {
  id: string;
  taskId: string;
  label: string;
  provider: Provider | null;
  agentId: string | null;
  status: SubtaskStatus;
  conflict: boolean;
  filesTouched: number;
  routeReason: string | null;
  files: Attachment[];
}

export interface TaskState {
  id: string;
  summary: string;
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  sourceLabel: string;
  targetLabel: string;
}

export interface AddedAgent {
  id: string;
  provider: Provider;
  label: string;
  x: number;
  y: number;
}

export interface SubmittedTask {
  id: string;
  summary: string;
  provider: Provider;
  reason: string;
  files?: Attachment[];
}

export interface AgentPrompt {
  id: string;
  agentId: string;
  text: string;
  at: string;
  status: "queued" | "done";
}

/** Local, optimistic state from the orchestration controls. */
export interface HubOverrides {
  paused: Set<Provider>;
  stopped: Set<Provider>;
  approved: Set<Provider>;
  redirected: Map<string, Provider>;
  submitted: SubmittedTask[];
  addedAgents: AddedAgent[];
  connections: Array<{ id: string; source: string; target: string }>;
  prompts: AgentPrompt[];
  attachments: Attachment[];
}

export function emptyOverrides(): HubOverrides {
  return {
    paused: new Set(),
    stopped: new Set(),
    approved: new Set(),
    redirected: new Map(),
    submitted: [],
    addedAgents: [],
    connections: [],
    prompts: [],
    attachments: [],
  };
}

export interface HubModel {
  agents: AgentState[];
  bob: AgentState;
  tasks: TaskState[];
  subtasks: SubtaskState[];
  connections: Connection[];
  activeProvider: Provider | null;
}

const MAX_ACTIVITY = 14;

function freshAgent(id: string, provider: Provider, label: string, builtIn: boolean): AgentState {
  return {
    id,
    provider,
    label,
    builtIn,
    connected: false,
    active: false,
    status: "idle",
    spentUsd: 0,
    capUsd: 0,
    tokensUsed: 0,
    breakerTripped: false,
    eventCount: 0,
    lastEventType: null,
    activeTaskId: null,
    capabilities: PROVIDER_CAPABILITIES[provider],
    activity: [],
    attachments: [],
  };
}

function pushActivity(agent: AgentState, line: ActivityLine) {
  agent.activity.push(line);
  if (agent.activity.length > MAX_ACTIVITY) {
    agent.activity.splice(0, agent.activity.length - MAX_ACTIVITY);
  }
}

function line(
  event: WorkspaceEvent,
  kind: ActivityKind,
  text: string
): ActivityLine {
  return { id: `${event.id}-${kind}`, at: event.ts, kind, text };
}

function subtaskFor(
  event: WorkspaceEvent,
  subtasks: Map<string, SubtaskState>
): SubtaskState | undefined {
  return event.subtask_id ? subtasks.get(event.subtask_id) : undefined;
}

function lastRunning(subtasks: Map<string, SubtaskState>): SubtaskState | undefined {
  let found: SubtaskState | undefined;
  for (const st of subtasks.values()) if (st.status === "running") found = st;
  return found;
}

const KEYWORDS: Array<{ capability: string; words: string[] }> = [
  { capability: "tests", words: ["test", "coverage", "pytest", "jest"] },
  { capability: "refactor", words: ["refactor", "cleanup", "restructure"] },
  { capability: "implementation", words: ["implement", "build", "add ", "feature", "fix", "bug"] },
  { capability: "algorithms", words: ["algorithm", "optimi", "performance", "complexity"] },
  { capability: "optimization", words: ["speed", "latency", "memory"] },
  { capability: "research", words: ["research", "compare", "investigate", "explore"] },
  { capability: "docs", words: ["document", "readme", "explain", "write up"] },
  { capability: "analysis", words: ["analy", "data", "metric", "report"] },
  { capability: "decomposition", words: ["plan", "break down", "decompose", "roadmap"] },
];

/**
 * Local stand-in for the orchestrator's capability + cost scoring (architecture
 * step 3). The backend owns the real decision; this keeps the UI honest and
 * demoable: it says which capability it matched and why.
 */
export function routeTask(prompt: string): { provider: Provider; reason: string } {
  const text = prompt.toLowerCase();
  const matched: string[] = [];
  for (const k of KEYWORDS) {
    if (k.words.some((w) => text.includes(w))) matched.push(k.capability);
  }

  const candidates: Provider[] = ["claude_code", "gemini", "codex"];
  let best: Provider = "claude_code";
  let bestScore = -1;
  for (const p of candidates) {
    const score = matched.filter((c) => PROVIDER_CAPABILITIES[p].includes(c)).length;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (bestScore <= 0) {
    return {
      provider: "claude_code",
      reason: "No capability signal — defaulting to Claude Code for general implementation.",
    };
  }
  return {
    provider: best,
    reason: `Matched ${matched.join(", ")} to ${PROVIDER_LABEL[best]}'s ${PROVIDER_CAPABILITIES[
      best
    ].join("/")} profile.`,
  };
}

export function buildHub(events: WorkspaceEvent[], overrides: HubOverrides): HubModel {
  const agents: AgentState[] = AGENT_PROVIDERS.map((p) =>
    freshAgent(`agent-${p}`, p, PROVIDER_LABEL[p], true)
  );
  const bob = freshAgent("hub-bob", "bob", "Bob Shell", true);
  for (const added of overrides.addedAgents) {
    agents.push(freshAgent(added.id, added.provider, added.label, false));
  }
  const byProvider = new Map<Provider, AgentState[]>();
  for (const a of agents) {
    const list = byProvider.get(a.provider) ?? [];
    list.push(a);
    byProvider.set(a.provider, list);
  }
  bob.connected = false;

  const tasks = new Map<string, TaskState>();
  const subtasks = new Map<string, SubtaskState>();
  let activeProvider: Provider | null = null;
  let currentTaskId: string | null = null;

  for (const event of events) {
    activeProvider = event.provider;
    if (event.task_id) currentTaskId = event.task_id;
    const p = event.payload as Record<string, any>;

    if (event.provider === "bob") {
      bob.connected = true;
      bob.eventCount += 1;
      bob.lastEventType = event.event_type;
    } else {
      for (const a of byProvider.get(event.provider) ?? []) {
        a.connected = true;
        a.eventCount += 1;
        a.lastEventType = event.event_type;
      }
    }

    switch (event.event_type) {
      case "provider_connected": {
        const target = p.provider as Provider | undefined;
        if (target === "bob") bob.connected = true;
        else if (target) for (const a of byProvider.get(target) ?? []) a.connected = true;
        if (typeof p.detail === "string") {
          const holder = target === "bob" ? bob : (byProvider.get(target ?? "system")?.[0] ?? bob);
          pushActivity(holder, line(event, "status", p.detail));
        }
        break;
      }
      case "task_submitted": {
        if (event.task_id) {
          const summary = typeof p.summary === "string" ? p.summary : "Task submitted";
          tasks.set(event.task_id, { id: event.task_id, summary });
          pushActivity(bob, line(event, "command", `task: ${summary}`));
        }
        break;
      }
      case "plan_decomposed": {
        const taskId = event.task_id;
        if (!taskId) break;
        if (!tasks.has(taskId)) tasks.set(taskId, { id: taskId, summary: "Decomposed task" });
        const plan: Array<{ id?: unknown; title?: unknown }> = Array.isArray(p.plan) ? p.plan : [];
        const titles: string[] =
          Array.isArray(p.subtasks) && p.subtasks.length > 0
            ? p.subtasks
            : plan.map((entry) => (typeof entry.title === "string" ? entry.title : ""));
        titles.forEach((label, i) => {
          // The backend's payload.plan carries the real server-generated subtask
          // id, which task-level controls (redirect) call against. The mock feed
          // only has titles, so fall back to a positional id there.
          const id = typeof plan[i]?.id === "string" ? (plan[i].id as string) : `${taskId}.${i + 1}`;
          if (!subtasks.has(id)) {
            subtasks.set(id, {
              id,
              taskId,
              label,
              provider: null,
              agentId: null,
              status: "queued",
              conflict: false,
              filesTouched: 0,
              routeReason: null,
              files: [],
            });
          }
        });
        pushActivity(bob, line(event, "route", `decomposed into ${titles.length} subtask(s)`));
        break;
      }
      case "route_decided": {
        const st = subtaskFor(event, subtasks);
        if (st) {
          st.provider = (p.agent as Provider) ?? event.provider;
          st.agentId = event.agent_id ?? null;
          st.routeReason = typeof p.reason === "string" ? p.reason : null;
        }
        pushActivity(bob, line(event, "route", `→ ${p.agent ?? event.provider}: ${p.reason ?? ""}`));
        break;
      }
      case "dispatch_started": {
        const st = subtaskFor(event, subtasks);
        if (st) st.status = "running";
        const holder = event.provider === "bob" ? bob : byProvider.get(event.provider)?.[0];
        if (holder) pushActivity(holder, line(event, "command", p.command ?? "dispatch started"));
        break;
      }
      case "log_line": {
        const holder = event.provider === "bob" ? bob : byProvider.get(event.provider)?.[0];
        if (holder) pushActivity(holder, line(event, "log", p.line ?? "…"));
        break;
      }
      case "handoff_emitted": {
        const st = subtaskFor(event, subtasks);
        if (st) {
          st.status = "done";
          if (Array.isArray(p.files_touched)) st.filesTouched = p.files_touched.length;
        }
        const holder = event.provider === "bob" ? bob : byProvider.get(event.provider)?.[0];
        if (holder) {
          const decisions = Array.isArray(p.decisions) ? p.decisions.length : 0;
          const files = Array.isArray(p.files_touched) ? p.files_touched.length : 0;
          pushActivity(holder, line(event, "result", `handoff: ${decisions} decision(s), ${files} file(s)`));
        }
        break;
      }
      case "task_completed": {
        const st = subtaskFor(event, subtasks);
        if (st) st.status = "done";
        const holder = event.provider === "bob" ? bob : byProvider.get(event.provider)?.[0];
        if (holder) pushActivity(holder, line(event, "result", p.summary ?? "task completed"));
        break;
      }
      case "conflict_detected": {
        const st = subtaskFor(event, subtasks) ?? lastRunning(subtasks);
        if (st) st.conflict = true;
        const holder = event.provider === "bob" ? bob : byProvider.get(event.provider)?.[0];
        if (holder) pushActivity(holder, line(event, "status", p.detail ?? "conflict detected"));
        break;
      }
      case "authorization_denied": {
        const st = subtaskFor(event, subtasks);
        if (st) st.status = "blocked";
        const holder = event.provider === "bob" ? bob : byProvider.get(event.provider)?.[0];
        if (holder) pushActivity(holder, line(event, "status", p.detail ?? "action denied by role"));
        break;
      }
      case "budget_update": {
        const target = (p.provider as Provider) ?? event.provider;
        for (const a of byProvider.get(target) ?? []) {
          if (typeof p.spent_usd === "number") a.spentUsd = p.spent_usd;
          if (typeof p.cap_usd === "number") a.capUsd = p.cap_usd;
        }
        break;
      }
      case "circuit_breaker_triggered": {
        for (const a of byProvider.get(event.provider) ?? []) a.breakerTripped = true;
        const holder = event.provider === "bob" ? bob : byProvider.get(event.provider)?.[0];
        if (holder) pushActivity(holder, line(event, "status", "circuit breaker tripped — paused"));
        break;
      }
      case "error": {
        const holder = event.provider === "bob" ? bob : byProvider.get(event.provider)?.[0];
        if (holder) pushActivity(holder, line(event, "status", p.message ?? "error"));
        break;
      }
      default:
        break;
    }

    if (typeof event.tokens_delta === "number") {
      for (const a of byProvider.get(event.provider) ?? []) a.tokensUsed += event.tokens_delta;
      if (event.provider === "bob") bob.tokensUsed += event.tokens_delta;
    }
    // budget_update carries an absolute spent_usd, so adding cost_delta too
    // would double-count the same spend.
    if (typeof event.cost_delta === "number" && event.event_type !== "budget_update") {
      for (const a of byProvider.get(event.provider) ?? []) a.spentUsd += event.cost_delta;
      if (event.provider === "bob") bob.spentUsd += event.cost_delta;
    }
  }

  // The latest task_id the backend reported is what task-level controls (stop)
  // target, so every node carries it for the action payload.
  for (const a of agents) a.activeTaskId = currentTaskId;
  bob.activeTaskId = currentTaskId;

  // --- Apply local orchestration overrides (optimistic, backend pending) ---

  for (const provider of overrides.stopped) {
    for (const a of byProvider.get(provider) ?? []) a.status = "stopped";
  }
  for (const provider of overrides.paused) {
    for (const a of byProvider.get(provider) ?? []) {
      if (a.status !== "stopped") a.status = "paused";
    }
  }
  for (const provider of overrides.approved) {
    for (const a of byProvider.get(provider) ?? []) a.breakerTripped = false;
  }
  for (const [subtaskId, target] of overrides.redirected) {
    const st = subtasks.get(subtaskId);
    if (st) st.provider = target;
  }
  for (const submitted of overrides.submitted) {
    if (!subtasks.has(submitted.id)) {
      subtasks.set(submitted.id, {
        id: submitted.id,
        taskId: submitted.id,
        label: submitted.summary,
        provider: submitted.provider,
        agentId: null,
        status: "running",
        conflict: false,
        filesTouched: 0,
        routeReason: submitted.reason,
        files: submitted.files ?? [],
      });
    }
  }

  // User prompts show up on that agent's monitor.
  for (const prompt of overrides.prompts) {
    const holder =
      prompt.agentId === bob.id
        ? bob
        : agents.find((a) => a.id === prompt.agentId) ?? byProvider.get("bob")?.[0];
    if (holder) pushActivity(holder, { id: prompt.id, at: prompt.at, kind: "prompt", text: `you: ${prompt.text}` });
  }

  // Files pinned to each node (persisted across prompts/routes).
  const attachmentsByAgent = new Map<string, Attachment[]>();
  for (const att of overrides.attachments) {
    if (!att.agentId) continue;
    const list = attachmentsByAgent.get(att.agentId) ?? [];
    list.push(att);
    attachmentsByAgent.set(att.agentId, list);
  }
  for (const a of [bob, ...agents]) {
    a.attachments = attachmentsByAgent.get(a.id) ?? [];
  }

  for (const a of agents) {
    if (a.status === "idle" && a.breakerTripped) a.status = "tripped";
    a.active = a.provider === activeProvider && a.status !== "stopped";
    a.activity.sort((x, y) => x.at.localeCompare(y.at));
  }
  bob.active = activeProvider === "bob";
  bob.activity.sort((x, y) => x.at.localeCompare(y.at));

  // --- Connections (user-drawn, n8n-style) ---
  const labelById = new Map<string, string>();
  labelById.set(bob.id, bob.label);
  for (const a of agents) labelById.set(a.id, a.label);
  for (const st of subtasks.values()) labelById.set(`subtask-${st.id}`, st.label);

  const connections: Connection[] = overrides.connections.map((c) => ({
    id: c.id,
    source: c.source,
    target: c.target,
    sourceLabel: labelById.get(c.source) ?? c.source,
    targetLabel: labelById.get(c.target) ?? c.target,
  }));

  return {
    agents,
    bob,
    tasks: Array.from(tasks.values()),
    subtasks: Array.from(subtasks.values()),
    connections,
    activeProvider,
  };
}
