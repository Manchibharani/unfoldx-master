"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import type { CanvasPluginPanel } from "@/lib/plugins";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type GitHubNodeData = {
  panel: CanvasPluginPanel;
  onRemoveNode: (nodeId: string) => void;
  workspaceId: string;
};

type ArchFile = { path: string; kind: string; size: number };
type ArchEdge = { source: string; target: string; count?: number };
type ArchResponse = {
  root: string;
  exists: boolean;
  files: ArchFile[];
  edges: ArchEdge[];
  package_deps: ArchEdge[];
  stats: {
    file_count: number;
    total_bytes: number;
    total_loc: number;
    edge_count: number;
    package_count: number;
    by_kind: Record<string, number>;
    top_hubs: { path: string; importers: number }[];
  };
};

type GraphNode = {
  id: string;
  label: string;
  detail: string;
  kind: string;
  layer: number;
  x: number;
  y: number;
  color: string;
};

const KIND_COLOR: Record<string, string> = {
  backend: "#7AB8FF",
  frontend: "#3ECFB2",
  artifact: "#D9A441",
  docs: "#76C78B",
  config: "#9B6CFF",
  data: "#E0A75B",
  devops: "#62C7D8",
  package: "#D785CA",
  other: "#8FA3BF",
};
// Left-to-right pipeline: config/devops -> backend -> frontend -> artifacts/packages.
const KIND_LAYER: Record<string, number> = {
  config: 0, devops: 0, docs: 0, backend: 1, data: 1, frontend: 2, artifact: 3, package: 4, other: 2,
};

const MAX_PER_LAYER = 6;
const LAYER_X = [12, 148, 284, 420, 556];
const NODE_W = 118;
const NODE_H = 38;
const ROW_GAP = 46;
const TOP_PACKAGES = 6;
const MAX_EDGES_DRAWN = 60;

function shortLabel(path: string, max = 16): string {
  const name = path.split("/").pop() ?? path;
  return name.length > max ? name.slice(0, max - 1) + "…" : name;
}

/**
 * Group the real file list into visualisable nodes: individual files while the repo is
 * small, top-level directories once it grows, then external packages as their own nodes.
 */
