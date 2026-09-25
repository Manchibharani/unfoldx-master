from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..catalog import CAPABILITIES, PROVIDERS
from ..context import AppContext
from ..deps import Access, get_ctx, get_session, ws_access
from ..models import Agent
from ..schemas import AgentCreate, AgentUpdate, ProviderConnectIn
from .serializers import agent_out

router = APIRouter(prefix="/api", tags=["providers & agents"])


@router.get("/providers/catalog")
async def catalog(ctx: AppContext = Depends(get_ctx)):
    """Supported providers, seed capability profiles, and whether each CLI is installed on this server."""
    return [{"provider": k, "display_name": v["display_name"], "capabilities": v["capabilities"], "pricing": v["pricing"],
             "cli_available": ctx.adapters[k].available(), "note": v.get("note")} for k, v in PROVIDERS.items()]


@router.get("/workspaces/{workspace_id}/providers")
async def list_providers(workspace_id: str, ctx: AppContext = Depends(get_ctx), a: Access = Depends(ws_access("view", "view providers"))):
    return await ctx.entitlement.status(workspace_id)


@router.post("/workspaces/{workspace_id}/providers", status_code=201)
async def connect(workspace_id: str, body: ProviderConnectIn, ctx: AppContext = Depends(get_ctx),
                  a: Access = Depends(ws_access("approve", "connect provider"))):
    try:
        return await ctx.entitlement.connect(
            workspace_id, body.provider, user_id=a.user.id, plan=body.plan, pricing=body.pricing, cap_usd=body.cap_usd,
            api_key=body.api_key.get_secret_value() if body.api_key else None)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.post("/workspaces/{workspace_id}/providers/{provider}/refresh")
async def refresh(workspace_id: str, provider: str, ctx: AppContext = Depends(get_ctx),
                  a: Access = Depends(ws_access("view", "refresh entitlement"))):
    if provider not in PROVIDERS:
        raise HTTPException(404, "unknown provider")
    ctx.entitlement._version_cache.pop(provider, None)
    return await ctx.entitlement.provider_status(workspace_id, provider)


@router.delete("/workspaces/{workspace_id}/providers/{provider}", status_code=204)
async def disconnect(workspace_id: str, provider: str, ctx: AppContext = Depends(get_ctx),
                     a: Access = Depends(ws_access("approve", "disconnect provider"))):
    if provider == "bob":
        raise HTTPException(409, "Bob is the Plan-mode conductor and cannot be disconnected")
    if not await ctx.entitlement.disconnect(workspace_id, provider):
        raise HTTPException(404, "provider not connected")


def _clean_caps(caps: dict[str, float] | None) -> dict[str, float] | None:
    if caps is None:
        return None
    bad = [k for k in caps if k not in CAPABILITIES]
    if bad or any(not 0 <= v <= 1 for v in caps.values()):
        raise HTTPException(422, f"capabilities must be in {CAPABILITIES} with scores in [0,1]")
    return caps


@router.get("/workspaces/{workspace_id}/agents")
async def list_agents(workspace_id: str, s: AsyncSession = Depends(get_session), a: Access = Depends(ws_access("view", "view agents"))):
    rows = (await s.execute(select(Agent).where(Agent.workspace_id == workspace_id).order_by(Agent.created_at))).scalars()
    return [agent_out(x) for x in rows]


@router.post("/workspaces/{workspace_id}/agents", status_code=201)
async def add_agent(workspace_id: str, body: AgentCreate, ctx: AppContext = Depends(get_ctx), s: AsyncSession = Depends(get_session),
                    a: Access = Depends(ws_access("control", "add agent"))):
    """'Drop an agent onto the canvas': create another runnable instance of a connected provider."""
    if await ctx.entitlement.get_conn(workspace_id, body.provider) is None:
        raise HTTPException(409, f"connect provider '{body.provider}' first")
    meta = PROVIDERS[body.provider]
    ag = Agent(workspace_id=workspace_id, provider=body.provider, name=body.name or meta["display_name"],
               model=body.model or meta["default_model"], capabilities=_clean_caps(body.capabilities) or dict(meta["capabilities"]))
    s.add(ag)
    await s.commit()
    return agent_out(ag)


@router.patch("/workspaces/{workspace_id}/agents/{agent_id}")
async def update_agent(workspace_id: str, agent_id: str, body: AgentUpdate, s: AsyncSession = Depends(get_session),
                       a: Access = Depends(ws_access("control", "edit agent"))):
    ag = await s.get(Agent, agent_id)
    if ag is None or ag.workspace_id != workspace_id:
        raise HTTPException(404, "agent not found")
    if body.name is not None:
        ag.name = body.name
    if body.model is not None:
        ag.model = body.model
    if body.capabilities is not None:
        ag.capabilities = _clean_caps(body.capabilities)
    if body.enabled is not None:
        ag.enabled = body.enabled
    await s.commit()
    return agent_out(ag)
