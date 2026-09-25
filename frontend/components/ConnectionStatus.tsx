import type { ConnectionState } from "@/lib/types";

const COPY: Record<ConnectionState, string> = {
  connecting: "Connecting",
  connected: "Live",
  reconnecting: "Reconnecting",
  offline: "Offline",
  mock: "Demo feed",
};

// Dot color per state
const DOT: Record<ConnectionState, string> = {
  connecting: "bg-state-warning",
  connected: "bg-state-running animate-pulse",
  reconnecting: "bg-state-warning",
  offline: "bg-state-inactive",
  mock: "bg-state-orchestration",
};

// Chip style per state (border + bg)
const CHIP: Record<ConnectionState, string> = {
  connecting: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  connected: "border-state-running/30 bg-state-running/10 text-state-running",
  reconnecting: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  offline: "border-ink-600 bg-ink-800 text-muted",
  mock: "border-state-orchestration/30 bg-state-orchestration/10 text-state-orchestration",
};

export function ConnectionStatus({ state }: { state: ConnectionState }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CHIP[state]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[state]}`} />
      {COPY[state]}
    </div>
  );
}
