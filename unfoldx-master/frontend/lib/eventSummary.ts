import type { WorkspaceEvent } from "./types";

/**
 * Turns a raw payload into one plain-language line. Falls back to a
 * compact JSON preview for event types this hasn't been taught yet,
 * so an unrecognized backend payload still renders instead of breaking.
 */
export function summarize(event: WorkspaceEvent): string {
  const p = event.payload as Record<string, any>;
  let text: string;
  switch (event.event_type) {
    case "provider_connected":
      text = p.detail ?? `${p.provider ?? event.provider} connected`;
      break;
    case "task_submitted":
      text = p.summary ?? "Task submitted";
      break;
    case "plan_decomposed":
      text = Array.isArray(p.subtasks)
        ? `Decomposed into ${p.subtasks.length} subtask(s): ${p.subtasks.join(", ")}`
        : "Task decomposed";
      break;
    case "route_decided":
      text = p.reason ? `Routed to ${p.agent ?? event.provider} — ${p.reason}` : "Route decided";
      break;
    case "conflict_checked":
      text = "Checked for conflicts with in-flight work — none found";
      break;
    case "conflict_detected":
      text = p.detail ?? "Conflict detected against another in-flight subtask";
      break;
    case "dispatch_started":
      text = p.command ? `Dispatched: ${p.command}` : "Dispatch started";
      break;
    case "log_line":
      text = p.line ?? "…";
      break;
    case "budget_update":
      text =
        p.override === true
          ? "Budget override approved"
          : `Spend updated — $${(p.spent_usd ?? 0).toFixed(3)} of $${(p.cap_usd ?? 0).toFixed(2)}`;
      break;
    case "circuit_breaker_triggered":
      text = "Budget cap reached — dispatch paused";
      break;
    case "handoff_emitted": {
      const decisions = Array.isArray(p.decisions) ? p.decisions.length : 0;
      const files = Array.isArray(p.files_touched) ? p.files_touched.length : 0;
      text = `Handoff recorded — ${decisions} decision(s), ${files} file(s) touched`;
      break;
    }
    case "authorization_denied":
      text = p.detail ?? "Action blocked by workspace role";
      break;
    case "task_completed":
      text =
        p.status === "stopped"
          ? "Task stopped"
          : p.summary ?? "Task completed";
      break;
    case "error": {
      const message = p.message ?? "Error";
      text = typeof p.status !== "undefined" ? `${message} (${p.status})` : message;
      break;
    }
    default:
      text = JSON.stringify(p);
  }

  if (p.simulated === true) {
    text = `${text} (simulated)`;
  }
  return text;
}
