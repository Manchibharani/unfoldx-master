/**
 * Shared contract with the backend (FastAPI).
 * Mirrors the EventLogEntry / BudgetLedger entities in the architecture doc.
 * Keep this file and the backend's Pydantic models in sync — see
 * schema/workspace-event.schema.json for the language-agnostic version.
 */

export type Provider =
  | "bob"
  | "claude_code"
  | "opencode"
  | "codex"
  | "github_copilot" // Frontend placeholder; not part of the backend schema yet.
  | "gemini"
  | "system";

export type EventType =
  | "provider_connected"
  | "task_submitted"
  | "plan_decomposed"
  | "route_decided"
  | "conflict_checked"
  | "conflict_detected"
  | "dispatch_started"
  | "log_line"
  | "budget_update"
  | "circuit_breaker_triggered"
  | "handoff_emitted"
  | "agent_output"
  | "authorization_denied"
  | "task_completed"
  | "error";

export interface WorkspaceEvent {
  /** Unique event id (uuid4) */
  id: string;
  workspace_id: string;
  /** Monotonic per-workspace sequence number */
  seq: number;
  /** ISO 8601, e.g. 2026-09-25T14:03:21.114Z */
  ts: string;
  event_type: EventType;
  agent_id?: string | null;
  task_id?: string | null;
  subtask_id?: string | null;
  provider: Provider;
  /** Model identifier the provider ran with, if known */
  model?: string | null;
  /** Session the event belongs to, if the provider tracks one */
  session_id?: string | null;
  /** Event-type-specific data. See README for shape per event_type. */
  payload: Record<string, unknown>;
  /** USD delta this event added to spend, if any */
  cost_delta?: number;
  tokens_delta?: number;
  /** Hash of the previous event in this workspace's chain ("" for the first event) */
  prev_hash: string;
  /** Hash of this event (id + prev_hash + canonical payload) */
  hash: string;
  /** Backend signature over the canonical event bytes */
  signature: string;
}

export interface BudgetSnapshot {
  provider: Provider;
  spent_usd: number;
  cap_usd: number;
  tokens_used: number;
  circuit_breaker_tripped: boolean;
}

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "mock";
