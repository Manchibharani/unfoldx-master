"use client";

import { useState } from "react";
import type { AgentState, HubSelection } from "@/lib/graph";
import { PROVIDER_ACCENT, PROVIDER_LABEL } from "@/lib/graph";
import type { Provider } from "@/lib/types";
import type { ControlAction } from "@/lib/useOrchestration";
import type { Permissions } from "@/lib/permissions";
import { ProviderLogo } from "./ProviderLogo";

const ADDABLE_PROVIDERS: Provider[] = ["bob", "claude_code", "codex", "gemini"];

function statusOf(agent: AgentState): { label: string; dot: string } {
  if (agent.breakerTripped || agent.status === "tripped" || agent.status === "stopped") {
    return { label: agent.breakerTripped ? "budget stopped" : "stopped", dot: "bg-state-conflict" };
  }
  if (agent.status === "paused") return { label: "paused", dot: "bg-state-warning" };
  if (agent.active) return { label: "working", dot: "bg-state-running animate-pulse" };
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
    <aside className="min-w-0 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-state-info">Agents</h2>
        <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] tabular-nums text-muted">{agents.length}</span>
      </div>

      {/* Agent list */}
      <ul className="flex gap-2 overflow-x-auto p-3 xl:flex-col xl:overflow-visible xl:p-3">
        {agents.map((agent) => {
          const status = statusOf(agent);
          const isSelected = selection?.kind === "agent" && selection.id === agent.id;
          const accent = PROVIDER_ACCENT[agent.provider];
          return (
            <li key={agent.id} className="flex min-w-[200px] items-stretch gap-1 xl:min-w-0">
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect({ kind: "agent", id: agent.id })}
                className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ${
                  isSelected
                    ? "border-accent-blue/40 bg-ink-800 shadow-[0_0_0_1px_rgba(59,142,232,0.2)]"
                    : "border-ink-700 bg-ink-800/50 hover:border-ink-600 hover:bg-ink-800"
                }`}
              >
                {/* Provider logo */}
                <span className="shrink-0">
                  <ProviderLogo provider={agent.provider} size={26} />
                </span>

                {/* Name + status */}
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-xs font-semibold"
                    style={{ color: accent }}
                  >
                    {agent.label}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                </span>

                {/* Event count badge */}
                <span className="shrink-0 rounded-full bg-ink-700 px-1.5 py-0.5 text-[10px] tabular-nums text-muted">
                  {agent.eventCount}
                </span>
              </button>

              {!agent.builtIn && permissions.canControl && (
                <button
                  type="button"
                  title={`Remove ${agent.label}`}
                  aria-label={`Remove ${agent.label}`}
                  onClick={() => onAction({ kind: "remove_agent", agentId: agent.id })}
                  className="flex items-center justify-center rounded-lg border border-transparent px-2 text-sm text-muted transition-colors hover:border-state-conflict/30 hover:bg-state-conflict/10 hover:text-state-conflict"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Demo button */}
      <div className="px-3 pb-3">
        <button
          type="button"
          disabled={!demoEnabled}
          onClick={() => onAction({ kind: "submit_task", summary: "Build a login API with FastAPI and a React dashboard, then add tests" })}
          title={demoEnabled ? "Submit the seeded judge scenario to the live backend" : "Requires control access and a connected live event stream"}
          className="w-full rounded-lg border border-accent-indigo/30 bg-gradient-to-r from-accent-indigo/10 to-accent-blue/10 px-3 py-2.5 text-left text-xs font-semibold text-state-orchestration transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          Run seeded demo
          <span className="mt-0.5 block text-[10px] font-normal text-muted">Plan · Route · Execute · Verify</span>
        </button>
      </div>

      {/* Add agent row */}
      <div className="flex gap-1.5 border-t border-ink-700 px-3 py-3">
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value as Provider)}
          disabled={!permissions.canControl}
          aria-label="Provider to add"
          className="min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-2 text-[11px] text-parchment outline-none focus:border-accent-blue/50 disabled:opacity-50"
        >
          {ADDABLE_PROVIDERS.map((item) => <option key={item} value={item}>{PROVIDER_LABEL[item]}</option>)}
        </select>
        <button
          type="button"
          disabled={!permissions.canControl}
          onClick={() => onAction({ kind: "add_agent", provider })}
          className="rounded-lg border border-ink-600 px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-accent-blue/40 hover:bg-accent-blue/10 hover:text-state-info disabled:opacity-40"
          title="Add agent"
        >
          +
        </button>
      </div>
    </aside>
  );
}
