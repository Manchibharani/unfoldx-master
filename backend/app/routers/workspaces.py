from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..context import AppContext
from ..deps import Access, current_user, get_ctx, get_session, resolve_user, role_for, ws_access
from ..models import Agent, Member, Subtask, Task, User, Workspace
from ..schemas import MemberIn, WorkspaceCreate
from ..services.workspaces import create_workspace
from .serializers import agent_out, subtask_out, task_out

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

_TEXT_SUFFIXES = {".html", ".htm", ".css", ".js", ".mjs", ".json", ".md", ".txt", ".py", ".csv", ".svg", ".xml"}
# Most "build me an app" artifacts render as a whole page; prefer them for the
# auto-preview. Anything .md/.txt is still previewable but ranked lower.
_PREVIEW_SUFFIXES = (".html", ".htm")
_PREVIEW_PREFERRED_NAMES = ("index.html",)


def _previewable_file(root, files):
    """Pick the file to show in the auto-preview: index.html > any other .html > first text file."""
    for name in _PREVIEW_PREFERRED_NAMES:
        for f in files:
            if f["path"] == name:
                return f["path"]
    for f in files:
        if f["path"].rsplit("/", 1)[-1].rsplit(".", 1)[-1].lower() in ("html", "htm"):
            return f["path"]
    for f in files:
        if f["text"]:
            return f["path"]
    return None


def _safe_repo_path(ctx: AppContext, workspace_id: str, rel: str):
    """Resolve `rel` inside the workspace repo dir; reject traversal outside it."""
    root = ctx.settings.workspaces_root / workspace_id / "repo"
    p = (root / rel).resolve()
    if not str(p).startswith(str(root.resolve()) + "\\"):
        return None
    return p


async def _files_payload(ctx: AppContext, workspace_id: str):
    """Files agents actually produced in this workspace's repo (relative paths + sizes)."""
    root = ctx.settings.workspaces_root / workspace_id / "repo"
    if not root.exists():
        return []
    out = []
    for p in sorted(root.rglob("*")):
        if p.is_file() and "node_modules" not in p.parts and ".git" not in p.parts:
            out.append({"path": p.relative_to(root).as_posix(), "size": p.stat().st_size,
                        "text": p.suffix.lower() in _TEXT_SUFFIXES})
    return out


@router.get("/{workspace_id}/files")
async def list_files(workspace_id: str, ctx: AppContext = Depends(get_ctx),
                     a: Access = Depends(ws_access("view", "list workspace files"))):
    return await _files_payload(ctx, workspace_id)


@router.get("/{workspace_id}/files/content")
async def read_file(workspace_id: str, path: str, request: Request, ctx: AppContext = Depends(get_ctx),
                    session: AsyncSession = Depends(get_session), user: User | None = Depends(current_user_optional)):
    """File bytes for the Preview iframe. Always allowed in open mode (auth_mode=open): the
    browser cannot attach a bearer token to an iframe src, so this route MUST be guest-accessible
    for the preview to load. JWT mode keeps the normal role check."""
    if ctx.settings.auth_mode != "open":
        await authorize(ctx, session, workspace_id, user, "view", "read workspace file")
    p = _safe_repo_path(ctx, workspace_id, path)
    if p is None or not p.is_file():
        raise HTTPException(404, "file not found")
    return FileResponse(p)


@router.get("/{workspace_id}/files/preview")
async def preview_target(workspace_id: str, request: Request, ctx: AppContext = Depends(get_ctx),
                         session: AsyncSession = Depends(get_session), user: User | None = Depends(current_user_optional)):
    """Which file the Preview tab should auto-load ("" when nothing previewable exists yet).
    Open-mode accessible for the same iframe-token reason as files/content."""
    if ctx.settings.auth_mode != "open":
        await authorize(ctx, session, workspace_id, user, "view", "read workspace file")
    files = await _files_payload(ctx, workspace_id)
    return {"path": _previewable_file(ctx.settings.workspaces_root / workspace_id / "repo", files) or ""}


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
