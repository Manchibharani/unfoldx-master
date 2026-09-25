"use client";

import { useState, type FormEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  AGENT_PROVIDERS,
  PROVIDER_ACCENT,
  PROVIDER_LABEL,
  type ActivityKind,
  type AgentState,
  type AgentStatus,
  type SubtaskState,
  type SubtaskStatus,
} from "@/lib/graph";
import type { ControlAction } from "@/lib/useOrchestration";
import type { Permissions } from "@/lib/permissions";
import type { Provider } from "@/lib/types";
import { FileChips } from "../FileChips";
import { NodeAttachments } from "./NodeAttachments";
import { ProviderLogo } from "../ProviderLogo";

const AGENT_STATUS_STYLE: Record<AgentStatus, string> = {
  idle: "text-muted border-ink-600 bg-ink-800",
  running: "text-state-running border-state-running/40 bg-state-running/10",
  paused: "text-state-warning border-state-warning/40 bg-state-warning/10",
  stopped: "text-state-conflict border-state-conflict/40 bg-state-conflict/10",
  tripped: "text-state-conflict border-state-conflict/50 bg-state-conflict/15",
};

const SUBTASK_STATUS_STYLE: Record<SubtaskStatus, string> = {
  submitted: "text-state-orchestration border-state-orchestration/40 bg-state-orchestration/10",
  queued: "text-muted border-ink-600 bg-ink-800",
  running: "text-state-running border-state-running/40 bg-state-running/10",
  done: "text-state-running border-state-running/40 bg-state-running/10",
  blocked: "text-state-conflict border-state-conflict/40 bg-state-conflict/10",
};

const ACTIVITY_STYLE: Record<ActivityKind, string> = {
  log: "text-parchment/80",
  command: "text-state-orchestration",
  result: "text-state-running",
  prompt: "text-state-orchestration",
  route: "text-accent-blue",
  status: "text-muted",
};

function ConnectionPort({
  type,
  position,
  accent,
}: {
  type: "source" | "target";
  position: Position;
  accent: string;
}) {
  const isSource = type === "source";
  return (
    <Handle
      type={type}
      position={position}
      title={isSource ? "Drag from here to connect to another node" : "Drop a connector here"}
      className="!flex !h-3.5 !w-3.5 !items-center !justify-center !rounded-full !bg-ink-800"
      style={{
        border: `1.5px solid ${accent}`,
        boxShadow: `0 0 0 3px ${accent}18`,
        ["--tw-shadow-color" as string]: accent,
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke={accent}
        strokeWidth="1.6"
        strokeLinecap="round"
        className="pointer-events-none"
      >
        {isSource ? (
          <path d="M5 1.5v7M1.5 5h7" />
        ) : (
          <circle cx="5" cy="5" r="1.8" fill={accent} stroke="none" />
        )}
      </svg>
    </Handle>
  );
}

function clock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function BudgetBar({ spent, cap, breaker }: { spent: number; cap: number; breaker: boolean }) {
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  const color = breaker ? "#EA7568" : pct > 80 ? "#D9A441" : "#3ECFB2";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-ink-700">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function ProviderChip({ provider }: { provider: Provider }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{
        color: PROVIDER_ACCENT[provider],
        borderColor: `${PROVIDER_ACCENT[provider]}55`,
        backgroundColor: `${PROVIDER_ACCENT[provider]}12`,
      }}
    >
      <ProviderLogo provider={provider} size={12} />
      {PROVIDER_LABEL[provider]}
    </span>
  );
}

