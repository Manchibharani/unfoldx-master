"use client";

import type { WorkspaceEvent } from "@/lib/types";
import { summarize } from "@/lib/eventSummary";
import { ProviderBadge } from "./ProviderBadge";

const EMPHASIZED: Set<WorkspaceEvent["event_type"]> = new Set([
  "conflict_detected",
  "circuit_breaker_triggered",
  "authorization_denied",
  "error",
]);

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

export function EventRow({ event, isLast }: { event: WorkspaceEvent; isLast: boolean }) {
  const flagged = EMPHASIZED.has(event.event_type);

  return (
    <div className="-mx-2 flex gap-3 rounded-sm px-2">
      {/* The chain: each entry's hash visually links to the next, since the
          provenance log is the point, not decoration. */}
      <div className="flex flex-col items-center">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${flagged ? "bg-state-conflict" : "bg-state-orchestration"}`} />
        {!isLast && <span className="w-px flex-1 bg-ink-700" />}
      </div>

      <div className={`min-w-0 flex-1 pb-4 ${isLast ? "" : ""}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="tabular-nums">{formatTime(event.ts)}</span>
          <ProviderBadge provider={event.provider} />
          <span className="text-muted/70">{event.event_type.replace(/_/g, " ")}</span>
          {typeof event.cost_delta === "number" && (
            <span className="tabular-nums text-state-running">+${event.cost_delta.toFixed(3)}</span>
          )}
          <span className="ml-auto font-mono text-state-inactive" title={`hash ${event.hash}`}>
            {event.hash.slice(0, 8)}
          </span>
        </div>
        <p className={`mt-0.5 text-sm ${flagged ? "text-state-conflict" : "text-parchment"}`}>
          {summarize(event)}
        </p>
      </div>
    </div>
  );
}
