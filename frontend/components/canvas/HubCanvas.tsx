"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection as RFConnection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LAYOUT, PROVIDER_ACCENT, type HubModel, type HubSelection } from "@/lib/graph";
import type { ControlAction } from "@/lib/useOrchestration";
import type { Permissions } from "@/lib/permissions";
import { AgentNode, HubNode, SubtaskNode } from "./HubNodes";

const nodeTypes = { agent: AgentNode, hub: HubNode, subtask: SubtaskNode };

function buildFlow(
  model: HubModel,
  permissions: Permissions,
  onAction: (action: ControlAction) => void,
  selection: HubSelection,
  removedNodeIds: Set<string>,
  onRemoveNode: (nodeId: string) => void
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const visibleSubtasks = model.subtasks.filter((subtask) => !removedNodeIds.has(`subtask-${subtask.id}`));
  const visibleAgents = model.agents.filter((agent) => !removedNodeIds.has(agent.id));

  visibleSubtasks.forEach((subtask, i) => {
    const nodeId = `subtask-${subtask.id}`;
    nodes.push({
      id: nodeId,
      type: "subtask",
      selected: selection?.kind === "subtask" && selection.id === subtask.id,
      position: { x: LAYOUT.subtaskX, y: i * LAYOUT.subtaskGap },
      data: { subtask, onAction, permissions, onRemoveNode },
    });
    edges.push({
      id: `decompose-${subtask.id}`,
      source: "hub-bob",
      target: nodeId,
      type: "smoothstep",
      style: { stroke: "#243357", strokeDasharray: "4 4" },
    });
  });

  const hubY = Math.max(0, ((visibleSubtasks.length - 1) * LAYOUT.subtaskGap) / 2);
  nodes.push({
    id: "hub-bob",
    type: "hub",
    selected: selection?.kind === "agent" && selection.id === "hub-bob",
    position: { x: LAYOUT.hubX, y: hubY },
    data: { agent: model.bob, subtaskCount: model.subtasks.length, onAction, permissions },
  });

  visibleAgents.forEach((agent, i) => {
    nodes.push({
      id: agent.id,
      type: "agent",
      selected: selection?.kind === "agent" && selection.id === agent.id,
      position: { x: LAYOUT.agentX, y: i * LAYOUT.agentGap },
      data: { agent, onAction, permissions, onRemoveNode },
    });
  });

  visibleSubtasks.forEach((subtask) => {
    if (!subtask.provider) return;
    const target = subtask.provider === "bob" ? "hub-bob" : `agent-${subtask.provider}`;
    const running = subtask.status === "running";
    const handedOff = subtask.status === "done";
    const conflict = subtask.conflict;
    const color = conflict ? "#EA7568" : running || handedOff ? "#3ECFB2" : "#7C6EE8";
    edges.push({
      id: `route-${subtask.id}`,
      source: `subtask-${subtask.id}`,
      target,
      type: "smoothstep",
      animated: running,
      className: handedOff ? "handoff-edge" : undefined,
      label: conflict ? "CONFLICT" : running ? "ROUTING" : handedOff ? "HANDOFF" : undefined,
      labelStyle: { fill: color, fontSize: 9, fontWeight: 600 },
      labelBgStyle: { fill: "#0B0F17", fillOpacity: 0.9 },
      style: { stroke: color, strokeWidth: running || handedOff || conflict ? 2 : 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    });
  });

  for (const conn of model.connections) {
    edges.push({
      id: conn.id,
      source: conn.source,
      target: conn.target,
      type: "smoothstep",
      animated: false,
      style: { stroke: "#7C6EE8", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#7C6EE8", width: 14, height: 14 },
    });
  }

  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)),
  };
}

/** Keep user-moved positions and selection while refreshing node data. */
function mergeNodes(current: Node[], next: Node[]): Node[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  return next.map((n) => {
    const existing = byId.get(n.id);
    return existing ? { ...n, position: existing.position, selected: n.selected ?? existing.selected } : n;
  });
}

export function HubCanvas({
  model,
  permissions,
  onAction,
  selection,
  onSelectionChange,
}: {
  model: HubModel;
  permissions: Permissions;
  onAction: (action: ControlAction) => void;
  selection: HubSelection;
  onSelectionChange: (selection: HubSelection) => void;
}) {
  const [removedNodeIds, setRemovedNodeIds] = useState<Set<string>>(() => new Set());
  const onRemoveNode = useCallback((nodeId: string) => {
    if (nodeId === "hub-bob") return;
    setRemovedNodeIds((current) => new Set(current).add(nodeId));
    onSelectionChange(null);
  }, [onSelectionChange]);
  const derived = useMemo(
    () => buildFlow(model, permissions, onAction, selection, removedNodeIds, onRemoveNode),
    [model, permissions, onAction, selection, removedNodeIds, onRemoveNode]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(derived.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(derived.edges);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setNodes((current) => mergeNodes(current, derived.nodes));
    setEdges(derived.edges);
  }, [derived, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: RFConnection) => {
      setConnecting(false);
      if (!connection.source || !connection.target) return;
      onAction({ kind: "connect", source: connection.source, target: connection.target });
    },
    [onAction]
  );

  const onConnectStart = useCallback((event: unknown) => {
    void event;
    setConnecting(true);
  }, []);

  const onConnectEnd = useCallback((event: unknown) => {
    void event;
    setConnecting(false);
  }, []);

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) onAction({ kind: "disconnect", connectionId: edge.id });
    },
    [onAction]
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={(_, node) => {
          if (node.type === "hub") onSelectionChange({ kind: "agent", id: "hub-bob" });
          else if (node.type === "agent") onSelectionChange({ kind: "agent", id: node.id });
          else if (node.type === "subtask") onSelectionChange({ kind: "subtask", id: node.id.replace(/^subtask-/, "") });
        }}
        onEdgeClick={(_, edge) => {
          if (edge.id.startsWith("route-")) {
            onSelectionChange({ kind: "subtask", id: edge.id.slice("route-".length) });
          }
        }}
        onPaneClick={() => onSelectionChange(null)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.6}
        connectionRadius={44}
        connectionLineStyle={{ stroke: "#7C6EE8", strokeWidth: 1.5, strokeDasharray: "5 5" }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1A2847" />
        <Controls showInteractive={false} className="!rounded-xl !border !border-ink-700 !shadow-lg" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) =>
            n.type === "hub" ? PROVIDER_ACCENT.bob : n.type === "agent" ? "#3ECFB2" : "#243357"
          }
          maskColor="rgba(8, 13, 24, 0.75)"
          className="!rounded-xl !border !border-ink-700"
        />
      </ReactFlow>

      {connecting && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-xl border border-accent-indigo/40 bg-ink-900/90 px-4 py-2 text-[10px] uppercase tracking-wide text-state-orchestration shadow-xl backdrop-blur">
          Release over another node to wire them together
        </div>
      )}
    </div>
  );
}
