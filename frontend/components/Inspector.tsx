"use client";

import { useMemo, useState } from "react";
import type { AgentState, HubSelection, SubtaskState } from "@/lib/graph";
import { PROVIDER_ACCENT, PROVIDER_LABEL } from "@/lib/graph";
import type { WorkspaceEvent } from "@/lib/types";
import { summarize } from "@/lib/eventSummary";
import { FilesPanel } from "./FilesPanel";
import { LivePreview } from "./LivePreview";
import { OutputPanel } from "./OutputPanel";
import { ProviderLogo } from "./ProviderLogo";

type InspectorTab = "output" | "files" | "preview" | "activity";

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "output", label: "Output" },
  { id: "files", label: "Files" },
  { id: "preview", label: "Preview" },
  { id: "activity", label: "Activity" },
];

function timeOf(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour12: false });
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function ContextSummary({
  agent,
  subtask,
  events,
}: {
  agent: AgentState | undefined;
  subtask: SubtaskState | undefined;
  events: WorkspaceEvent[];
}) {
  if (agent) {
    const accent = PROVIDER_ACCENT[agent.provider];
    return (
      <div className="mb-4 border-b border-ink-700 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <ProviderLogo provider={agent.provider} size={22} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: accent }}>{agent.label}</p>
              <p className="text-[10px] text-muted">{PROVIDER_LABEL[agent.provider]} · {agent.connected ? "Connected" : "Offline"}</p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
              agent.active
                ? "border-state-running/40 bg-state-running/10 text-state-running"
                : "border-ink-600 bg-ink-800 text-muted"
            }`}
          >
            {agent.active ? "working" : agent.status}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg px-2.5 py-2 text-center">
            <p className="text-sm font-semibold tabular-nums text-parchment">${agent.spentUsd.toFixed(3)}</p>
            <p className="text-[9px] text-muted">spent</p>
          </div>
          <div className="rounded-lg border-l border-ink-700 px-2.5 py-2 text-center">
            <p className="text-sm font-semibold tabular-nums text-parchment">{agent.tokensUsed.toLocaleString()}</p>
            <p className="text-[9px] text-muted">tokens</p>
          </div>
        </div>
        {agent.capabilities.length > 0 && (
          <p className="mt-2.5 text-[10px] text-muted/70">{agent.capabilities.join(" · ")}</p>
        )}
      </div>
    );
  }

  if (!subtask) {
    return (
      <div className="mb-4 border-b border-ink-700 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-indigo/20 to-accent-blue/20">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3L3 8v8l9 5 9-5V8L12 3Z" stroke="#7C6EE8" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-parchment">Workspace Inspector</h2>
            <p className="text-[10px] text-muted">{events.length} events in view</p>
          </div>
        </div>
      </div>
    );
  }

  const conflict = [...events].reverse().find((event) => event.event_type === "conflict_detected");
  const handoff = [...events].reverse().find((event) => event.event_type === "handoff_emitted");
  const conflictDetail = conflict ? stringValue(conflict.payload.detail) : null;
  const conflictPaths = conflict ? stringList(conflict.payload.paths) : [];
  const handoffDecisions = handoff ? stringList(handoff.payload.decisions) : [];
  const handoffConstraints = handoff ? stringList(handoff.payload.constraints) : [];

  return (
    <div className="mb-4 border-b border-ink-700 pb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-parchment">{subtask.label}</h2>
          <p className="mt-0.5 text-[10px] text-muted"><span className="font-mono">{subtask.id}</span> · {subtask.status}</p>
        </div>
        {subtask.provider && (
          <span className="shrink-0 text-[10px] font-medium" style={{ color: PROVIDER_ACCENT[subtask.provider] }}>
            {PROVIDER_LABEL[subtask.provider]}
          </span>
        )}
      </div>
      {subtask.routeReason && (
        <p className="mt-2 border-l-2 border-state-orchestration/50 pl-2.5 text-[10px] leading-relaxed text-muted">
          {subtask.routeReason}
        </p>
      )}
      {subtask.conflict && (
        <div className="mt-2.5 border-l-2 border-state-conflict/40 bg-state-conflict/[0.06] px-3 py-2 text-[10px] text-state-conflict">
          <p className="font-semibold uppercase tracking-wide">Conflict detected</p>
          <p className="mt-1 text-parchment/80">{conflictDetail ?? "This route overlapped with in-flight work."}</p>
          {conflictPaths.length > 0 && <p className="mt-1 font-mono">{conflictPaths.join(" · ")}</p>}
        </div>
      )}
      {handoff && (
        <div className="mt-2.5 border-l-2 border-state-running/30 px-3 py-2 text-[10px]">
          <p className="font-semibold uppercase tracking-wide text-state-running">Handoff recorded</p>
          <p className="mt-1 text-muted/80">{handoffDecisions.length} decisions · {handoffConstraints.length} constraints · {subtask.filesTouched} files touched</p>
          {handoffDecisions.length > 0 && <p className="mt-1 text-parchment/80">{handoffDecisions.slice(0, 2).join(" · ")}</p>}
        </div>
      )}
    </div>
  );
}

export function Inspector({
  agents,
  selection,
  subtasks,
  events,
  workspaceId,
}: {
  agents: AgentState[];
  selection: HubSelection;
  subtasks: SubtaskState[];
  events: WorkspaceEvent[];
  workspaceId: string;
}) {
  const [tab, setTab] = useState<InspectorTab>("output");
  const agent = selection?.kind === "agent"
    ? selection.id === "hub-bob" ? agents.find((item) => item.provider === "bob") : agents.find((item) => item.id === selection.id)
    : undefined;
  const subtask = selection?.kind === "subtask" ? subtasks.find((item) => item.id === selection.id) : undefined;
  const relevantEvents = useMemo(() => {
    if (agent) return events.filter((event) => event.provider === agent.provider || event.agent_id === agent.id);
    if (subtask) return events.filter((event) => event.task_id === subtask.taskId && (!event.subtask_id || event.subtask_id === subtask.id));
    return events;
  }, [agent, events, subtask]);

  return (
    <aside className="min-w-0 overflow-hidden rounded-xl bg-ink-900 xl:sticky xl:top-4 xl:flex xl:h-[calc(100vh-2rem)] xl:flex-col">
      <div className="p-4 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
        <ContextSummary agent={agent} subtask={subtask} events={relevantEvents} />

        {/* Tab bar */}
        <div role="tablist" aria-label="Inspector views" className="mb-4 grid shrink-0 grid-cols-4 gap-1 rounded-lg bg-ink-800 p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-md px-1 py-1.5 text-[10px] font-medium transition-colors ${
                tab === item.id
                  ? "bg-ink-700 text-parchment shadow-sm"
                  : "text-muted hover:text-parchment"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="min-h-48 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          {tab === "output" && <OutputPanel events={relevantEvents} />}
          {tab === "files" && <FilesPanel events={relevantEvents} />}
          {tab === "preview" && <LivePreview workspaceId={workspaceId} />}
          {tab === "activity" && (
            <section>
              <h3 className="mb-2.5 text-[11px] font-medium uppercase tracking-widest text-state-info">Recent activity</h3>
              {relevantEvents.length === 0 ? (
                <p className="px-4 py-5 text-center text-[10px] text-muted/60">
                  No activity for this selection yet.
                </p>
              ) : (
                <ol>
                  {[...relevantEvents].reverse().slice(0, 100).map((event) => (
                    <li key={event.id} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 border-b border-ink-700/60 py-2.5 last:border-0">
                      <time className="text-[9px] tabular-nums text-muted/60">{timeOf(event.ts)}</time>
                      <div className="min-w-0">
                        <p className="text-[9px] uppercase tracking-wide text-muted/50">{event.event_type.replace(/_/g, " ")}</p>
                        <p className="break-words text-[10px] leading-relaxed text-parchment/80">{summarize(event)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}
