"use client";

import { motion, useReducedMotion } from "motion/react";
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
  const reduceMotion = useReducedMotion();
  const flagged = EMPHASIZED.has(event.event_type);
  // A brief tint that fades out as the row settles: gold for routine events,
  // coral for the ones worth noticing (errors, conflicts, denials).
  const flash = flagged ? "rgba(226, 104, 90, 0.22)" : "rgba(217, 164, 65, 0.14)";

  return (
    <motion.div
      className="-mx-2 flex gap-3 rounded-sm px-2"
      initial={reduceMotion ? false : { opacity: 0, x: -18, backgroundColor: flash }}
      animate={reduceMotion ? undefined : { opacity: 1, x: 0, backgroundColor: "rgba(0, 0, 0, 0)" }}
      transition={{
        duration: 0.4,
        ease: "easeOut",
        backgroundColor: { duration: 1.2, ease: "easeOut" },
      }}
    >
      {/* The chain: each entry's hash visually links to the next, since the
          provenance log is the point, not decoration. */}
      <div className="flex flex-col items-center">
        <motion.span
          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
            flagged ? "bg-ledger-coral" : "bg-ledger-gold"
          }`}
          initial={reduceMotion ? false : { scale: 0.2, opacity: 0 }}
          animate={reduceMotion ? undefined : { scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 480, damping: 20 }}
        />
        {!isLast && <span className="w-px flex-1 bg-ink-700" />}
      </div>

      <div className={`min-w-0 flex-1 pb-4 ${isLast ? "" : ""}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-mono">{formatTime(event.ts)}</span>
          <ProviderBadge provider={event.provider} />
          <span className="text-muted/70">{event.event_type.replace(/_/g, " ")}</span>
          {typeof event.cost_delta === "number" && (
            <span className="font-mono text-ledger-teal">+${event.cost_delta.toFixed(3)}</span>
          )}
          <span className="ml-auto font-mono text-muted/50" title={`hash ${event.hash}`}>
            {event.hash.slice(0, 8)}
          </span>
        </div>
        <p className={`mt-0.5 text-sm ${flagged ? "text-ledger-coral" : "text-parchment"}`}>
          {summarize(event)}
        </p>
      </div>
    </motion.div>
  );
}