function buildGraph(data: ArchResponse): { nodes: GraphNode[]; edges: [string, string][]; height: number } {
  if (!data.exists || data.files.length === 0) return { nodes: [], edges: [], height: 196 };

  const perFile = data.files.length <= 16;
  type Entry = { id: string; label: string; detail: string; kind: string; layer: number; size: number };
  const entries: Entry[] = [];

  if (perFile) {
    for (const f of data.files) {
      entries.push({ id: f.path, label: shortLabel(f.path), detail: f.path, kind: f.kind, layer: KIND_LAYER[f.kind] ?? 2, size: f.size });
    }
  } else {
    const groups = new Map<string, { count: number; bytes: number; kindVotes: Record<string, number> }>();
    for (const f of data.files) {
      const top = f.path.includes("/") ? f.path.split("/")[0] + "/" : f.path; // root files stand alone
      const g = groups.get(top) ?? { count: 0, bytes: 0, kindVotes: {} };
      g.count += 1;
      g.bytes += f.size;
      g.kindVotes[f.kind] = (g.kindVotes[f.kind] ?? 0) + 1;
      groups.set(top, g);
    }
    for (const [top, g] of groups) {
      const kind = Object.entries(g.kindVotes).sort((a, b) => b[1] - a[1])[0][0];
      entries.push({
        id: top,
        label: shortLabel(top.replace(/\/$/, ""), 18),
        detail: `${g.count} file${g.count === 1 ? "" : "s"} · ${Math.max(1, Math.round(g.bytes / 1024))} KB`,
        kind,
        layer: KIND_LAYER[kind] ?? 2,
        size: g.bytes,
      });
    }
  }

  // External packages (react, fastapi, …) as right-most nodes, most-imported first.
  const pkgs = [...data.package_deps].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, TOP_PACKAGES);
  for (const p of pkgs) {
    const name = p.target.replace(/^pkg:/, "");
    entries.push({ id: p.target, label: shortLabel(name, 16), detail: `${p.count ?? 1} import${(p.count ?? 1) === 1 ? "" : "s"}`, kind: "package", layer: 4, size: 0 });
  }

  // Cap each layer (merge the tail) so the diagram stays readable.
  const byLayer = new Map<number, Entry[]>();
  for (const e of entries) {
    const list = byLayer.get(e.layer) ?? [];
    list.push(e);
    byLayer.set(e.layer, list);
  }
  const placed: GraphNode[] = [];
  let maxRows = 1;
  const keptIds = new Set<string>();
  for (const layer of [...byLayer.keys()].sort((a, b) => a - b)) {
    const list = byLayer.get(layer)!.sort((a, b) => b.size - a.size);
    const keep = list.slice(0, MAX_PER_LAYER);
    const overflow = list.length - keep.length;
    for (const e of keep) {
      placed.push({ id: e.id, label: e.label, detail: e.detail, kind: e.kind, layer: e.layer, x: LAYER_X[Math.min(e.layer, LAYER_X.length - 1)], y: 0, color: KIND_COLOR[e.kind] ?? KIND_COLOR.other });
      keptIds.add(e.id);
    }
    if (overflow > 0) {
      const id = `more-${layer}`;
      placed.push({ id, label: `+${overflow} more`, detail: "folded for clarity", kind: "other", layer, x: LAYER_X[Math.min(layer, LAYER_X.length - 1)], y: 0, color: KIND_COLOR.other });
    }
    maxRows = Math.max(maxRows, byLayer.get(layer)!.length);
  }
  // stack rows within each layer
  const rows = new Map<number, number>();
  for (const n of placed) {
    const r = rows.get(n.layer) ?? 0;
    n.y = 10 + r * ROW_GAP;
    rows.set(n.layer, r + 1);
  }
  const height = Math.min(320, Math.max(196, 20 + maxRows * ROW_GAP));

  // Remap edges onto kept nodes (grouped case: file->file becomes group->group).
  const groupOf = new Map<string, string>();
  if (!perFile) {
    for (const f of data.files) {
      const top = f.path.includes("/") ? f.path.split("/")[0] + "/" : f.path;
      groupOf.set(f.path, keptIds.has(top) ? top : `more-${KIND_LAYER[f.kind] ?? 2}`);
    }
  }
  const edgeSet = new Set<string>();
  const edges: [string, string][] = [];
  const push = (s: string, t: string) => {
    if (s === t || !keptIds.has(s) || !keptIds.has(t)) return;
    const key = `${s}->${t}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push([s, t]);
  };
  for (const e of data.edges.slice(0, 400)) push(groupOf.get(e.source) ?? e.source, groupOf.get(e.target) ?? e.target);
  for (const e of data.package_deps) push(e.source, e.target);
  return { nodes: placed, edges: edges.slice(0, MAX_EDGES_DRAWN), height };
}

function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
      <p className="text-[14px] font-semibold tabular-nums text-parchment">{value}</p>
      <p className="truncate text-[8px] uppercase tracking-[0.08em] text-muted">{label}</p>
    </div>
  );
}

export function GitHubNode({ data }: NodeProps) {
  const { panel, onRemoveNode, workspaceId } = data as unknown as GitHubNodeData;
  const [arch, setArch] = useState<ArchResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`${API_URL}/api/workspaces/${workspaceId}/architecture`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: ArchResponse) => {
        if (!cancelled) setArch(j);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "failed to load architecture");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load, reloadNonce]);

  const graph = arch ? buildGraph(arch) : { nodes: [], edges: [] as [string, string][], height: 196 };
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const selected = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;
  const connectionsOf = (id: string) => graph.edges.filter(([s, t]) => s === id || t === id).length;
  const hubs = arch?.stats.top_hubs.slice(0, 3) ?? [];
  const maxHub = hubs[0]?.importers ?? 1;

  return (
    <section className="w-[690px] overflow-hidden rounded-xl border border-[#0FBF3E]/30 bg-ink-900 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.92)]">
      <header className="flex items-center justify-between border-b border-ink-700 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Image src="/logos/github.svg" alt="" aria-hidden width={24} height={24} unoptimized className="h-6 w-6 shrink-0 rounded-full" />
          <div className="min-w-0">
            <h2 className="truncate text-xs font-semibold text-[#0FBF3E]">{arch?.root || workspaceId} · architecture</h2>
            <p className="text-[9px] text-muted">{arch?.exists ? `live repo · ${arch.stats.file_count} files scanned` : "workspace repository"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-[8px] font-semibold uppercase tracking-wide ${arch?.exists ? "border-[#0FBF3E]/25 bg-[#0FBF3E]/10 text-[#0FBF3E]" : "border-white/10 bg-white/[0.03] text-muted"}`}>
            {arch?.exists ? "Live repo" : "Empty"}
          </span>
          <button
            type="button"
            className="nodrag rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-parchment"
            title="Rescan repository"
            aria-label="Rescan repository"
            onClick={(event) => {
              event.stopPropagation();
              setReloadNonce((n) => n + 1);
            }}
          >
            <RefreshIcon />
          </button>
          <button
            type="button"
            className="nodrag rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-parchment"
            title="Close GitHub panel"
            aria-label="Close GitHub panel"
            onClick={(event) => {
              event.stopPropagation();
              onRemoveNode(panel.id);
            }}
          >
            ×
          </button>
        </div>
      </header>

      <div className="nodrag nopan p-3">
        {loading && !arch ? (
          <div className="flex h-[196px] items-center justify-center rounded-lg border border-white/[0.07] bg-[#0C1119] text-[10px] text-muted">
            Scanning repository…
          </div>
        ) : error && !arch ? (
          <div className="flex h-[196px] flex-col items-center justify-center gap-2 rounded-lg border border-white/[0.07] bg-[#0C1119] text-[10px] text-muted">
            <span className="text-state-conflict">Could not load architecture ({error})</span>
            <button type="button" onClick={() => setReloadNonce((n) => n + 1)} className="rounded-md border border-white/[0.08] bg-ink-800 px-2.5 py-1 text-[9px] text-parchment hover:border-[#0FBF3E]/40">
              Retry
            </button>
          </div>
        ) : !arch?.exists || graph.nodes.length === 0 ? (
          <div className="flex h-[196px] items-center justify-center rounded-lg border border-white/[0.07] bg-[#0C1119] px-6 text-center text-[10px] leading-relaxed text-muted">
            No files in this workspace repository yet. Files the agents create appear here as the project architecture.
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold text-parchment">Module dependency graph</p>
                <p className="mt-0.5 text-[8px] text-muted">config/devops → backend → frontend → artifacts · packages</p>
              </div>
              <span className="flex max-w-[280px] items-center gap-1.5 truncate text-right text-[8px] text-[#70D991]" aria-live="polite">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0FBF3E]" />
                {arch.stats.edge_count} imports · {arch.stats.package_count} packages · {arch.stats.total_loc.toLocaleString()} LOC
              </span>
            </div>

            <div className="relative overflow-hidden rounded-lg border border-white/[0.07] bg-[#0C1119]" style={{ height: graph.height }}>
              <svg viewBox={`0 0 660 ${graph.height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
                <defs>
                  <marker id="github-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0 0 6 3 0 6Z" fill="#65758C" />
                  </marker>
                </defs>
                {graph.edges.map(([source, target], index) => {
                  const from = nodeById.get(source);
                  const to = nodeById.get(target);
                  if (!from || !to) return null;
                  const sx = from.x + NODE_W;
                  const sy = from.y + NODE_H / 2;
                  const tx = to.x;
                  const ty = to.y + NODE_H / 2;
                  const mid = (sx + tx) / 2;
                  const highlighted = source === selectedNodeId || target === selectedNodeId;
                  return (
                    <path
                      key={`${source}-${target}-${index}`}
                      d={`M ${sx} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${tx - 5} ${ty}`}
                      fill="none"
                      stroke={highlighted ? "#0FBF3E" : "#526176"}
                      strokeWidth={highlighted ? 1.5 : 1}
                      opacity={selectedNodeId && !highlighted ? 0.35 : 1}
                      markerEnd="url(#github-arrow)"
                    />
                  );
                })}
              </svg>

              {graph.nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                    title={`${node.kind} · ${node.detail}`}
                    className={`absolute flex flex-col justify-center rounded-md border px-2 text-left transition-colors ${isSelected ? "bg-white/[0.08]" : "bg-ink-900 hover:bg-white/[0.05]"}`}
                    style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H, borderColor: `${node.color}${isSelected ? "CC" : "66"}` }}
                  >
                    <span className="truncate text-[9px] font-semibold" style={{ color: node.color }}>{node.label}</span>
                    <span className="mt-0.5 truncate text-[7px] text-muted">{node.detail}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-muted">
              {[["backend", "#7AB8FF"], ["frontend", "#3ECFB2"], ["artifact", "#D9A441"], ["docs", "#76C78B"], ["config", "#9B6CFF"], ["data", "#E0A75B"], ["devops", "#62C7D8"], ["package", "#D785CA"]].map(([label, color]) => (
                <span key={label} className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: color }} />{label}</span>
              ))}
              <span className="ml-auto text-muted/70">Click a module for details</span>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-1.5">
              <Metric label="Files" value={`${arch.stats.file_count}`} />
              <Metric label="Imports" value={`${arch.stats.edge_count}`} />
              <Metric label="Packages" value={`${arch.stats.package_count}`} />
              <Metric label="Lines" value={arch.stats.total_loc >= 1000 ? `${(arch.stats.total_loc / 1000).toFixed(1)}k` : `${arch.stats.total_loc}`} />
            </div>

            {hubs.length > 0 && (
              <div className="mt-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[8px] font-semibold uppercase tracking-wide text-muted">Most imported modules</p>
                  <p className="text-[8px] text-muted">in-degree · top files</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {hubs.map((hub) => (
                    <div key={hub.path} className="min-w-0">
                      <div className="mb-1 flex items-center justify-between gap-1 text-[8px]">
                        <span className="truncate text-parchment" title={hub.path}>{shortLabel(hub.path, 18)}</span>
                        <span className="tabular-nums text-muted">{hub.importers}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-ink-700">
                        <div className="h-full rounded-full bg-[#7AB8FF]" style={{ width: `${(hub.importers / (maxHub || 1)) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-[8px] uppercase tracking-wide text-muted">Selected · {selected?.kind ?? "—"}</p>
                <p className="truncate text-[9px] font-medium text-parchment">
                  {selected ? selected.label : "No module selected"}{" "}
                  <span className="font-normal text-muted">/ {selected ? selected.detail : "click a node in the graph"}</span>
                </p>
              </div>
              <span className="ml-3 shrink-0 text-[8px] tabular-nums text-[#70D991]">{selected ? `${connectionsOf(selected.id)} connections` : ""}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
