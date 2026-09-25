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
}: {
  agent: AgentState;
  disabled?: boolean;
  onAction: (action: ControlAction) => void;
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
          className="inline-flex items-center gap-1 rounded-sm border border-ink-600 bg-ink-800 px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:text-parchment disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Reading…" : "Attach files"}
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
      </div>
      <FileChips
        files={agent.attachments}
        onDetach={(id) => onAction({ kind: "detach", attachmentId: id })}
        className="mt-1.5"
      />
    </div>
  );
}