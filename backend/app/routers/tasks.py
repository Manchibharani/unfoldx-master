import re
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..context import AppContext
from ..deps import Access, authorize, current_user, get_ctx, get_session, ws_access
from ..models import Attachment, HandoffObject, Route, Subtask, Task, User
from ..schemas import RedirectIn, TaskCreate
from .serializers import handoff_out, route_out, subtask_out, task_out

router = APIRouter(prefix="/api", tags=["tasks"])


@router.post("/workspaces/{workspace_id}/tasks", status_code=202)
async def create_task(workspace_id: str, body: TaskCreate, ctx: AppContext = Depends(get_ctx),
                      a: Access = Depends(ws_access("control", "submit task"))):
    """Returns immediately (202); progress streams over the WebSocket. Planning runs on Bob if a
    connected, enabled Bob is present, else falls back to heuristic decomposition."""
    try:
        t = await ctx.orchestrator.submit_task(workspace_id, a.user.id, body.prompt, body.attachment_ids)
    except LookupError as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return task_out(t)


@router.get("/workspaces/{workspace_id}/tasks")
async def list_tasks(workspace_id: str, limit: int = 50, s: AsyncSession = Depends(get_session),
                     a: Access = Depends(ws_access("view", "list tasks"))):
    rows = (await s.execute(select(Task).where(Task.workspace_id == workspace_id).order_by(Task.created_at.desc())
                            .limit(min(max(limit, 1), 200)))).scalars()
    return [task_out(t) for t in rows]


async def _task_for(ctx: AppContext, s: AsyncSession, user: User, task_id: str, needed: str, action: str):
    t = await s.get(Task, task_id)
    if t is None:
        raise HTTPException(404, "task not found")
    acc = await authorize(ctx, s, t.workspace_id, user, needed, action, task_id=task_id)
    return t, acc


@router.get("/tasks/{task_id}")
async def get_task(task_id: str, ctx: AppContext = Depends(get_ctx), s: AsyncSession = Depends(get_session),
                   user: User = Depends(current_user)):
    t, _ = await _task_for(ctx, s, user, task_id, "view", "view task")
    subs = (await s.execute(select(Subtask).where(Subtask.task_id == task_id).order_by(Subtask.idx))).scalars().all()
    ids = [x.id for x in subs]
    routes = (await s.execute(select(Route).where(Route.subtask_id.in_(ids)).order_by(Route.created_at))).scalars().all()
    hands = (await s.execute(select(HandoffObject).where(HandoffObject.task_id == task_id))).scalars().all()
    return {**task_out(t), "subtasks": [subtask_out(x) for x in subs], "routes": [route_out(r) for r in routes],
            "handoffs": [handoff_out(h) for h in hands]}


def _can_stop(acc: Access, task: Task) -> bool:
    """Watchers can't stop anything; only the task owner or an approver can (doc: 'stop or approve overrides')."""
    return acc.role == "approve" or task.created_by == acc.user.id


@router.post("/tasks/{task_id}/stop")
async def stop_task(task_id: str, ctx: AppContext = Depends(get_ctx), s: AsyncSession = Depends(get_session),
                    user: User = Depends(current_user)):
    t, acc = await _task_for(ctx, s, user, task_id, "control", "stop task")
    if not _can_stop(acc, t):
        await ctx.events.append(t.workspace_id, "authorization_denied", {
            "detail": f"{user.email} tried to stop a task they do not own", "user": user.email, "role": acc.role,
            "required": "task owner or approve", "action": "stop task"}, task_id=task_id)
        raise HTTPException(403, "only the task owner or an approver can stop this task")
    if not await ctx.orchestrator.stop_task(task_id, user.email):
        raise HTTPException(409, f"task is not running (status: {t.status})")
    return {"status": "stopped"}


@router.post("/tasks/{task_id}/subtasks/{subtask_id}/redirect")
async def redirect(task_id: str, subtask_id: str, body: RedirectIn, ctx: AppContext = Depends(get_ctx),
                   s: AsyncSession = Depends(get_session), user: User = Depends(current_user)):
    t, acc = await _task_for(ctx, s, user, task_id, "control", "redirect subtask")
    if not _can_stop(acc, t):
        await ctx.events.append(t.workspace_id, "authorization_denied", {
            "detail": f"{user.email} tried to redirect work on a task they do not own", "user": user.email, "role": acc.role,
            "required": "task owner or approve", "action": "redirect subtask"}, task_id=task_id)
        raise HTTPException(403, "only the task owner or an approver can redirect this task")
    try:
        return {"status": await ctx.orchestrator.redirect_subtask(task_id, subtask_id, user.email, body.agent_id, body.instruction)}
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))


# ---------------------------------------------------------------- attachments
_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


@router.post("/workspaces/{workspace_id}/attachments", status_code=201)
async def upload(workspace_id: str, file: UploadFile = File(...), ctx: AppContext = Depends(get_ctx),
                 s: AsyncSession = Depends(get_session), a: Access = Depends(ws_access("control", "upload attachment"))):
    name = _SAFE.sub("_", (file.filename or "file").rsplit("/", 1)[-1].rsplit("\\", 1)[-1])[:120] or "file"
    att_id = uuid.uuid4().hex
    d = ctx.settings.workspaces_root / workspace_id / "attachments"
    d.mkdir(parents=True, exist_ok=True)
    dest, size, limit = d / f"{att_id}_{name}", 0, ctx.settings.max_upload_bytes
    with open(dest, "wb") as f:
        while chunk := await file.read(1024 * 256):
            size += len(chunk)
            if size > limit:
                f.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, f"file exceeds {limit} bytes")
            f.write(chunk)
    att = Attachment(id=att_id, workspace_id=workspace_id, filename=name, path=str(dest), size=size, uploaded_by=a.user.id)
    s.add(att)
    await s.commit()
    return {"id": att.id, "filename": name, "size": size}


@router.get("/workspaces/{workspace_id}/attachments")
async def list_attachments(workspace_id: str, s: AsyncSession = Depends(get_session), a: Access = Depends(ws_access("view", "list attachments"))):
    rows = (await s.execute(select(Attachment).where(Attachment.workspace_id == workspace_id))).scalars()
    return [{"id": x.id, "filename": x.filename, "size": x.size, "created_at": x.created_at.isoformat()} for x in rows]
