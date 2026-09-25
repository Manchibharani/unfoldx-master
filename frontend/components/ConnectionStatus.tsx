import type { ConnectionState } from "@/lib/types";

const COPY: Record<ConnectionState, string> = {
  connecting: "Connecting",
  connected: "Live",
  reconnecting: "Reconnecting",
  offline: "Offline",
  mock: "Demo feed (no backend connected)",
};

const DOT: Record<ConnectionState, string> = {
  connecting: "bg-state-warning",
  connected: "bg-state-running",
  reconnecting: "bg-state-warning",
  offline: "bg-state-inactive",
  mock: "bg-state-orchestration",
};

export function ConnectionStatus({ state }: { state: ConnectionState }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className={`h-2 w-2 rounded-full ${DOT[state]}`} />
      {COPY[state]}
    </div>
  );
}
