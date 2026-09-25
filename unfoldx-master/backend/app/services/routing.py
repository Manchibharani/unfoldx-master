"""Capability- and cost-aware routing with an explanation trail (capability fit, cost, remaining quota).

score = 0.6*capability_fit + 0.2*cost_efficiency + 0.2*budget_headroom (+0.03 Bob tie-break: it is the
conductor). Providers with an open circuit breaker / exhausted quota are excluded. Agents whose CLI is
not installed on this host are excluded from scoring whenever at least one genuinely-available CLI
exists, so routing prefers a real executor over a simulated one; when NO CLI is installed the
high-scoring candidate still wins and the clearly-labelled simulated run is used (demo mode)."""
from __future__ import annotations

from dataclasses import dataclass, field

from ..catalog import estimate_cost

W_FIT, W_COST, W_QUOTA, BOB_BONUS = 0.6, 0.2, 0.2, 0.03
DEFAULT_CAP_SCORE = 0.3
EST_OUT_TOKENS = 3000  # assumption used only for *pre-dispatch* cost estimates


@dataclass
class Candidate:
    agent_id: str
    provider: str
    name: str
    capabilities: dict
    pricing: dict
    budget: dict                     # BudgetService state dict
    enabled: bool = True
    quota_requests_remaining: int | None = None
    cli_available: bool = True       # provider CLI installed on this host (adapter.available())


@dataclass
class RouteDecision:
    agent_id: str
    provider: str
    score: float
    est_cost_usd: float
    remaining_usd: float
    rationale: str
    breakdown: dict = field(default_factory=dict)


class RouteFailure(Exception):
    def __init__(self, reason: str, budget_blocked: bool = False):
        super().__init__(reason)
        self.reason, self.budget_blocked = reason, budget_blocked


def est_tokens(description: str) -> tuple[int, int]:
    return max(500, len(description) // 4 + 1500), EST_OUT_TOKENS


def choose(capabilities: list[str], description: str, candidates: list[Candidate], *,
           forced_agent_id: str | None = None, exclude: set[str] | None = None) -> RouteDecision:
    exclude = exclude or set()
    tin, tout = est_tokens(description)
    viable: list[tuple[Candidate, float]] = []
    reasons: list[str] = []
    budget_blocked = False
    # Prefer a real run: while ANY candidate has a genuinely-usable installed CLI (enabled, not
    # budget/quota-blocked), agents with no CLI on this host are excluded from scoring so the best *real*
    # executor wins instead of a simulated run. When every usable real CLI is absent, the high-scoring
    # candidate still wins (the clearly-labelled simulated run keeps the demo alive). A forced / redirect
    # target is respected regardless (explicit user override).
    def _usable_cli(c: Candidate) -> bool:
        return c.enabled and c.cli_available \
            and c.budget["breaker_state"] != "open" and c.budget["remaining_usd"] > 0 \
            and (c.quota_requests_remaining is None or c.quota_requests_remaining > 0)
    real_eligible = any(_usable_cli(c) for c in candidates if c.agent_id not in exclude)
    for c in candidates:
        if c.agent_id in exclude:
            continue
        if not c.enabled:
            reasons.append(f"{c.name}: disabled")
            continue
        if real_eligible and not forced_agent_id and not c.cli_available:
            reasons.append(f"{c.name}: CLI not installed")
            continue
        if c.budget["breaker_state"] == "open" or c.budget["remaining_usd"] <= 0:
            reasons.append(f"{c.name}: budget cap reached")
            budget_blocked = True
            continue
        if c.quota_requests_remaining is not None and c.quota_requests_remaining <= 0:
            reasons.append(f"{c.name}: monthly request quota exhausted")
            budget_blocked = True
            continue
        viable.append((c, estimate_cost(c.pricing, tin, tout)))
    if forced_agent_id:
        viable = [(c, e) for c, e in viable if c.agent_id == forced_agent_id]
        if not viable:
            raise RouteFailure(f"requested agent unavailable ({'; '.join(reasons) or 'not connected/enabled'})", budget_blocked)
    if not viable:
        raise RouteFailure("no agent available: " + ("; ".join(reasons) or "no providers connected"), budget_blocked)

    max_est = max(e for _, e in viable) or 0.0
    scored = []
    for c, est in viable:
        fit = sum(c.capabilities.get(cap, DEFAULT_CAP_SCORE) for cap in capabilities) / max(1, len(capabilities))
        cost_eff = 1.0 - (est / max_est if max_est > 0 else 0.0)
        cap = c.budget["cap_usd"]
        headroom = min(1.0, c.budget["remaining_usd"] / cap) if cap > 0 else 0.0
        total = W_FIT * fit + W_COST * cost_eff + W_QUOTA * headroom + (BOB_BONUS if c.provider == "bob" else 0.0)
        scored.append((total, c, est, {"capability_fit": round(fit, 3), "cost_efficiency": round(cost_eff, 3),
                                        "budget_headroom": round(headroom, 3), "est_cost_usd": round(est, 5),
                                        "score": round(total, 4)}))
    scored.sort(key=lambda t: t[0], reverse=True)
    best_score, best, est, bd = scored[0]
    others = ", ".join(f"{c.name} {s:.2f}" for s, c, _, _ in scored[1:4])
    why = "explicitly requested" if forced_agent_id else "highest combined score"
    rationale = (f"{best.name} ({why}) for [{', '.join(capabilities)}]: capability fit {bd['capability_fit']:.2f}, "
                 f"est. cost ${est:.3f}, ${best.budget['remaining_usd']:.2f} of ${best.budget['cap_usd']:.2f} budget left"
                 + (f". Runners-up: {others}" if others else "") + (f". Skipped: {'; '.join(reasons)}" if reasons else ""))
    bd["candidates"] = [{"agent_id": c.agent_id, "provider": c.provider, **b} for _, c, _, b in scored]
    return RouteDecision(best.agent_id, best.provider, round(best_score, 4), est, best.budget["remaining_usd"], rationale, bd)
