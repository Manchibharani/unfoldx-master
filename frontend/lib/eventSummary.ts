import type { WorkspaceEvent } from "./types";

function stringField(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : fallback;
}

/**
 * Turns a raw payload into one plain-language line. Falls back to a
 * compact JSON preview for event types this hasn't been taught yet,
 * so an unrecognized backend payload still renders instead of breaking.
 */
export function summarize(event: WorkspaceEvent): string {
  const p = event.payload;
  let text: string;
  switch (event.event_type) {
    case "provider_connected":
      text = stringField(p, "detail", `${stringField(p, "provider", event.provider)} connected`);
      break;
    case "task_submitted":
      text = stringField(p, "summary", "Task submitted");
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
      text = stringField(p, "detail", "Conflict detected against another in-flight subtask");
      break;
    case "dispatch_started":
      text = typeof p.command === "string" ? `Dispatched: ${p.command}` : "Dispatch started";
      break;
    case "log_line":
      text = stringField(p, "line", "…");
      break;
    case "budget_update":
      text =
        p.override === true
          ? "Budget override approved"
          : `Spend updated — $${(typeof p.spent_usd === "number" ? p.spent_usd : 0).toFixed(3)} of $${(typeof p.cap_usd === "number" ? p.cap_usd : 0).toFixed(2)}`;
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
    case "agent_output": {
      const raw = typeof p.text === "string" ? p.text.trim() : "";
      const first = raw.split("\n")[0] ?? "";
      text = first ? (first.length > 140 ? `${first.slice(0, 140)}…` : first) : "Agent output received";
      break;
    }
    case "authorization_denied":
      text = stringField(p, "detail", "Action blocked by workspace role");
      break;
    case "task_completed":
      text =
        p.status === "stopped"
          ? "Task stopped"
          : stringField(p, "summary", "Task completed");
      break;
    case "error": {
      const message = stringField(p, "message", "Error");
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
