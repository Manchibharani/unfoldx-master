"use client";

import { useRef, useState } from "react";
import type { AgentState } from "@/lib/graph";
import type { ControlAction } from "@/lib/useOrchestration";
import { readFiles } from "@/lib/attachments";
import { FileChips } from "../FileChips";

/**
 * Attach files to a single agent node (or Bob's hub). Files are read into
 * FileDrafts and pinned via the `attach` / `detach` orchestration actions so
 * they survive re-renders and follow the node.
 */
export function NodeAttachments({
  agent,
  disabled = false,
  onAction,
  actions,
}: {
  agent: AgentState;
  disabled?: boolean;
  onAction: (action: ControlAction) => void;
  actions?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      const drafts = await readFiles(list);
      if (drafts.length > 0) onAction({ kind: "attach", agentId: agent.id, files: drafts });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="nodrag mt-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => inputRef.current?.click()}
          title={disabled ? "Attaching files requires the control role" : "Attach files"}
          aria-label="Attach files"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-ink-600 bg-ink-800 text-state-inactive transition-colors hover:border-ink-500 hover:text-parchment disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M21.44 11.05l-8.49 8.49a6 6 0 11-8.49-8.49l9.19-9.19a4 4 0 115.66 5.66L10.66 16.1a2 2 0 11-2.83-2.83l8.49-8.49"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          <span className="sr-only">{busy ? "Reading files" : "Attach files"}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <span className="text-[10px] text-muted/60">
          {agent.attachments.length} attached
        </span>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      <FileChips
        files={agent.attachments}
        onDetach={(id) => onAction({ kind: "detach", attachmentId: id })}
        className="mt-1.5"
      />
    </div>
  );
}