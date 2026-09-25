"use client";

import { useMemo, useState } from "react";
import type { AgentState, HubSelection, SubtaskState } from "@/lib/graph";
import { PROVIDER_ACCENT, PROVIDER_LABEL } from "@/lib/graph";
import type { WorkspaceEvent } from "@/lib/types";
import { summarize } from "@/lib/eventSummary";
import { FilesPanel } from "./FilesPanel";
import { LivePreview } from "./LivePreview";
import { OutputPanel } from "./OutputPanel";

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
    return (
      <div className="mb-3 border-b border-ink-700 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" style={{ color: PROVIDER_ACCENT[agent.provider] }}>{agent.label}</p>
            <p className="text-[10px] text-state-inactive">{PROVIDER_LABEL[agent.provider]} · {agent.connected ? "connected" : "offline"}</p>
          </div>
          <span className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-medium uppercase ${agent.active ? "border-state-running/40 bg-state-running/10 text-state-running" : "border-ink-600 text-state-inactive"}`}>
            {agent.active ? "working" : agent.status}
          </span>
        </div>
        <div className="mt-2 flex gap-4 text-[10px] text-state-inactive">
          <span className="tabular-nums">${agent.spentUsd.toFixed(3)} spent</span>
          <span className="tabular-nums">{agent.tokensUsed.toLocaleString()} tokens</span>
        </div>
        {agent.capabilities.length > 0 && <p className="mt-2 text-[10px] text-muted/60">{agent.capabilities.join(" · ")}</p>}
      </div>
    );
  }

  if (!subtask) {
    return (
      <div className="mb-3 border-b border-ink-700 pb-3">
        <h2 className="text-sm font-semibold text-parchment">Workspace inspector</h2>
        <p className="mt-1 text-[10px] text-muted/60">{events.length} events in the current workspace view</p>
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
    <div className="mb-3 border-b border-ink-700 pb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-parchment">{subtask.label}</h2>
          <p className="mt-1 text-[10px] text-state-inactive"><span className="font-mono">{subtask.id}</span> · {subtask.status}</p>
        </div>
        {subtask.provider && <span className="shrink-0 text-[10px]" style={{ color: PROVIDER_ACCENT[subtask.provider] }}>{PROVIDER_LABEL[subtask.provider]}</span>}
      </div>
      {subtask.routeReason && <p className="mt-2 border-l border-state-orchestration/50 pl-2 text-[10px] leading-relaxed text-muted">{subtask.routeReason}</p>}
      {subtask.conflict && (
        <div className="mt-2 rounded-sm border border-state-conflict/40 bg-state-conflict/10 px-2.5 py-2 text-[10px] text-state-conflict">
          <p className="font-semibold uppercase tracking-wide">Conflict detected</p>
          <p className="mt-1 text-parchment/80">{conflictDetail ?? "This route overlapped with in-flight work."}</p>
          {conflictPaths.length > 0 && <p className="mt-1 font-mono">{conflictPaths.join(" · ")}</p>}
        </div>
      )}
      {handoff && (
        <div className="mt-2 rounded-sm border border-state-running/30 bg-state-running/5 px-2.5 py-2 text-[10px]">
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
}: {
  agents: AgentState[];
  selection: HubSelection;
  subtasks: SubtaskState[];
  events: WorkspaceEvent[];
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
    <aside className="min-w-0 rounded-lg border border-ink-700 bg-ink-900/70 p-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
      <ContextSummary agent={agent} subtask={subtask} events={relevantEvents} />
      <div role="tablist" aria-label="Inspector views" className="mb-3 grid grid-cols-4 border-b border-ink-700">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`border-b-2 px-1 py-2 text-[10px] font-medium ${tab === item.id ? "border-state-orchestration text-state-orchestration" : "border-transparent text-muted hover:text-parchment"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="min-h-48">
        {tab === "output" && <OutputPanel events={relevantEvents} />}
        {tab === "files" && <FilesPanel events={relevantEvents} />}
        {tab === "preview" && <LivePreview />}
        {tab === "activity" && (
          <section>
            <h3 className="mb-2 text-xs font-medium text-muted">Recent activity</h3>
            {relevantEvents.length === 0 ? (
              <p className="rounded-sm border border-dashed border-ink-700 px-3 py-4 text-[10px] text-muted/60">No activity for this selection yet.</p>
            ) : (
              <ol className="max-h-[58vh] overflow-y-auto">
                {[...relevantEvents].reverse().slice(0, 100).map((event) => (
                  <li key={event.id} className="grid grid-cols-[42px_minmax(0,1fr)] gap-2 border-b border-ink-700/70 py-2 last:border-0">
                    <time className="text-[9px] tabular-nums text-state-inactive">{timeOf(event.ts)}</time>
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-wide text-muted/60">{event.event_type.replace(/_/g, " ")}</p>
                      <p className="break-words text-[10px] leading-relaxed text-parchment/80">{summarize(event)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}