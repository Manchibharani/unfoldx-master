import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import type { CanvasPluginPanel } from "@/lib/plugins";

type GitHubNodeData = {
  panel: CanvasPluginPanel;
  onRemoveNode: (nodeId: string) => void;
};

type GraphNode = {
  id: string;
  label: string;
  detail: string;
  kind: "repository" | "service" | "parser" | "graph" | "analytics" | "ai" | "store" | "view";
  x: number;
  y: number;
  color: string;
};

const GRAPH_NODES: GraphNode[] = [
  { id: "repo", label: "Repository", detail: "uploaded source", kind: "repository", x: 10, y: 76, color: "#D9A441" },
  { id: "flask", label: "Flask UI", detail: "repo-ai/frontend", kind: "service", x: 142, y: 20, color: "#7AB8FF" },
  { id: "parser-api", label: "Parser API", detail: "FastAPI · :8001", kind: "service", x: 142, y: 132, color: "#7AB8FF" },
  { id: "tree-sitter", label: "Tree-sitter", detail: "AST extraction", kind: "parser", x: 274, y: 20, color: "#3ECFB2" },
  { id: "networkx", label: "NetworkX", detail: "dependency graph", kind: "graph", x: 274, y: 132, color: "#9B6CFF" },
  { id: "analytics", label: "Analytics", detail: "centrality · cycles", kind: "analytics", x: 406, y: 20, color: "#E0A75B" },
  { id: "reasoner", label: "Graph reasoner", detail: "paths · impact", kind: "ai", x: 406, y: 132, color: "#D785CA" },
  { id: "cytoscape", label: "Cytoscape.js", detail: "interactive graph", kind: "view", x: 538, y: 20, color: "#62C7D8" },
  { id: "chroma", label: "ChromaDB", detail: "semantic index", kind: "store", x: 538, y: 132, color: "#76C78B" },
];

const GRAPH_EDGES: [string, string][] = [
  ["repo", "flask"],
  ["repo", "parser-api"],
  ["flask", "parser-api"],
  ["parser-api", "tree-sitter"],
  ["tree-sitter", "networkx"],
  ["networkx", "analytics"],
  ["networkx", "reasoner"],
  ["analytics", "cytoscape"],
  ["reasoner", "chroma"],
  ["cytoscape", "networkx"],
];

const NODE_BY_ID = new Map(GRAPH_NODES.map((node) => [node.id, node]));
const NODE_CENTRALITY = GRAPH_NODES.map((node) => ({
  ...node,
  connections: GRAPH_EDGES.filter(([source, target]) => source === node.id || target === node.id).length,
})).sort((left, right) => right.connections - left.connections);
const TOP_CENTRAL_NODES = NODE_CENTRALITY.slice(0, 3);
const STREAM_EVENTS = [
  "parser-workflow · indexing module imports",
  "NetworkX · recalculating centrality",
  "repo-ai · refreshing graph view",
  "ChromaDB · updating semantic vectors",
];

