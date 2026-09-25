"use client";

import { useMemo, useState } from "react";
import { buildTree, filesModelFor, type FileStatus, type TreeNode } from "@/lib/filesTree";

/**
 * Files panel: tree view of every path reported in `handoff_emitted`
 * `files_touched` payloads, per task, with a created/modified chip per file.
 * The backend records no per-file status, so the chip is inferred from the
 * plan's declared file claims (see lib/filesTree.ts) and the panel says so.
 */

const STATUS_STYLE: Record<FileStatus, string> = {
  created: "border-state-running/40 bg-state-running/10 text-state-running",
  modified: "border-state-inactive/40 bg-state-inactive/10 text-state-inactive",
};

const STATUS_LABEL: Record<FileStatus, string> = {
  created: "created",
  modified: "modified",
};

function DirIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-muted">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-muted">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function TreeNodeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  if (node.kind === "file") {
    return (
      <div className="flex items-center gap-2 rounded-sm px-1 py-0.5" style={{ paddingLeft: depth * 14 + 4 }}>
        <FileIcon />
        <span className="truncate font-mono text-[11px] text-parchment/85" title={node.path}>
          {node.name}
        </span>
        {node.status && (
          <span
            className={`ml-auto shrink-0 rounded-sm border px-1 py-px text-[9px] uppercase tracking-wide ${STATUS_STYLE[node.status]}`}
            title={node.path}
          >
            {STATUS_LABEL[node.status]}
          </span>
        )}
      </div>
    );
  }
  return (
    <div>
      {node.path !== "" && ( // the synthetic root is not rendered, only its children
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-ink-800"
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          <span className={`shrink-0 text-state-inactive ${open ? "rotate-90" : ""}`}>▸</span>
          <DirIcon />
          <span className="truncate font-mono text-[11px] text-muted">{node.name}/</span>
        </button>
      )}
      {open &&
        node.children.map((c) => <TreeNodeRow key={c.path} node={c} depth={node.path === "" ? depth : depth + 1} />)}
    </div>
  );
}

export function FilesPanel({ events }: { events: import("@/lib/types").WorkspaceEvent[] }) {
  const model = useMemo(() => filesModelFor(events), [events]);
  const tree = useMemo(() => buildTree(model.files), [model.files]);

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-muted">Files</h2>
      {tree === null || model.taskId === null ? (
        <p className="rounded-md border border-dashed border-ink-700 px-3 py-4 text-[11px] text-muted/60">
          No files touched yet — completed subtasks report their touched files here.
        </p>
      ) : (
        <div className="rounded-md border border-ink-700 bg-ink-950 px-2 py-2">
          <div className="mb-1 flex items-center justify-between px-1 text-[10px] text-muted/60">
            <span className="font-mono">task {model.taskId.slice(0, 8)}</span>
            <span title={model.statusInferred ? "No plan seen — status is a fallback guess" : "created vs modified inferred from the plan's declared file claims"}>
              {model.statusInferred ? "status unknown" : "status inferred from plan claims"}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <TreeNodeRow node={tree} depth={0} />
          </div>
        </div>
      )}
    </section>
  );
}
