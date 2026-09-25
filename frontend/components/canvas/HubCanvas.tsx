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
import { LAYOUT, PROVIDER_ACCENT, type HubModel } from "@/lib/graph";
import type { ControlAction } from "@/lib/useOrchestration";
import type { Permissions } from "@/lib/permissions";
import { AgentNode, HubNode, SubtaskNode } from "./HubNodes";

const nodeTypes = { agent: AgentNode, hub: HubNode, subtask: SubtaskNode };

function buildFlow(model: HubModel, permissions: Permissions, onAction: (action: ControlAction) => void) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  model.subtasks.forEach((subtask, i) => {
    nodes.push({
      id: `subtask-${subtask.id}`,
      type: "subtask",
      position: { x: LAYOUT.subtaskX, y: i * LAYOUT.subtaskGap },
      data: { subtask, onAction, permissions },
    });
    edges.push({
      id: `decompose-${subtask.id}`,
      source: "hub-bob",
      target: `subtask-${subtask.id}`,
      type: "smoothstep",
      style: { stroke: "#2B3651", strokeDasharray: "4 4" },
    });
  });

  const hubY = Math.max(0, ((model.subtasks.length - 1) * LAYOUT.subtaskGap) / 2);
  nodes.push({
    id: "hub-bob",
    type: "hub",
    position: { x: LAYOUT.hubX, y: hubY },
    data: { agent: model.bob, subtaskCount: model.subtasks.length, onAction, permissions },
  });

  model.agents.forEach((agent, i) => {
    nodes.push({
      id: agent.id,
      type: "agent",
      position: { x: LAYOUT.agentX, y: i * LAYOUT.agentGap },
      data: { agent, onAction, permissions },
    });
  });

  model.subtasks.forEach((subtask) => {
    if (!subtask.provider) return;
    const target = subtask.provider === "bob" ? "hub-bob" : `agent-${subtask.provider}`;
    const accent = PROVIDER_ACCENT[subtask.provider];
    const running = subtask.status === "running";
    edges.push({
      id: `route-${subtask.id}`,
      source: `subtask-${subtask.id}`,
      target,
      type: "smoothstep",
      animated: running,
      style: { stroke: running ? accent : "#2B3651", strokeWidth: running ? 2 : 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: accent, width: 14, height: 14 },
    });
  });

  for (const conn of model.connections) {
    edges.push({
      id: conn.id,
      source: conn.source,
      target: conn.target,
      type: "smoothstep",
      animated: true,
      style: { stroke: "#8D7BE0", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#8D7BE0", width: 14, height: 14 },
    });
  }

  return { nodes, edges };
}

/** Keep user-moved positions and selection while refreshing node data. */
function mergeNodes(current: Node[], next: Node[]): Node[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  return next.map((n) => {
    const existing = byId.get(n.id);
    return existing ? { ...n, position: existing.position, selected: existing.selected } : n;
  });
}

export function HubCanvas({
  model,
  permissions,
  onAction,
}: {
  model: HubModel;
  permissions: Permissions;
  onAction: (action: ControlAction) => void;
}) {
  const derived = useMemo(() => buildFlow(model, permissions, onAction), [model, permissions, onAction]);
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
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.6}
        connectionRadius={44}
        connectionLineStyle={{ stroke: "#8D7BE0", strokeWidth: 1.5, strokeDasharray: "5 5" }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1F283B" />
        <Controls showInteractive={false} className="!rounded-md !border !border-ink-700 !shadow-lg" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) =>
            n.type === "hub" ? PROVIDER_ACCENT.bob : n.type === "agent" ? "#4FB8A6" : "#2B3651"
          }
          maskColor="rgba(11, 15, 23, 0.7)"
          className="!rounded-md !border !border-ink-700"
        />
      </ReactFlow>

      {connecting && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-sm border border-ledger-violet/40 bg-ink-900/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-ledger-violet shadow-lg backdrop-blur">
          Release over another node to wire them together
        </div>
      )}
    </div>
  );
}
