import asyncio
import json

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..bus import OVERFLOW
from ..context import AppContext
from ..deps import Access, get_ctx, get_session, ws_access
from ..models import ConflictRecord, HandoffObject
from .serializers import conflict_out, handoff_out

router = APIRouter(prefix="/api/workspaces/{workspace_id}", tags=["events & provenance"])


@router.get("/events")
async def list_events(workspace_id: str, after_seq: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=1000),
                      ctx: AppContext = Depends(get_ctx), a: Access = Depends(ws_access("view", "read events"))):
    return await ctx.events.list(workspace_id, after_seq, limit)


@router.get("/events/verify")
async def verify(workspace_id: str, ctx: AppContext = Depends(get_ctx), a: Access = Depends(ws_access("view", "verify provenance"))):
    """Recompute the whole hash chain + signatures; reports the first tampered/missing entry."""
    return await ctx.events.verify(workspace_id)


@router.get("/events/stream")
async def sse(workspace_id: str, request: Request, replay: int = Query(50, ge=0, le=1000),
              last_event_id: str | None = Header(default=None), ctx: AppContext = Depends(get_ctx),
              a: Access = Depends(ws_access("view", "stream events"))):
    """Server-Sent Events alternative to the WebSocket (`id:` is the seq, so EventSource resumes cleanly)."""
    async def gen():
        async with ctx.bus.subscribe(workspace_id) as q:
            last = 0
            if last_event_id and last_event_id.isdigit():
                backlog = await ctx.events.list(workspace_id, int(last_event_id), 5000)
            else:
                backlog = await ctx.events.tail(workspace_id, replay) if replay else []
            for e in backlog:
                last = e["seq"]
                yield f"id: {e['seq']}\nevent: {e['event_type']}\ndata: {json.dumps(e)}\n\n"
            while not await request.is_disconnected():
                try:
                    e = await asyncio.wait_for(q.get(), 15)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if e is OVERFLOW:
                    return
                if e["seq"] > last:
                    last = e["seq"]
                    yield f"id: {e['seq']}\nevent: {e['event_type']}\ndata: {json.dumps(e)}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/handoffs")
async def handoffs(workspace_id: str, s: AsyncSession = Depends(get_session), a: Access = Depends(ws_access("view", "view handoffs"))):
    rows = (await s.execute(select(HandoffObject).where(HandoffObject.workspace_id == workspace_id)
                            .order_by(HandoffObject.created_at))).scalars()
    return [handoff_out(h) for h in rows]


@router.get("/conflicts")
async def conflicts(workspace_id: str, s: AsyncSession = Depends(get_session), a: Access = Depends(ws_access("view", "view conflicts"))):
    rows = (await s.execute(select(ConflictRecord).where(ConflictRecord.workspace_id == workspace_id)
                            .order_by(ConflictRecord.created_at))).scalars()
    return [conflict_out(c) for c in rows]
