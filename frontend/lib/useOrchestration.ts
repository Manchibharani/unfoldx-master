"use client";

import { useCallback, useState } from "react";
import type { Provider } from "./types";
import {
  AGENT_PROVIDERS,
  LAYOUT,
  PROVIDER_LABEL,
  emptyOverrides,
  type FileDraft,
  type HubOverrides,
} from "./graph";
import { ApiError, taskApi, workspaceApi } from "./api";

/**
 * The control actions a person can take from the canvas, matching the
 * architecture doc's step 9 ("Authorization checks"): prompt an agent,
 * redirect, stop, approve a budget override, wire agents together, or
 * create a task for Bob to route.
 *
 * Actions that have a real REST endpoint behind them are sent to the backend
 * first; the optimistic local update only lands when the call succeeds.
 * Actions without an endpoint are applied locally and flagged in the queue.
 */
export type ControlAction =
  | { kind: "pause"; provider: Provider }
  | { kind: "resume"; provider: Provider }
  | { kind: "stop"; provider: Provider; taskId?: string }
  | { kind: "approve_budget"; provider: Provider; additionalUsd?: number }
  | { kind: "redirect"; subtaskId: string; taskId: string; target: Provider }
  | { kind: "submit_task"; summary: string; files?: FileDraft[] }
  | { kind: "prompt_agent"; agentId: string; text: string }
  | { kind: "add_agent"; provider: Provider }
  | { kind: "remove_agent"; agentId: string }
  | { kind: "clear_added_agents" }
  | { kind: "connect"; source: string; target: string }
  | { kind: "disconnect"; connectionId: string }
  | { kind: "attach"; agentId: string; files: FileDraft[] }
  | { kind: "detach"; attachmentId: string };

/**
 * Kinds the backend exposes no endpoint for — they stay a purely local canvas
 * interaction and are labelled in the queue so the UI never claims success.
 */
const LOCAL_ONLY: ReadonlySet<ControlAction["kind"]> = new Set([
  "pause",
  "resume",
  "connect",
  "disconnect",
  "prompt_agent",
  "remove_agent",
  "clear_added_agents",
  "detach",
]);

const LOCAL_NOTE = "not yet connected to backend — local only";

export type QueueOutcome = "sent" | "pending" | "local" | "failed" | "mock";

export interface QueuedAction {
  id: string;
  at: string;
  action: ControlAction;
  label: string;
  outcome: QueueOutcome;
  detail?: string;
}

function actionLabel(action: ControlAction): string {
  switch (action.kind) {
    case "pause":
      return `Pause ${PROVIDER_LABEL[action.provider]}`;
    case "resume":
      return `Resume ${PROVIDER_LABEL[action.provider]}`;
    case "stop":
      return `Stop ${PROVIDER_LABEL[action.provider]}`;
    case "approve_budget":
      return `Approve budget override for ${PROVIDER_LABEL[action.provider]}`;
    case "redirect":
      return `Redirect ${action.subtaskId} → ${PROVIDER_LABEL[action.target]}`;
    case "submit_task":
      return action.files && action.files.length > 0
        ? `Command: ${action.summary} (+${action.files.length} file${action.files.length === 1 ? "" : "s"})`
        : `Command: ${action.summary}`;
    case "prompt_agent":
      return `Prompt an agent: ${action.text}`;
    case "add_agent":
      return `Add ${PROVIDER_LABEL[action.provider]} agent`;
    case "remove_agent":
      return `Remove agent ${action.agentId}`;
    case "clear_added_agents":
      return "Clear all added agents";
    case "connect":
      return `Connect ${action.source} → ${action.target}`;
    case "disconnect":
      return `Disconnect ${action.connectionId}`;
    case "attach":
      return `Attach ${action.files.length} file${action.files.length === 1 ? "" : "s"} to ${action.agentId}`;
    case "detach":
      return `Detach file ${action.attachmentId.slice(0, 8)}`;
  }
}

