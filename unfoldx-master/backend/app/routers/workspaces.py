from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..context import AppContext
from ..deps import Access, current_user, get_ctx, get_session, role_for, ws_access
from ..models import Agent, Member, Subtask, Task, User, Workspace
from ..schemas import MemberIn, WorkspaceCreate
from ..services.workspaces import create_workspace
from .serializers import agent_out, subtask_out, task_out

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


@router.post("", status_code=201)
async def create(body: WorkspaceCreate, ctx: AppContext = Depends(get_ctx), s: AsyncSession = Depends(get_session),
                 user: User = Depends(current_user)):
    try:
        ws = await create_workspace(ctx, s, body.name, user, body.id)
    except FileExistsError as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"id": ws.id, "name": ws.name, "role": "approve"}


@router.get("")
async def list_mine(ctx: AppContext = Depends(get_ctx), s: AsyncSession = Depends(get_session), user: User = Depends(current_user)):
    out = []
    for ws in (await s.execute(select(Workspace).order_by(Workspace.created_at))).scalars():
        role = await role_for(ctx, s, ws.id, user)
        if role:
            out.append({"id": ws.id, "name": ws.name, "role": role})
    return out


@router.get("/{workspace_id}")
async def get_one(a: Access = Depends(ws_access("view", "view workspace"))):
    return {"id": a.ws.id, "name": a.ws.name, "role": a.role, "owner_id": a.ws.owner_id}


@router.get("/{workspace_id}/state")
async def state(workspace_id: str, ctx: AppContext = Depends(get_ctx), s: AsyncSession = Depends(get_session),
                a: Access = Depends(ws_access("view", "view workspace"))):
    """One-shot canvas snapshot (agents, tasks/subtasks, providers, budgets). Live changes arrive over the WebSocket."""
    agents = (await s.execute(select(Agent).where(Agent.workspace_id == workspace_id))).scalars().all()
    tasks = (await s.execute(select(Task).where(Task.workspace_id == workspace_id).order_by(Task.created_at.desc()).limit(50))).scalars().all()
    subs = (await s.execute(select(Subtask).where(Subtask.task_id.in_([t.id for t in tasks])).order_by(Subtask.idx))).scalars().all()
    return {"workspace": {"id": a.ws.id, "name": a.ws.name, "role": a.role},
            "agents": [agent_out(x) for x in agents],
            "tasks": [{**task_out(t), "subtasks": [subtask_out(x) for x in subs if x.task_id == t.id]} for t in tasks],
            "providers": await ctx.entitlement.status(workspace_id), "budgets": await ctx.budget.all(workspace_id)}


@router.get("/{workspace_id}/members")
async def members(workspace_id: str, s: AsyncSession = Depends(get_session), a: Access = Depends(ws_access("view", "list members"))):
    rows = (await s.execute(select(Member, User).join(User, User.id == Member.user_id).where(Member.workspace_id == workspace_id))).all()
    return [{"user_id": u.id, "email": u.email, "name": u.name, "role": m.role} for m, u in rows]


@router.put("/{workspace_id}/members")
async def upsert_member(workspace_id: str, body: MemberIn, s: AsyncSession = Depends(get_session),
                        a: Access = Depends(ws_access("approve", "manage members"))):
    u = (await s.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if u is None:
        raise HTTPException(404, "no registered user with that email")
    if u.id == a.ws.owner_id and body.role != "approve":
        raise HTTPException(422, "the workspace owner must keep the 'approve' role")
    m = (await s.execute(select(Member).where(Member.workspace_id == workspace_id, Member.user_id == u.id))).scalar_one_or_none()
    if m:
        m.role = body.role
    else:
        s.add(Member(workspace_id=workspace_id, user_id=u.id, role=body.role))
    await s.commit()
    return {"user_id": u.id, "email": u.email, "role": body.role}


@router.delete("/{workspace_id}/members/{user_id}", status_code=204)
async def remove_member(workspace_id: str, user_id: str, s: AsyncSession = Depends(get_session),
                        a: Access = Depends(ws_access("approve", "manage members"))):
    if user_id == a.ws.owner_id:
        raise HTTPException(422, "cannot remove the workspace owner")
    m = (await s.execute(select(Member).where(Member.workspace_id == workspace_id, Member.user_id == user_id))).scalar_one_or_none()
    if m:
        await s.delete(m)
        await s.commit()
