"use client";

import { useState } from "react";
import type { AgentState, HubSelection } from "@/lib/graph";
import { PROVIDER_ACCENT, PROVIDER_LABEL } from "@/lib/graph";
import type { Provider } from "@/lib/types";
import type { ControlAction } from "@/lib/useOrchestration";
import type { Permissions } from "@/lib/permissions";

const ADDABLE_PROVIDERS: Provider[] = ["bob", "claude_code", "codex", "gemini"];

function statusOf(agent: AgentState): { label: string; dot: string } {
  if (agent.breakerTripped || agent.status === "tripped" || agent.status === "stopped") {
    return { label: agent.breakerTripped ? "budget stopped" : "stopped", dot: "bg-state-conflict" };
  }
  if (agent.status === "paused") return { label: "paused", dot: "bg-state-warning" };
  if (agent.active) return { label: "working", dot: "bg-state-running" };
  if (agent.connected) return { label: "ready", dot: "bg-state-running" };
  return { label: "offline", dot: "bg-state-inactive" };
}

export function AgentRail({
  agents,
  selection,
  permissions,
  demoEnabled,
  onSelect,
  onAction,
}: {
  agents: AgentState[];
  selection: HubSelection;
  permissions: Permissions;
  demoEnabled: boolean;
  onSelect: (selection: HubSelection) => void;
  onAction: (action: ControlAction) => void;
}) {
  const [provider, setProvider] = useState<Provider>("claude_code");

  return (
    <aside className="min-w-0 rounded-lg border border-ink-700 bg-ink-900/70 p-3">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Agents</h2>
        <span className="text-[10px] tabular-nums text-state-inactive">{agents.length}</span>
      </div>

      <ul className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
        {agents.map((agent) => {
          const status = statusOf(agent);
          const isSelected = selection?.kind === "agent" && selection.id === agent.id;
          return (
            <li key={agent.id} className="flex min-w-[190px] items-stretch gap-1 xl:min-w-0">
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect({ kind: "agent", id: agent.id })}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm border px-2.5 py-2 text-left ${isSelected ? "border-state-orchestration/50 bg-ink-800" : "border-transparent hover:border-ink-600 hover:bg-ink-800/70"}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium" style={{ color: PROVIDER_ACCENT[agent.provider] }}>
                    {agent.label}
                  </span>
                  <span className="block truncate text-[10px] text-state-inactive">{status.label}</span>
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-state-inactive">{agent.eventCount}</span>
              </button>
              {!agent.builtIn && permissions.canControl && (
                <button
                  type="button"
                  title={`Remove ${agent.label}`}
                  aria-label={`Remove ${agent.label}`}
                  onClick={() => onAction({ kind: "remove_agent", agentId: agent.id })}
                  className="rounded-sm px-2 text-xs text-state-inactive hover:bg-ink-800 hover:text-state-conflict"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 border-t border-ink-700 pt-3">
        <button
          type="button"
          disabled={!demoEnabled}
          onClick={() => onAction({ kind: "submit_task", summary: "Build a login API with FastAPI and a React dashboard, then add tests" })}
          title={demoEnabled ? "Submit the seeded judge scenario to the live backend" : "Requires control access and a connected live event stream"}
          className="w-full rounded-sm border border-state-orchestration/50 bg-state-orchestration/10 px-2.5 py-2 text-left text-xs font-semibold text-state-orchestration disabled:cursor-not-allowed disabled:opacity-50"
        >
          Run seeded demo
          <span className="mt-0.5 block text-[10px] font-normal text-state-inactive">Plan · Route · Execute · Verify</span>
        </button>
      </div>

      <div className="mt-3 flex gap-1.5 border-t border-ink-700 pt-3">
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value as Provider)}
          disabled={!permissions.canControl}
          aria-label="Provider to add"
          className="min-w-0 flex-1 rounded-sm border border-ink-600 bg-ink-950 px-2 py-1.5 text-[10px] text-parchment outline-none focus:border-state-orchestration/60 disabled:opacity-50"
        >
          {ADDABLE_PROVIDERS.map((item) => <option key={item} value={item}>{PROVIDER_LABEL[item]}</option>)}
        </select>
        <button
          type="button"
          disabled={!permissions.canControl}
          onClick={() => onAction({ kind: "add_agent", provider })}
          className="rounded-sm border border-ink-600 px-2 text-xs text-state-inactive hover:border-state-running/40 hover:text-state-running disabled:opacity-40"
          title="Add agent"
        >
          +
        </button>
      </div>
    </aside>
  );
}