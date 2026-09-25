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

const AGENT_STATUS_STYLE: Record<AgentStatus, string> = {
  idle: "text-muted border-muted/30 bg-muted/10",
  running: "text-ledger-teal border-ledger-teal/40 bg-ledger-teal/10",
  paused: "text-ledger-gold border-ledger-gold/40 bg-ledger-gold/10",
  stopped: "text-ledger-coral border-ledger-coral/40 bg-ledger-coral/10",
  tripped: "text-ledger-coral border-ledger-coral/50 bg-ledger-coral/15",
};

const SUBTASK_STATUS_STYLE: Record<SubtaskStatus, string> = {
  submitted: "text-ledger-violet border-ledger-violet/40 bg-ledger-violet/10",
  queued: "text-muted border-muted/30 bg-muted/10",
  running: "text-ledger-teal border-ledger-teal/40 bg-ledger-teal/10",
  done: "text-ledger-gold border-ledger-gold/40 bg-ledger-gold/10",
  blocked: "text-ledger-coral border-ledger-coral/40 bg-ledger-coral/10",
};

const ACTIVITY_STYLE: Record<ActivityKind, string> = {
  log: "text-parchment/80",
  command: "text-ledger-violet",
  result: "text-ledger-teal",
  prompt: "text-ledger-gold",
  route: "text-ledger-gold/90",
  status: "text-ledger-coral",
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
      className="!flex !h-3.5 !w-3.5 !items-center !justify-center !rounded-full !bg-ink-900 !transition-all hover:!h-5 hover:!w-5 hover:!shadow-[0_0_10px_-1px]"
      style={{
        border: `1.5px solid ${accent}`,
        boxShadow: `0 0 0 4px ${accent}1f`,
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
    <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function BudgetBar({ spent, cap, breaker }: { spent: number; cap: number; breaker: boolean }) {
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${breaker ? "bg-ledger-coral" : "bg-ledger-teal"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ProviderChip({ provider }: { provider: Provider }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        color: PROVIDER_ACCENT[provider],
        borderColor: `${PROVIDER_ACCENT[provider]}66`,
        backgroundColor: `${PROVIDER_ACCENT[provider]}1a`,
      }}
    >
      {PROVIDER_LABEL[provider]}
    </span>
  );
}

function Monitor({ activity }: { activity: AgentState["activity"] }) {
  if (activity.length === 0) {
    return (
      <div className="mt-2 flex h-[74px] items-center justify-center rounded-sm border border-ink-700 bg-ink-950 font-mono text-[10px] text-muted/50">
        no activity yet
      </div>
    );
  }
  return (
    <div className="mt-2 h-[74px] overflow-hidden rounded-sm border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-[10px] leading-[15px]">
      {activity.slice(-4).map((l) => (
        <div key={l.id} className={`truncate ${ACTIVITY_STYLE[l.kind]}`} title={l.text}>
          <span className="text-muted/40">{clock(l.at)} </span>
          {l.text}
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
    <div className="nodrag mt-2">
      <form onSubmit={submit} className="flex gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-sm border border-ink-600 bg-ink-800 px-2 py-1 text-[11px] text-parchment outline-none placeholder:text-muted/50 focus:border-ledger-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled}
          className="shrink-0 rounded-sm border border-ledger-gold/40 bg-ledger-gold/10 px-2 py-1 text-[10px] font-medium text-ledger-gold hover:bg-ledger-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function LockedNote({ role, text }: { role: Permissions["role"]; text: string }) {
  return (
    <div className="nodrag mt-2 rounded-sm border border-ink-700 bg-ink-950 px-2 py-1.5 text-[10px] text-muted/60">
      {text} <span className="font-mono uppercase text-muted/40">({role ?? "unknown"})</span>
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
      className="w-72 rounded-lg border bg-ink-900 px-3 py-2.5 shadow-lg transition-shadow"
      style={{
        borderColor: agent.active ? accent : "#1F283B",
        boxShadow: agent.active
          ? `0 0 0 1px ${accent}, 0 0 26px -6px ${accent}`
          : "0 8px 20px -14px rgba(0,0,0,0.9)",
      }}
    >
      <ConnectionPort type="target" position={Position.Left} accent={accent} />
      <ConnectionPort type="source" position={Position.Right} accent={accent} />

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: accent }}>
          {agent.label}
        </span>
        <div className="flex items-center gap-1">
          {!agent.builtIn && <Pill className="border-ledger-violet/40 bg-ledger-violet/10 text-ledger-violet">added</Pill>}
          <Pill className={AGENT_STATUS_STYLE[agent.status]}>{agent.status}</Pill>
          {!agent.builtIn && (
            <button
              type="button"
              onClick={() => onAction({ kind: "remove_agent", agentId: agent.id })}
              className="nodrag rounded-sm px-1 text-xs text-muted hover:text-ledger-coral"
              title="Remove agent"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="mt-0.5 font-mono text-[10px] text-muted/60">
        {agent.connected ? "connected" : "not connected"} · {agent.eventCount} events ·{" "}
        {agent.capabilities.slice(0, 3).join(" / ")}
      </div>

      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-muted">
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

      <div className="nodrag mt-2 flex flex-wrap gap-1.5">
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
                className="rounded-sm border border-ledger-coral/50 bg-ledger-coral/15 px-2 py-1 text-[10px] font-medium text-ledger-coral hover:bg-ledger-coral/25"
              >
                Approve override
              </button>
            )}
            {agent.status === "paused" || agent.status === "stopped" ? (
              <button
                type="button"
                onClick={() => onAction({ kind: "resume", provider: agent.provider })}
                className="rounded-sm border border-ledger-gold/40 bg-ledger-gold/10 px-2 py-1 text-[10px] font-medium text-ledger-gold hover:bg-ledger-gold/20"
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onAction({ kind: "pause", provider: agent.provider })}
                className="rounded-sm border border-ink-600 bg-ink-800 px-2 py-1 text-[10px] font-medium text-muted hover:text-parchment"
              >
                Pause
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onAction({ kind: "stop", provider: agent.provider, taskId: agent.activeTaskId ?? undefined })
              }
              className="rounded-sm border border-ink-600 bg-ink-800 px-2 py-1 text-[10px] font-medium text-muted hover:text-ledger-coral"
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
      className="w-72 rounded-xl border bg-ink-900 px-4 py-3 shadow-xl"
      style={{
        borderColor: agent.active ? accent : "#2B3651",
        boxShadow: agent.active
          ? `0 0 0 1px ${accent}, 0 0 34px -6px ${accent}`
          : "0 10px 24px -16px rgba(0,0,0,0.9)",
      }}
    >
      <ConnectionPort type="target" position={Position.Left} accent={accent} />
      <ConnectionPort type="source" position={Position.Right} accent={accent} />

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold" style={{ color: accent }}>
            {agent.label}
          </div>
          <div className="font-mono text-[10px] text-muted">orchestrator · capability routing</div>
        </div>
        <Pill className={agent.active ? AGENT_STATUS_STYLE.running : AGENT_STATUS_STYLE.idle}>
          {agent.active ? "decomposing" : "watching"}
        </Pill>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1.5">
          <div className="font-mono text-parchment">{subtaskCount}</div>
          <div className="text-muted/70">subtasks</div>
        </div>
        <div className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1.5">
          <div className="font-mono text-parchment">{agent.eventCount}</div>
          <div className="text-muted/70">events</div>
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
      className="w-64 rounded-lg border bg-ink-900 px-3 py-2 shadow-md"
      style={{ borderColor: subtask.conflict ? "#E2685A" : "#1F283B" }}
    >
      <ConnectionPort type="target" position={Position.Left} accent="#8D7BE0" />
      <ConnectionPort type="source" position={Position.Right} accent="#8D7BE0" />

      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-snug text-parchment">{subtask.label}</p>
        <Pill className={SUBTASK_STATUS_STYLE[subtask.status]}>{subtask.status}</Pill>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {subtask.provider ? (
          <ProviderChip provider={subtask.provider} />
        ) : (
          <span className="text-[10px] text-muted/70">awaiting routing</span>
        )}
        {subtask.conflict && (
          <Pill className="border-ledger-coral/50 bg-ledger-coral/15 text-ledger-coral">conflict</Pill>
        )}
        {subtask.filesTouched > 0 && (
          <span className="font-mono text-[10px] text-muted/70">{subtask.filesTouched} files</span>
        )}
      </div>

      <FileChips files={subtask.files} className="nodrag mt-2" />

      {subtask.routeReason && (
        <p className="mt-1.5 border-l border-ledger-gold/30 pl-2 text-[10px] leading-snug text-muted">
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
            className="flex-1 rounded-sm border border-ink-600 bg-ink-800 px-1.5 py-1 text-[10px] text-parchment outline-none focus:border-ledger-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
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
