from __future__ import annotations

import re

from sqlalchemy import select

from ..catalog import PROVIDERS
from ..models import Member, User, Workspace, uid

GUEST_EMAIL = "guest@local"
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")


async def get_or_create_guest(session) -> User:
    u = (await session.execute(select(User).where(User.email == GUEST_EMAIL))).scalar_one_or_none()
    if u is None:
        u = User(id=uid(), email=GUEST_EMAIL, name="Guest", is_guest=True)
        session.add(u)
        await session.commit()
    return u


async def create_workspace(ctx, session, name: str, owner: User, workspace_id: str | None = None) -> Workspace:
    if workspace_id is not None and not SLUG.match(workspace_id):
        raise ValueError("workspace id must be 2-63 chars of a-z, 0-9 and '-'")
    if workspace_id and await session.get(Workspace, workspace_id):
        raise FileExistsError(f"workspace '{workspace_id}' already exists")
    ws = Workspace(id=workspace_id or uid(), name=name, owner_id=owner.id)
    session.add(ws)
    session.add(Member(workspace_id=ws.id, user_id=owner.id, role="approve"))
    await session.commit()
    ctx.orchestrator.repo_dir(ws.id)
    return ws


async def seed_demo(ctx) -> None:
    """open-auth mode only: make `demo-workspace` (the frontend's default) exist with all providers connected.
    Also heals connections when the catalog grew since the workspace was created (e.g. a new provider
    was added to the backend): an existing workspace would otherwise never see it and routing would
    silently skip a fully-working CLI."""
    s = ctx.settings
    async with ctx.db.sessionmaker() as session:
        guest = await get_or_create_guest(session)
        ws = await session.get(Workspace, s.demo_workspace_id)
        if ws is None:
            await create_workspace(ctx, session, "Demo Workspace", guest, s.demo_workspace_id)
    connected = {c.provider for c in await ctx.entitlement.list_conns(s.demo_workspace_id)}
    for p in PROVIDERS:
        if p not in connected:
            await ctx.entitlement.connect(s.demo_workspace_id, p, user_id=guest.id, plan="demo")
