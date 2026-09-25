import type { WorkspaceEvent } from "./types";

/**
 * Files-panel data: touched files come from `handoff_emitted` payloads
 * (`files_touched`), grouped per task. The backend records no per-file
 * status, so "created" vs "modified" is inferred client-side from the
 * `plan_decomposed` payload's declared per-subtask file claims:
 * a touched path inside some subtask's claims is a modification; a touched
 * path claimed by no subtask was almost certainly created. When no plan
 * has been seen (e.g. events replayed mid-task), everything falls back to
 * "modified" — labelled as unknown in the UI, never invented.
 */

export type FileStatus = "created" | "modified";

export interface FileEntry {
  path: string;
  status: FileStatus;
  /** Provider of the agent that last touched this file (if known). */
  provider: string | null;
}

export interface FilesModel {
  taskId: string | null;
  files: FileEntry[];
  /** True when no plan_decomposed claims were seen, so status is a guess. */
  statusInferred: boolean;
}

export function filesModelFor(events: WorkspaceEvent[]): FilesModel {
  const planEvents = events.filter((e) => e.event_type === "plan_decomposed");
  const latestPlan = planEvents[planEvents.length - 1];
  const taskId = latestPlan?.task_id ?? null;

  // Declared claims: which paths each subtask said it would modify.
  const claims = new Set<string>();
  if (latestPlan && Array.isArray(latestPlan.payload.plan)) {
    for (const st of latestPlan.payload.plan as Array<{ files?: unknown }>) {
      if (Array.isArray(st.files)) for (const f of st.files) if (typeof f === "string") claims.add(f);
    }
  }

  // First handler wins so an earlier touch is never overwritten by a later
  // agent that merely also listed the file; provider reflects who touched it.
  const byPath = new Map<string, FileEntry>();
  for (const e of events) {
    if (e.event_type !== "handoff_emitted") continue;
    const touched = e.payload.files_touched;
    if (!Array.isArray(touched)) continue;
    for (const raw of touched) {
      if (typeof raw !== "string" || !raw) continue;
      if (byPath.has(raw)) continue;
      byPath.set(raw, {
        path: raw,
        status: claims.has(raw) ? "modified" : "created",
        provider: e.provider ?? null,
      });
    }
  }

  return {
    taskId,
    files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
    statusInferred: latestPlan == null,
  };
}

/* ------------------------------------------------------------------ */
/* Tree building: flat path list -> nested directory nodes            */
/* ------------------------------------------------------------------ */

export interface TreeNode {
  name: string;
  path: string;
  kind: "dir" | "file";
  /** Files only. */
  status?: FileStatus;
  provider?: string | null;
  children: TreeNode[];
}

function insert(root: TreeNode, entry: FileEntry): void {
  const parts = entry.path.split("/").filter(Boolean);
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const name = parts[i];
    let child = node.children.find((c) => c.kind === "dir" && c.name === name);
    if (!child) {
      child = { name, path: parts.slice(0, i + 1).join("/"), kind: "dir", children: [] };
      node.children.push(child);
    }
    node = child;
  }
  node.children.push({
    name: parts[parts.length - 1],
    path: entry.path,
    kind: "file",
    status: entry.status,
    provider: entry.provider,
    children: [],
  });
}

/** Directories first, alphabetical; files after, alphabetical. */
export function buildTree(files: FileEntry[]): TreeNode | null {
  if (files.length === 0) return null;
  const root: TreeNode = { name: "", path: "", kind: "dir", children: [] };
  for (const f of files) insert(root, f);
  const sortNode = (n: TreeNode): void => {
    n.children.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1
    );
    for (const c of n.children) if (c.kind === "dir") sortNode(c);
  };
  sortNode(root);
  return root;
}
