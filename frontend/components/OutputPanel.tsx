"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceEvent } from "@/lib/types";

/**
 * Output panel: streams each agent's raw text per task as `agent_output`
 * events arrive. One collapsed-by-default stream per task; the newest task
 * auto-expands and auto-scrolls while the user hasn't scrolled away.
 *
 * Pure derived view over the event list, like EventFeed — no extra
 * subscription plumbing: everything already flows through
 * useWorkspaceSocket into `events`.
 */

interface TaskStream {
  taskId: string;
  lines: { id: string; provider: string | null; text: string; simulated: boolean }[];
  simulated: boolean;
}

function groupByTask(events: WorkspaceEvent[]): TaskStream[] {
  const byTask = new Map<string, TaskStream>();
  for (const e of events) {
    if (e.event_type !== "agent_output" || !e.task_id) continue;
    const text = typeof e.payload.text === "string" ? e.payload.text : "";
    let stream = byTask.get(e.task_id);
    if (!stream) {
      stream = { taskId: e.task_id, lines: [], simulated: false };
      byTask.set(e.task_id, stream);
    }
    if (text) {
      stream.lines.push({
        id: e.id,
        provider: e.provider ?? null,
        text,
        simulated: e.payload.simulated === true,
      });
      stream.simulated = stream.simulated || e.payload.simulated === true;
    }
  }
  return [...byTask.values()].reverse(); // newest task first
}

function TaskStreamView({ stream, defaultOpen }: { stream: TaskStream; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);

  const lastLen = stream.lines[stream.lines.length - 1]?.text.length ?? 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open || !wasAtBottom.current) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [lastLen, open]);

  return (
    <div className="overflow-hidden rounded-md border border-ink-700 bg-ink-950">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-ink-800"
      >
        <span className={`shrink-0 text-state-inactive ${open ? "rotate-90" : ""}`}>▸</span>
        <span className="truncate font-mono text-parchment/90">task {stream.taskId.slice(0, 8)}</span>
        {stream.simulated && (
          <span className="shrink-0 rounded-sm border border-state-warning/40 bg-state-warning/10 px-1 py-0.5 text-[9px] uppercase tracking-wide text-state-warning">
            simulated
          </span>
        )}
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-state-inactive">
          {stream.lines.length} output{stream.lines.length === 1 ? "" : "s"}
        </span>
      </button>
      {open && (
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto border-t border-ink-700 px-3 py-2"
          onScroll={(e) => {
            const el = e.currentTarget;
            wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
        >
          {stream.lines.map((line, i) => (
            <div key={line.id} className="mb-2 last:mb-0">
              <div className="flex items-center gap-2 text-[10px] text-muted/60">
                <span className="font-mono">
                  {i + 1}. {line.provider ?? "agent"}
                </span>
                {line.simulated && <span className="text-state-warning">simulated</span>}
              </div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-parchment/85">
                {line.text}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OutputPanel({ events }: { events: WorkspaceEvent[] }) {
  const streams = useMemo(() => groupByTask(events), [events]);

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-muted">Output</h2>
      {streams.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-700 px-3 py-4 text-[11px] text-muted/60">
          No agent output yet — agent text appears here as each subtask completes.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {streams.map((s, i) => (
            <TaskStreamView key={s.taskId} stream={s} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </section>
  );
}