function GitIcon({ name }: { name: "fetch" | "pull" | "push" | "commit" }) {
  if (name === "commit") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="3" cy="8" r="1.4" fill="currentColor" />
        <circle cx="13" cy="8" r="1.4" fill="currentColor" />
        <path d="M4.4 8h1.1m5 0h1.1" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  if (name === "fetch") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
        <path d="M13 6a5.2 5.2 0 0 0-9.3-1L2.5 6.5M3 3.2v3.4h3.4M3 10a5.2 5.2 0 0 0 9.3 1l1.2-1.5M13 12.8V9.4H9.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const down = name === "pull";
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d={down ? "M8 2.5v8m0 0 3-3m-3 3-3-3M3 13.5h10" : "M8 13.5v-8m0 0-3 3m3-3 3 3M3 2.5h10"} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
  const { panel, onRemoveNode } = data as unknown as GitHubNodeData;
  const [selectedNodeId, setSelectedNodeId] = useState("networkx");
  const [streamIndex, setStreamIndex] = useState(0);
  const [commitMessage, setCommitMessage] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | null>(null);
  const selectedNode = NODE_BY_ID.get(selectedNodeId) ?? GRAPH_NODES[0];

  useEffect(() => {
    const timer = window.setInterval(() => setStreamIndex((current) => current + 1), 2400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  const showMockResult = (action: string) => {
    const detail = action === "Commit" && commitMessage.trim() ? `: ${commitMessage.trim()}` : "";
    setNotice(`${action}${detail} · mock only`);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 3200);
    if (action === "Commit") setCommitMessage("");
  };

  const density = (GRAPH_EDGES.length / (GRAPH_NODES.length * (GRAPH_NODES.length - 1))).toFixed(2);

  return (
    <section className="w-[690px] overflow-hidden rounded-xl border border-[#0FBF3E]/30 bg-ink-900 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.92)]">
      <header className="flex items-center justify-between border-b border-ink-700 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Image src="/logos/github.svg" alt="" aria-hidden width={24} height={24} unoptimized className="h-6 w-6 shrink-0 rounded-full" />
          <div className="min-w-0">
            <h2 className="truncate text-xs font-semibold text-[#0FBF3E]">ai-repo-intelligence</h2>
            <p className="text-[9px] text-muted">main · repository architecture</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#0FBF3E]/25 bg-[#0FBF3E]/10 px-2 py-1 text-[8px] font-semibold uppercase tracking-wide text-[#0FBF3E]">Mock repo</span>
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
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold text-parchment">Dependency architecture</p>
            <p className="mt-0.5 text-[8px] text-muted">Parser pipeline · graph services · semantic layer</p>
          </div>
          <span className="flex max-w-[280px] items-center gap-1.5 truncate text-right text-[8px] text-[#70D991]" aria-live="polite">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#0FBF3E]" />
            {STREAM_EVENTS[streamIndex % STREAM_EVENTS.length]}
          </span>
        </div>

        <div className="relative h-[196px] overflow-hidden rounded-lg border border-white/[0.07] bg-[#0C1119]">
          <svg viewBox="0 0 660 196" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <marker id="github-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0 0 6 3 0 6Z" fill="#65758C" />
              </marker>
            </defs>
            {GRAPH_EDGES.map(([source, target], index) => {
              const from = NODE_BY_ID.get(source)!;
              const to = NODE_BY_ID.get(target)!;
              const sx = from.x + 112;
              const sy = from.y + 24;
              const tx = to.x;
              const ty = to.y + 24;
              const mid = (sx + tx) / 2;
              const highlighted = source === selectedNodeId || target === selectedNodeId;
              return (
                <path
                  key={`${source}-${target}`}
                  d={`M ${sx} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${tx - 5} ${ty}`}
                  fill="none"
                  stroke={highlighted ? "#0FBF3E" : "#526176"}
                  strokeWidth={highlighted ? 1.5 : 1}
                  strokeDasharray={index === streamIndex % GRAPH_EDGES.length ? "4 4" : undefined}
                  markerEnd="url(#github-arrow)"
                >
                  {index === streamIndex % GRAPH_EDGES.length && (
                    <animate attributeName="stroke-dashoffset" values="0;-16" dur="1.2s" repeatCount="indefinite" />
                  )}
                </path>
              );
            })}
          </svg>

          {GRAPH_NODES.map((node) => {
            const selected = selectedNodeId === node.id;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedNodeId(node.id)}
                title={`${node.kind} · ${node.detail}`}
                className={`absolute flex h-12 w-[112px] flex-col justify-center rounded-md border px-2 text-left transition-colors ${selected ? "bg-white/[0.08]" : "bg-ink-900 hover:bg-white/[0.05]"}`}
                style={{ left: node.x, top: node.y, borderColor: `${node.color}${selected ? "CC" : "66"}` }}
              >
                <span className="truncate text-[9px] font-semibold" style={{ color: node.color }}>{node.label}</span>
                <span className="mt-0.5 truncate text-[7px] text-muted">{node.detail}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-muted">
          {[
            ["#D9A441", "repository"], ["#7AB8FF", "service"], ["#3ECFB2", "parser"],
            ["#9B6CFF", "graph"], ["#E0A75B", "analytics"], ["#D785CA", "AI"], ["#76C78B", "store"],
          ].map(([color, label]) => (
            <span key={label} className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: color }} />{label}</span>
          ))}
          <span className="ml-auto text-muted/70">Select a node for details</span>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <Metric label="Modules" value={`${GRAPH_NODES.length}`} />
          <Metric label="Dependencies" value={`${GRAPH_EDGES.length}`} />
          <Metric label="Graph density" value={density} />
          <Metric label="Highest centrality" value={TOP_CENTRAL_NODES[0]?.label ?? "—"} />
        </div>

        <div className="mt-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-muted">Connection centrality</p>
            <p className="text-[8px] text-muted">degree · top modules</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {TOP_CENTRAL_NODES.map((node) => (
              <div key={node.id} className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-1 text-[8px]">
                  <span className="truncate text-parchment">{node.label}</span>
                  <span className="tabular-nums text-muted">{node.connections}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full" style={{ width: `${(node.connections / (TOP_CENTRAL_NODES[0]?.connections || 1)) * 100}%`, backgroundColor: node.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
          <div className="min-w-0">
            <p className="text-[8px] uppercase tracking-wide text-muted">Selected node · {selectedNode.kind}</p>
            <p className="truncate text-[9px] font-medium text-parchment">{selectedNode.label} <span className="font-normal text-muted">/ {selectedNode.detail}</span></p>
          </div>
          <span className="ml-3 shrink-0 text-[8px] tabular-nums text-[#70D991]">{GRAPH_EDGES.filter(([from, to]) => from === selectedNode.id || to === selectedNode.id).length} connections</span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-ink-700 pt-2">
          <div className="flex items-center gap-1">
            {(["Fetch", "Pull", "Push"] as const).map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => showMockResult(action)}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-ink-800 px-2.5 py-1.5 text-[9px] font-medium text-parchment transition-colors hover:border-[#0FBF3E]/40 hover:bg-[#0FBF3E]/10"
              >
                <GitIcon name={action.toLowerCase() as "fetch" | "pull" | "push"} />{action}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
            <input
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="Summary: update repository graph"
              aria-label="Commit summary"
              className="nodrag min-w-0 max-w-[235px] flex-1 rounded-md border border-white/[0.08] bg-ink-800 px-2 py-1.5 text-[9px] text-parchment outline-none placeholder:text-muted/70 focus:border-[#0FBF3E]/50"
            />
            <button
              type="button"
              disabled={!commitMessage.trim()}
              onClick={() => showMockResult("Commit")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#238636] px-2.5 py-1.5 text-[9px] font-semibold text-white transition-colors hover:bg-[#2EA043] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GitIcon name="commit" />Commit
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex h-4 items-center justify-between gap-2 text-[8px]" aria-live="polite">
          <span className="truncate text-muted">Stream {String((streamIndex % 4) + 1).padStart(2, "0")} · mock event updates every 2.4s</span>
          <span className="truncate text-[#70D991]">{notice}</span>
        </div>
      </div>
    </section>
  );
}