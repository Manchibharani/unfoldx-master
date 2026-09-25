from fastapi import APIRouter, Depends, HTTPException

from ..catalog import PROVIDERS
from ..context import AppContext
from ..deps import Access, get_ctx, ws_access
from ..schemas import BudgetCapIn, OverrideIn

router = APIRouter(prefix="/api/workspaces/{workspace_id}/budget", tags=["budget"])


@router.get("")
async def budgets(workspace_id: str, ctx: AppContext = Depends(get_ctx), a: Access = Depends(ws_access("view", "view budget"))):
    rows = await ctx.budget.all(workspace_id)
    return {"providers": rows, "total_spent_usd": round(sum(r["spent_usd"] for r in rows), 6),
            "total_cap_usd": round(sum(r["cap_usd"] for r in rows), 6)}


async def _announce(ctx: AppContext, workspace_id: str, provider: str, st: dict, who: str, override: bool, extra: dict) -> None:
    await ctx.events.append(workspace_id, "budget_update", {
        "provider": provider, "spent_usd": st["spent_usd"], "cap_usd": st["cap_usd"], "remaining_usd": st["remaining_usd"],
        "breaker": st["breaker_state"], "override": override, "by": who, **extra}, provider=provider)


@router.put("/{provider}")
async def set_cap(workspace_id: str, provider: str, body: BudgetCapIn, ctx: AppContext = Depends(get_ctx),
                  a: Access = Depends(ws_access("approve", "change budget cap"))):
    if provider not in PROVIDERS or await ctx.budget.state(workspace_id, provider) is None:
        raise HTTPException(404, "provider not connected")
    st = await ctx.budget.set_cap(workspace_id, provider, body.cap_usd)
    await _announce(ctx, workspace_id, provider, st, a.user.email, False, {"detail": f"cap set to ${body.cap_usd:.2f}"})
    if st["breaker_state"] == "closed":
        await ctx.orchestrator.resume_paused(workspace_id)
    return st


@router.post("/{provider}/override")
async def override(workspace_id: str, provider: str, body: OverrideIn, ctx: AppContext = Depends(get_ctx),
                   a: Access = Depends(ws_access("approve", "approve budget override"))):
    """Approver-only: raise the cap, close the breaker, and resume paused subtasks. Recorded in the hash chain."""
    if provider not in PROVIDERS or await ctx.budget.state(workspace_id, provider) is None:
        raise HTTPException(404, "provider not connected")
    st = await ctx.budget.override(workspace_id, provider, body.additional_usd)
    await _announce(ctx, workspace_id, provider, st, a.user.email, True,
                    {"detail": f"override +${body.additional_usd:.2f}", "reason": body.reason})
    resumed = await ctx.orchestrator.resume_paused(workspace_id)
    return {**st, "resumed_subtasks": resumed}
