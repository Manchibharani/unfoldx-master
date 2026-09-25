"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useWorkspaceSocket } from "@/lib/useWorkspaceSocket";
import { buildHub, type HubSelection } from "@/lib/graph";
import { useOrchestration } from "@/lib/useOrchestration";
import { useAuth } from "@/lib/useAuth";
import { ConnectionStatus } from "./ConnectionStatus";
import { AuthBar } from "./AuthBar";
import { ChainBadge } from "./ChainBadge";
import { BudgetStrip } from "./BudgetStrip";
import { EventFeed } from "./EventFeed";
import { AskBob } from "./AskBob";
import { AgentRail } from "./AgentRail";
import { Inspector } from "./Inspector";

// React Flow measures the DOM, so it only mounts on the client.
const HubCanvas = dynamic(() => import("./canvas/HubCanvas").then((m) => m.HubCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[560px] w-full items-center justify-center rounded-md border border-ink-700 bg-ink-950 text-sm text-muted">
      Loading canvas…
    </div>
  ),
});

const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID ?? "demo-workspace";

export function Workspace() {
  const auth = useAuth(WORKSPACE_ID);
  const { events, budgets, connectionState } = useWorkspaceSocket(WORKSPACE_ID, auth.token);
  const { overrides, queue, send } = useOrchestration(WORKSPACE_ID);
  const [selection, setSelection] = useState<HubSelection>(null);

  const hub = useMemo(() => buildHub(events, overrides), [events, overrides]);
  const ledgerAgents = useMemo(() => [hub.bob, ...hub.agents], [hub]);
  const demoEnabled =
    process.env.NEXT_PUBLIC_MOCK !== "1" &&
    connectionState === "connected" &&
    auth.permissions.canControl;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col gap-4 px-4 py-4 sm:px-6 2xl:px-10 2xl:py-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-parchment">UnfoldX</h1>
          <p className="mt-1 font-mono text-[11px] text-muted">workspace/{WORKSPACE_ID}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <AuthBar
            status={auth.status}
            user={auth.user}
            role={auth.role}
            busy={auth.busy}
            error={auth.error}
            onLogin={auth.login}
            onRegister={auth.register}
            onLogout={auth.logout}
          />
          <div className="flex items-center gap-3">
            <ConnectionStatus state={connectionState} />
            <span className="hidden text-[11px] tabular-nums text-state-inactive sm:inline">
              {hub.agents.length + 1} agents · {hub.subtasks.length} routes · {queue.length} controls
            </span>
          </div>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 items-start gap-3 xl:grid-cols-[216px_minmax(0,1fr)_360px]">
        <div className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <AgentRail
            agents={ledgerAgents}
            selection={selection}
            permissions={auth.permissions}
            demoEnabled={demoEnabled}
            onSelect={setSelection}
            onAction={send}
          />
          <section className="mt-3 rounded-lg border border-ink-700 bg-ink-900/70 p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Budget ledger</h2>
            <BudgetStrip budgets={budgets} agents={ledgerAgents} />
          </section>
        </div>

        <section className="flex min-w-0 flex-col gap-3">
          <div className="relative h-[62vh] min-h-[520px] overflow-hidden rounded-lg border border-ink-700 bg-ink-950 shadow-xl shadow-black/20">
            <HubCanvas
              model={hub}
              permissions={auth.permissions}
              onAction={send}
              selection={selection}
              onSelectionChange={setSelection}
            />
            <div className="pointer-events-none absolute right-3 top-3 z-10">
              <ChainBadge workspaceId={WORKSPACE_ID} eventsLen={events.length} />
            </div>
          </div>
          <AskBob onAction={send} events={events} permissions={auth.permissions} />
        </section>

        <Inspector agents={ledgerAgents} selection={selection} subtasks={hub.subtasks} events={events} />
      </div>

      <details className="rounded-md border border-ink-700 bg-ink-900/60">
        <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-muted hover:text-parchment">
          View execution details
        </summary>
        <div className="border-t border-ink-700 p-3">
          <EventFeed events={events} />
        </div>
      </details>
    </main>
  );
}