function applyLocal(prev: HubOverrides, action: ControlAction): HubOverrides {
  const next: HubOverrides = {
    paused: new Set(prev.paused),
    stopped: new Set(prev.stopped),
    approved: new Set(prev.approved),
    redirected: new Map(prev.redirected),
    submitted: [...prev.submitted],
    addedAgents: [...prev.addedAgents],
    connections: [...prev.connections],
    prompts: [...prev.prompts],
    attachments: [...prev.attachments],
  };

  switch (action.kind) {
    case "pause":
      next.paused.add(action.provider);
      next.stopped.delete(action.provider);
      break;
    case "resume":
      next.paused.delete(action.provider);
      next.stopped.delete(action.provider);
      break;
    case "stop":
      next.stopped.add(action.provider);
      break;
    case "approve_budget":
      next.approved.add(action.provider);
      break;
    case "redirect":
      next.redirected.set(action.subtaskId, action.target);
      break;
    case "submit_task": {
      // No local routing heuristic: the task is queued for the backend, which
      // owns decomposition and capability routing (plan_decomposed →
      // route_decided arrive over the WebSocket).
      const files =
        action.files && action.files.length > 0
          ? action.files.map((f) => ({ ...f, agentId: null as string | null, at: new Date().toISOString() }))
          : [];
      next.submitted = [
        ...next.submitted,
        {
          id: `local-${crypto.randomUUID().slice(0, 8)}`,
          summary: action.summary,
          provider: "bob" as Provider,
          reason: "Submitted to Bob — awaiting decomposition & capability routing from the backend",
          files,
        },
      ];
      if (files.length > 0) {
        const consumed = new Set(files.map((f) => f.id));
        next.attachments = next.attachments.filter((a) => !consumed.has(a.id));
      }
      break;
    }
    case "prompt_agent":
      next.prompts = [
        ...next.prompts,
        {
          id: crypto.randomUUID(),
          agentId: action.agentId,
          text: action.text,
          at: new Date().toISOString(),
          status: "queued",
        },
      ];
      break;
    case "add_agent": {
      const sameType = prev.addedAgents.filter((a) => a.provider === action.provider).length;
      const index = prev.addedAgents.length;
      next.addedAgents = [
        ...next.addedAgents,
        {
          id: `agent-${crypto.randomUUID().slice(0, 8)}`,
          provider: action.provider,
          label:
            sameType === 0
              ? `${PROVIDER_LABEL[action.provider]} (added)`
              : `${PROVIDER_LABEL[action.provider]} #${sameType + 1}`,
          x: LAYOUT.agentX,
          y: (AGENT_PROVIDERS.length + index) * LAYOUT.agentGap,
        },
      ];
      break;
    }
    case "remove_agent": {
      next.addedAgents = next.addedAgents.filter((a) => a.id !== action.agentId);
      next.connections = next.connections.filter(
        (c) => c.source !== action.agentId && c.target !== action.agentId
      );
      next.prompts = next.prompts.filter((p) => p.agentId !== action.agentId);
      break;
    }
    case "clear_added_agents": {
      const removed = new Set(next.addedAgents.map((a) => a.id));
      next.addedAgents = [];
      next.connections = next.connections.filter(
        (c) => !removed.has(c.source) && !removed.has(c.target)
      );
      next.prompts = next.prompts.filter((p) => !removed.has(p.agentId));
      next.attachments = next.attachments.filter((a) => a.agentId && !removed.has(a.agentId));
      break;
    }
    case "connect": {
      if (action.source === action.target) break;
      const exists = next.connections.some(
        (c) => c.source === action.source && c.target === action.target
      );
      if (exists) break;
      next.connections = [
        ...next.connections,
        { id: `conn-${crypto.randomUUID().slice(0, 8)}`, source: action.source, target: action.target },
      ];
      break;
    }
    case "disconnect":
      next.connections = next.connections.filter((c) => c.id !== action.connectionId);
      break;
    case "attach":
      next.attachments = [
        ...next.attachments,
        ...action.files.map((f) => ({
          ...f,
          agentId: action.agentId,
          at: new Date().toISOString(),
        })),
      ];
      break;
    case "detach":
      next.attachments = next.attachments.filter((a) => a.id !== action.attachmentId);
      break;
  }

  return next;
}

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
const HAS_API = Boolean(process.env.NEXT_PUBLIC_API_URL);

/** Rebuild a real File for multipart upload (raw is kept when present). */
function draftToFile(draft: FileDraft): File {
  if (draft.raw) return draft.raw;
  return new File([draft.content || ""], draft.name, { type: draft.type || "application/octet-stream" });
}

