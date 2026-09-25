"use client";

import { useRef, useState, type FormEvent } from "react";
import type { FileDraft } from "@/lib/graph";
import { PROVIDER_LABEL, routeTask } from "@/lib/graph";
import type { WorkspaceEvent } from "@/lib/types";
import type { ControlAction } from "@/lib/useOrchestration";
import type { Permissions } from "@/lib/permissions";
import { readFiles } from "@/lib/attachments";
import { FileChips } from "./FileChips";

function ClipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function historicalTaskAverage(events: WorkspaceEvent[], provider: string): number | null {
  const completed = new Set(
    events
      .filter((event) => event.event_type === "task_completed" && event.payload.status === "completed")
      .map((event) => event.task_id)
      .filter((taskId): taskId is string => Boolean(taskId))
  );
  const totals = new Map<string, number>();
  for (const event of events) {
    if (
      !event.task_id ||
      !completed.has(event.task_id) ||
      event.provider !== provider ||
      event.event_type === "budget_update" ||
      typeof event.cost_delta !== "number"
    ) continue;
    totals.set(event.task_id, (totals.get(event.task_id) ?? 0) + event.cost_delta);
  }
  const samples = [...totals.values()].filter((cost) => cost > 0);
  return samples.length ? samples.reduce((sum, cost) => sum + cost, 0) / samples.length : null;
}

export function AskBob({
  onAction,
  events,
  permissions,
}: {
  onAction: (action: ControlAction) => void;
  events: WorkspaceEvent[];
  permissions: Permissions;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<FileDraft[]>([]);
  const hasPreview = Boolean(value.trim() || files.length);
  const route = routeTask(value.trim() || (files.length ? "general implementation" : ""));
  const estimate = historicalTaskAverage(events, route.provider);

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const drafts = await readFiles(e.target.files);
    if (drafts.length > 0) setFiles((prev) => [...prev, ...drafts]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text && files.length === 0) return;
    onAction({ kind: "submit_task", summary: text || "New task with attachment", files });
    setValue("");
    setFiles([]);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-accent-indigo/30 to-accent-blue/30">
            <span className="h-2 w-2 rounded-full bg-state-orchestration" />
          </div>
          <h2 className="text-sm font-semibold text-parchment">Ask Bob</h2>
        </div>
        {hasPreview ? (
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px]">
            <span className="text-muted/60">Route →</span>
            <span className="font-semibold text-state-orchestration">{PROVIDER_LABEL[route.provider]}</span>
            <span className="text-muted/60">est.</span>
            <span
              className="tabular-nums text-parchment"
              title="Average recorded spend for completed tasks handled by this provider; not a guaranteed quote."
            >
              {estimate === null ? "no history" : `~$${estimate.toFixed(3)}`}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-muted">Route + cost preview</span>
        )}
      </div>

      {/* Form */}
      <div className="px-4 py-3">
        <form onSubmit={submit}>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!permissions.canControl}
            rows={2}
            placeholder={permissions.canControl ? "Describe the work for Bob to break down and route" : "Submitting tasks requires the control role"}
            className="min-h-[56px] w-full resize-y rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-parchment outline-none placeholder:text-muted focus:border-accent-blue/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted/70">
              {value.trim() || files.length
                ? route.reason
                : "Routing and cost preview appear as you compose."}
            </p>
            <label
              className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-ink-700 bg-ink-800 text-muted transition-colors hover:border-ink-600 hover:text-parchment ${permissions.canControl ? "" : "pointer-events-none opacity-40"}`}
              title={permissions.canControl ? "Attach files" : "Attaching files requires the control role"}
            >
              <ClipIcon />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={onPickFiles}
                disabled={!permissions.canControl}
              />
            </label>
            <button
              type="submit"
              disabled={(!value.trim() && files.length === 0) || !permissions.canControl}
              className="h-8 shrink-0 rounded-lg bg-gradient-to-r from-accent-indigo to-accent-blue px-4 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ask Bob
            </button>
          </div>
        </form>

        {files.length > 0 && (
          <div className="mt-2.5 border-t border-ink-700 pt-2.5">
            <FileChips files={files} onDetach={(id) => setFiles((prev) => prev.filter((file) => file.id !== id))} />
          </div>
        )}
      </div>
    </section>
  );
}