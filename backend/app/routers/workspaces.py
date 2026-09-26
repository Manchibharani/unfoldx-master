import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..context import AppContext
from ..deps import Access, authorize, current_user, current_user_optional, get_ctx, get_session, role_for, ws_access
from ..models import Agent, Member, Subtask, Task, User, Workspace
from ..schemas import MemberIn, WorkspaceCreate
from ..services.workspaces import create_workspace
from ..services.architecture import scan_architecture
from .serializers import agent_out, subtask_out, task_out

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

_TEXT_SUFFIXES = {".html", ".htm", ".css", ".js", ".mjs", ".json", ".md", ".txt", ".py", ".csv", ".svg", ".xml"}
# Most "build me an app" artifacts render as a whole page; prefer them for the
# auto-preview. Anything .md/.txt is still previewable but ranked lower.
_PREVIEW_SUFFIXES = (".html", ".htm")
_PREVIEW_PREFERRED_NAMES = ("index.html",)


def _previewable_file(files):
    """Pick the file to show in the auto-preview. The NEWEST html wins (agents iterate:
    the latest build is the current state of the app), with root-level standalone
    artifacts preferred over equally-fresh bundled ones."""
    def is_html(path):
        return path.rsplit("/", 1)[-1].rsplit(".", 1)[-1].lower() in ("html", "htm")
    html_files = [f for f in files if is_html(f["path"])]
    if html_files:
        newest = max(int(f.get("mtime_ns", 0)) for f in html_files)
        window = 2_000_000_000 if newest > 2_000_000_000 else 0  # 2s real-clock grouping
        freshest = [f for f in html_files if int(f.get("mtime_ns", 0)) >= newest - window]
        root = [f for f in freshest if "/" not in f["path"]]
        for name in _PREVIEW_PREFERRED_NAMES:
            hit = next((f for f in (root or freshest) if f["path"] == name or f["path"].endswith("/" + name)), None)
            if hit:
                # Bundled SPA (dist/index.html) beats the unbundled source page: the dist
                # build is what actually renders as a website.
                if hit["path"].count("/") > 0:
                    bundled = [f for f in freshest if f["path"] != hit["path"] and "/dist/" in f["path"]]
                    if bundled:
                        return min(bundled, key=lambda f: (f["path"].count("/"), f["path"]))["path"]
                return hit["path"]
        pool = root or freshest
        return min(pool, key=lambda f: (f["path"].count("/"), f["path"]))["path"]
    for f in files:
        if f["text"]:
            return f["path"]
    return None


def _safe_repo_path(ctx: AppContext, workspace_id: str, rel: str):
    """Resolve `rel` inside the workspace repo dir; reject traversal outside it."""
    root = ctx.settings.workspaces_root / workspace_id / "repo"
    p = (root / rel).resolve()
    if not p.is_relative_to(root.resolve()):
        return None
    return p


async def _files_payload(ctx: AppContext, workspace_id: str):
    """Files agents actually produced in this workspace's repo (relative paths + sizes)."""
    root = ctx.settings.workspaces_root / workspace_id / "repo"
    if not root.exists():
        return []
    out = []
    for p in sorted(root.rglob("*")):
        if p.is_file() and "node_modules" not in p.parts and ".git" not in p.parts and "__pycache__" not in p.parts:
            try:
                mtime_ns = p.stat().st_mtime_ns
            except OSError:
                continue
            out.append({"path": p.relative_to(root).as_posix(), "size": p.stat().st_size,
                        "text": p.suffix.lower() in _TEXT_SUFFIXES, "mtime_ns": mtime_ns})
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
    for the preview to load. JWT mode keeps the normal role check.

    For a bundled SPA (dist/index.html), root-absolute asset/script paths are rewritten to this
    endpoint (base = the file's directory), so /assets/x.js and /images/x.png load from the same
    origin and the built site renders inside the iframe."""
    if ctx.settings.auth_mode != "open":
        await authorize(ctx, session, workspace_id, user, "view", "read workspace file")
    p = _safe_repo_path(ctx, workspace_id, path)
    if p is None or not p.is_file():
        raise HTTPException(404, "file not found")
    if p.suffix.lower() in (".html", ".htm"):
        try:
            html = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            html = ""
        if html and re.search(r"(?:src|href)=[\"']/", html):
            base = path.rsplit("/", 1)[0] if "/" in path else ""
            endpoint = f"/api/workspaces/{workspace_id}/files/content"

            def _rebase(m: "re.Match[str]") -> str:
                attr, quote, val = m.group(1), m.group(2), m.group(3)
                if val.startswith("//") or val.startswith("http:") or val.startswith("https:") or val.startswith("#"):
                    return m.group(0)  # external/anchor: leave alone
                joined = f"{base}/{val.lstrip('/')}" if base else val.lstrip("/")
                return f'{attr}={quote}{endpoint}?path={joined}{quote}'

            html = re.sub(r"(src|href)=(['\"])(/[^'\"]*)\2", _rebase, html)
            return HTMLResponse(html)
    return FileResponse(p)


@router.get("/{workspace_id}/files/preview")
async def preview_target(workspace_id: str, request: Request, ctx: AppContext = Depends(get_ctx),
                         session: AsyncSession = Depends(get_session), user: User | None = Depends(current_user_optional)):
    """Which file the Preview tab should auto-load ("" when nothing previewable exists yet).
    Open-mode accessible for the same iframe-token reason as files/content."""
    if ctx.settings.auth_mode != "open":
        await authorize(ctx, session, workspace_id, user, "view", "read workspace file")
    files = await _files_payload(ctx, workspace_id)
    return {"path": _previewable_file(files) or ""}


@router.get("/{workspace_id}/architecture")
async def architecture(workspace_id: str, ctx: AppContext = Depends(get_ctx),
                       a: Access = Depends(ws_access("view", "view workspace architecture"))):
    """The REAL module graph of this workspace's repo (files + import edges), for the
    GitHub architecture visualiser panel."""
    return scan_architecture(ctx.settings.workspaces_root / workspace_id / "repo")


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