/** FastAPI error `detail` can be a string, a validation list, or an object. */
function formatDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) =>
        d && typeof d === "object" && "msg" in d && typeof (d as { msg: unknown }).msg === "string"
          ? (d as { msg: string }).msg
          : JSON.stringify(d)
      )
      .join("; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return "request rejected by the backend";
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return formatDetail(error.detail);
  if (error instanceof Error) return error.message;
  return String(error);
}

function entry(action: ControlAction, outcome: QueueOutcome, detail?: string): QueuedAction {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    action,
    label: actionLabel(action),
    outcome,
    detail,
  };
}

export function useOrchestration(workspaceId: string) {
  const [overrides, setOverrides] = useState<HubOverrides>(() => emptyOverrides());
  const [queue, setQueue] = useState<QueuedAction[]>([]);

  const push = useCallback((item: QueuedAction) => {
    setQueue((prev) => [...prev.slice(-19), item]);
  }, []);

  /**
   * Maps an action onto its real REST endpoint. Throws (ApiError/Error) on any
   * failure so the caller can roll back / skip the optimistic local update.
   * Local-only kinds resolve immediately; they never reach the backend.
   */
  const dispatch = useCallback(
    async (action: ControlAction): Promise<void> => {
      switch (action.kind) {
        case "submit_task": {
          const attachmentIds: string[] = [];
          if (action.files && action.files.length > 0) {
            for (const draft of action.files) {
              const uploaded = await workspaceApi.uploadAttachment(workspaceId, draftToFile(draft));
              attachmentIds.push(uploaded.id);
            }
          }
          await workspaceApi.submitTask(workspaceId, {
            prompt: action.summary,
            attachment_ids: attachmentIds,
          });
          return;
        }
        case "stop": {
          if (!action.taskId) throw new Error("no active task on the backend to stop");
          await taskApi.stop(action.taskId);
          return;
        }
        case "redirect": {
          const agents = await workspaceApi.listAgents(workspaceId);
          const targetAgent = agents.find((a) => a.provider === action.target && a.enabled !== false);
          // Without a matching agent row the backend re-routes by capability and
          // appends the instruction, rather than forcing an unknown agent id.
          await taskApi.redirect(action.taskId, action.subtaskId, {
            agent_id: targetAgent?.id ?? null,
            instruction: `User redirected this subtask to ${PROVIDER_LABEL[action.target]}`,
          });
          return;
        }
        case "approve_budget": {
          const additionalUsd = action.additionalUsd && action.additionalUsd > 0 ? action.additionalUsd : 25;
          await workspaceApi.approveOverride(
            workspaceId,
            action.provider,
            additionalUsd,
            "override approved from the agent canvas"
          );
          return;
        }
        case "add_agent":
          await workspaceApi.addAgent(workspaceId, { provider: action.provider });
          return;
        case "attach": {
          for (const draft of action.files) {
            await workspaceApi.uploadAttachment(workspaceId, draftToFile(draft));
          }
          return;
        }
        case "pause":
        case "resume":
        case "connect":
        case "disconnect":
        case "prompt_agent":
        case "remove_agent":
        case "clear_added_agents":
        case "detach":
          return;
      }
    },
    [workspaceId]
  );

  const send = useCallback(
    (action: ControlAction) => {
      if (IS_MOCK) {
        // No backend in mock mode: the local canvas is the whole truth, and we
        // label the entry so nobody mistakes it for a server-confirmed action.
        setOverrides((prev) => applyLocal(prev, action));
        push(entry(action, "mock"));
        return;
      }

      if (!HAS_API) {
        if (LOCAL_ONLY.has(action.kind)) {
          setOverrides((prev) => applyLocal(prev, action));
          push(entry(action, "local", LOCAL_NOTE));
        } else {
          push(entry(action, "failed", "no backend API configured (NEXT_PUBLIC_API_URL)"));
        }
        return;
      }

      void (async () => {
        try {
          await dispatch(action);
          // Only a successful call earns the optimistic local update.
          setOverrides((prev) => applyLocal(prev, action));
          push(entry(action, action.kind === "submit_task" ? "pending" : "sent"));
        } catch (error) {
          // No local change: the backend is the source of truth, and it logs a
          // real authorization_denied event over the WebSocket on a 403.
          push(entry(action, "failed", errorMessage(error)));
        }
      })();
    },
    [dispatch, push]
  );

  return { overrides, queue, send };
}