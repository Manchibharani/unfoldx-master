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
      <div className="rounded-md border border-dashed border-ink-700 px-3 py-3 text-xs text-muted/60">
        Waiting for budget data — nothing spent yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {entries.map((e) => {
        const pct = e.capUsd > 0 ? Math.min(100, (e.spentUsd / e.capUsd) * 100) : 0;
        return (
          <div key={e.provider} className="rounded-md border border-ink-700 bg-ink-900 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <ProviderBadge provider={e.provider} />
                {e.agentCount > 1 && (
                  <span className="whitespace-nowrap rounded-sm bg-ink-800 px-1 py-0.5 font-mono text-[9px] text-muted/80">
                    ×{e.agentCount}
                  </span>
                )}
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted">
                ${e.spentUsd.toFixed(3)} / {e.capUsd > 0 ? `$${e.capUsd.toFixed(2)}` : "—"}
              </span>
            </div>

            {e.agentCount > 1 && (
              <p className="mt-1 truncate text-[10px] text-muted/50" title={e.labels.join(", ")}>
                {e.labels.join(", ")}
              </p>
            )}

            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  e.breakerTripped ? "bg-ledger-coral" : "bg-ledger-teal"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="mt-1 flex items-center justify-between text-[10px] text-muted/70">
              <span>{e.connected ? "connected" : "not connected"}</span>
              <span className="font-mono">{e.tokensUsed.toLocaleString()} tok</span>
            </div>

            {e.breakerTripped && (
              <p className="mt-1 text-[10px] text-ledger-coral">circuit breaker tripped — dispatch paused</p>
            )}
          </div>
        );
      })}
    </div>
  );
}