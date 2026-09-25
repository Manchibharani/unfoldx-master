import type { AgentState } from "@/lib/graph";
import type { BudgetSnapshot, Provider } from "@/lib/types";
import { ProviderBadge } from "./ProviderBadge";

interface LedgerEntry {
  provider: Provider;
  agentCount: number;
  spentUsd: number;
  capUsd: number;
  tokensUsed: number;
  breakerTripped: boolean;
  connected: boolean;
  labels: string[];
}

function aggregateAgents(agents: AgentState[]): Map<Provider, LedgerEntry> {
  const map = new Map<Provider, LedgerEntry>();
  for (const a of agents) {
    let e = map.get(a.provider);
    if (!e) {
      e = { provider: a.provider, agentCount: 0, spentUsd: 0, capUsd: 0, tokensUsed: 0, breakerTripped: false, connected: false, labels: [] };
      map.set(a.provider, e);
    }
    e.agentCount += 1;
    e.spentUsd += a.spentUsd;
    e.tokensUsed += a.tokensUsed;
    if (a.capUsd > e.capUsd) e.capUsd = a.capUsd;
    e.breakerTripped = e.breakerTripped || a.breakerTripped;
    e.connected = e.connected || a.connected;
    e.labels.push(a.label);
  }
  return map;
}

export function BudgetStrip({
  budgets,
  agents,
}: {
  budgets: Map<Provider, BudgetSnapshot>;
  agents: AgentState[];
}) {
  const structural = aggregateAgents(agents);
  const entries = [...budgets.entries()].map(([provider, b]) => {
    const s = structural.get(provider);
    return {
      provider,
      agentCount: s?.agentCount ?? 0,
      spentUsd: b.spent_usd,
      capUsd: b.cap_usd,
      tokensUsed: b.tokens_used,
      breakerTripped: b.circuit_breaker_tripped,
      connected: s?.connected ?? false,
      labels: s?.labels ?? [],
    };
  });

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-700 px-3 py-4 text-center text-xs text-muted/60">
        Waiting for budget data — nothing spent yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      {entries.map((e) => {
        const pct = e.capUsd > 0 ? Math.min(100, (e.spentUsd / e.capUsd) * 100) : 0;
        const barColor = e.breakerTripped ? "#EA7568" : pct > 80 ? "#D9A441" : "#3ECFB2";
        return (
          <div key={e.provider} className="rounded-xl border border-ink-700 bg-ink-800/50 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <ProviderBadge provider={e.provider} />
                {e.agentCount > 1 && (
                  <span className="whitespace-nowrap rounded-full bg-ink-700 px-2 py-0.5 text-[9px] text-muted">
                    ×{e.agentCount}
                  </span>
                )}
              </div>
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-parchment/90">
                ${e.spentUsd.toFixed(3)} / {e.capUsd > 0 ? `$${e.capUsd.toFixed(2)}` : "—"}
              </span>
            </div>

            {e.agentCount > 1 && (
              <p className="mt-1.5 truncate text-[10px] text-muted" title={e.labels.join(", ")}>
                {e.labels.join(", ")}
              </p>
            )}

            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-700">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: barColor }}
              />
            </div>

            <div className="mt-1.5 flex items-center justify-between text-[10px]">
              <span className={e.connected ? "text-state-running" : "text-muted/60"}>{e.connected ? "connected" : "not connected"}</span>
              <span className="tabular-nums text-muted">{e.tokensUsed.toLocaleString()} tok</span>
            </div>

            {e.breakerTripped && (
              <p className="mt-1.5 rounded-lg border border-state-conflict/30 bg-state-conflict/10 px-2 py-1 text-[10px] text-state-conflict">
                circuit breaker tripped — dispatch paused
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}