function Monitor({ activity }: { activity: AgentState["activity"] }) {
  if (activity.length === 0) {
    return (
      <div className="mt-2.5 flex h-[72px] items-center justify-center rounded-lg border border-ink-700 bg-ink-950 text-[10px] text-muted">
        no activity yet
      </div>
    );
  }
  return (
    <div className="mt-2.5 h-[72px] overflow-hidden rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-[10px] leading-[16px]">
      {activity.slice(-4).map((l) => (
        <div key={l.id} className={`truncate ${ACTIVITY_STYLE[l.kind]}`} title={l.text}>
          <span className="tabular-nums text-muted/60">{clock(l.at)} </span>
          <span className={l.kind === "log" ? "font-mono" : ""}>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

function PromptBox({
  placeholder,
  disabled,
  onSubmit,
}: {
  placeholder: string;
  disabled?: boolean;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue("");
  };
  return (
    <div className="nodrag mt-2.5">
      <form onSubmit={submit} className="flex gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[11px] text-parchment outline-none placeholder:text-muted focus:border-accent-blue/50 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled}
          className="shrink-0 rounded-lg border border-accent-indigo/40 bg-accent-indigo/10 px-2.5 py-1 text-[10px] font-semibold text-state-orchestration disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function LockedNote({ role, text }: { role: Permissions["role"]; text: string }) {
  return (
    <div className="nodrag mt-2.5 rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-2 text-[10px] text-muted/60">
      {text} <span className="text-muted">({role ?? "unknown"})</span>
    </div>
  );
}

export interface AgentNodeData {
  agent: AgentState;
  onAction: (action: ControlAction) => void;
  permissions: Permissions;
  [key: string]: unknown;
}

export function AgentNode({ data }: NodeProps) {
  const { agent, onAction, permissions } = data as unknown as AgentNodeData;
  const accent = PROVIDER_ACCENT[agent.provider];

  return (
    <div
      className="w-72 rounded-xl bg-ink-900 px-3.5 py-3"
      style={{
        border: `1px solid ${agent.active ? "#3ECFB2" : "#1A2847"}`,
        boxShadow: agent.active
          ? `0 0 0 1px #3ECFB2, 0 0 28px -6px #3ECFB260`
          : "0 6px 24px -10px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)",
      }}
    >
      <ConnectionPort type="target" position={Position.Left} accent={accent} />
      <ConnectionPort type="source" position={Position.Right} accent={accent} />

      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ProviderLogo provider={agent.provider} size={20} />
          <span className="truncate text-sm font-semibold" style={{ color: accent }}>
            {agent.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!agent.builtIn && <Pill className="border-state-orchestration/40 bg-state-orchestration/10 text-state-orchestration">added</Pill>}
          <Pill className={AGENT_STATUS_STYLE[agent.status]}>{agent.status}</Pill>
          {!agent.builtIn && (
            <button
              type="button"
              onClick={() => onAction({ kind: "remove_agent", agentId: agent.id })}
              className="nodrag ml-0.5 rounded-md px-1 py-0.5 text-xs text-muted hover:bg-state-conflict/10 hover:text-state-conflict"
              title="Remove agent"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Sub-line */}
      <div className="mt-1 text-[10px] text-muted">
        {agent.connected ? "connected" : "not connected"} · {agent.eventCount} events ·{" "}
        {agent.capabilities.slice(0, 3).join(" / ")}
      </div>

      {/* Budget */}
      <div className="mt-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[10px] tabular-nums text-muted">
          <span>
            ${agent.spentUsd.toFixed(3)} / {agent.capUsd > 0 ? `$${agent.capUsd.toFixed(2)}` : "no cap"}
          </span>
          <span>{agent.tokensUsed.toLocaleString()} tok</span>
        </div>
        <BudgetBar spent={agent.spentUsd} cap={agent.capUsd} breaker={agent.breakerTripped} />
      </div>

      <Monitor activity={agent.activity} />
      <PromptBox
        placeholder={permissions.canControl ? "Prompt this agent…" : "Prompting requires the control role"}
        disabled={!permissions.canControl}
        onSubmit={(text) => onAction({ kind: "prompt_agent", agentId: agent.id, text })}
      />
      <NodeAttachments agent={agent} disabled={!permissions.canControl} onAction={onAction} />

      <div className="nodrag mt-2.5 flex flex-wrap gap-1.5">
        {permissions.canControl ? (
          <>
            {agent.breakerTripped && permissions.canApprove && (
              <button
                type="button"
                onClick={() =>
                  onAction({
                    kind: "approve_budget",
                    provider: agent.provider,
                    additionalUsd: agent.capUsd > 0 ? agent.capUsd : 25,
                  })
                }
                className="rounded-lg border border-state-warning/50 bg-state-warning/10 px-2.5 py-1 text-[10px] font-semibold text-state-warning"
              >
                Approve override
              </button>
            )}
            {agent.status === "paused" || agent.status === "stopped" ? (
              <button
                type="button"
                onClick={() => onAction({ kind: "resume", provider: agent.provider })}
                className="rounded-lg border border-state-running/40 bg-state-running/10 px-2.5 py-1 text-[10px] font-semibold text-state-running"
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onAction({ kind: "pause", provider: agent.provider })}
                className="rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1 text-[10px] font-medium text-muted hover:text-parchment"
              >
                Pause
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onAction({ kind: "stop", provider: agent.provider, taskId: agent.activeTaskId ?? undefined })
              }
              className="rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1 text-[10px] font-medium text-muted hover:border-state-conflict/30 hover:text-state-conflict"
            >
              Stop
            </button>
          </>
        ) : (
          <LockedNote role={permissions.role} text="Agent controls require the control role" />
        )}
      </div>
    </div>
  );
}

export interface HubNodeData {
  agent: AgentState;
  subtaskCount: number;
  onAction: (action: ControlAction) => void;
  permissions: Permissions;
  [key: string]: unknown;
}

export function HubNode({ data }: NodeProps) {
  const { agent, subtaskCount, onAction, permissions } = data as unknown as HubNodeData;
  const accent = PROVIDER_ACCENT.bob;

  return (
    <div
      className="w-72 rounded-xl bg-ink-900 px-4 py-3"
      style={{
        border: `1px solid ${agent.active ? "#3ECFB2" : "#243357"}`,
        boxShadow: agent.active
          ? `0 0 0 1px #3ECFB2, 0 0 36px -8px #3ECFB260`
          : "0 8px 28px -12px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05)",
      }}
    >
      <ConnectionPort type="target" position={Position.Left} accent={accent} />
      <ConnectionPort type="source" position={Position.Right} accent={accent} />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ProviderLogo provider="bob" size={22} />
          <div>
            <div className="text-sm font-bold" style={{ color: accent }}>
              {agent.label}
            </div>
            <div className="text-[10px] text-state-orchestration/70">orchestrator · routing</div>
          </div>
        </div>
        <Pill className={agent.active ? AGENT_STATUS_STYLE.running : AGENT_STATUS_STYLE.idle}>
          {agent.active ? "decomposing" : "watching"}
        </Pill>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-2">
          <div className="text-base font-semibold tabular-nums text-parchment">{subtaskCount}</div>
          <div className="text-[9px] text-muted">subtasks</div>
        </div>
        <div className="rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-2">
          <div className="text-base font-semibold tabular-nums text-parchment">{agent.eventCount}</div>
          <div className="text-[9px] text-muted">events</div>
        </div>
      </div>

      <Monitor activity={agent.activity} />
      <PromptBox
        placeholder={permissions.canControl ? "Command Bob — routes to best agent…" : "Commanding Bob requires the control role"}
        disabled={!permissions.canControl}
        onSubmit={(text) => onAction({ kind: "submit_task", summary: text })}
      />
      <NodeAttachments agent={agent} disabled={!permissions.canControl} onAction={onAction} />
    </div>
  );
}

export interface SubtaskNodeData {
  subtask: SubtaskState;
  onAction: (action: ControlAction) => void;
  permissions: Permissions;
  [key: string]: unknown;
}

export function SubtaskNode({ data }: NodeProps) {
  const { subtask, onAction, permissions } = data as unknown as SubtaskNodeData;
  const editable =
    subtask.status === "submitted" || subtask.status === "queued" || subtask.status === "running";

  return (
    <div
      className="w-64 rounded-xl bg-ink-900 px-3 py-2.5"
      style={{
        border: `1px solid ${subtask.conflict ? "#EA7568" : "#1A2847"}`,
        boxShadow: subtask.conflict
          ? "0 0 0 1px #EA756840, 0 4px 16px -6px rgba(234,117,104,0.3)"
          : "0 4px 16px -8px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)",
      }}
    >
      <ConnectionPort type="target" position={Position.Left} accent="#7C6EE8" />
      <ConnectionPort type="source" position={Position.Right} accent="#7C6EE8" />

      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium leading-snug text-parchment">{subtask.label}</p>
        <Pill className={SUBTASK_STATUS_STYLE[subtask.status]}>{subtask.status}</Pill>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {subtask.provider ? (
          <ProviderChip provider={subtask.provider} />
        ) : (
          <span className="text-[10px] text-muted/70">awaiting routing</span>
        )}
        {subtask.conflict && (
          <Pill className="border-state-conflict/50 bg-state-conflict/15 text-state-conflict">conflict</Pill>
        )}
        {subtask.filesTouched > 0 && (
          <span className="text-[10px] tabular-nums text-muted">{subtask.filesTouched} files</span>
        )}
      </div>

      <FileChips files={subtask.files} className="nodrag mt-2" />

      {subtask.routeReason && (
        <p className="mt-1.5 border-l-2 border-state-orchestration/40 pl-2 text-[10px] leading-snug text-muted">
          {subtask.routeReason}
        </p>
      )}

      {editable && (
        <div className="nodrag mt-2 flex items-center gap-1.5">
          <span className="text-[10px] text-muted/70">Redirect</span>
          <select
            disabled={!permissions.canControl}
            value={subtask.provider ?? ""}
            onChange={(e) =>
              onAction({
                kind: "redirect",
                subtaskId: subtask.id,
                taskId: subtask.taskId,
                target: e.target.value as Provider,
              })
            }
            className="flex-1 rounded-lg border border-ink-600 bg-ink-800 px-1.5 py-1 text-[10px] text-parchment outline-none focus:border-accent-blue/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{permissions.canControl ? "pick agent…" : "redirect needs control role"}</option>
            <option value="bob">{PROVIDER_LABEL.bob}</option>
            {AGENT_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
