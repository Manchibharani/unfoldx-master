"""Authentication + in-workspace authorization (view < control < approve), enforced server-side."""
from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Callable

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .context import AppContext
from .models import Member, User, Workspace
from .security import decode_token
from .services.workspaces import get_or_create_guest

RANK = {"view": 1, "control": 2, "approve": 3}


def get_ctx(request: Request) -> AppContext:
    return request.app.state.ctx


async def get_session(ctx: AppContext = Depends(get_ctx)) -> AsyncIterator[AsyncSession]:
    async with ctx.db.sessionmaker() as s:
        yield s


async def resolve_user(ctx: AppContext, session: AsyncSession, token: str | None) -> User:
    st = ctx.settings
    if token:
        payload = None
        try:
            payload = decode_token(token, st.secret_key)
        except jwt.PyJWTError:
            if st.external_jwt_secret:
                try:
                    payload = decode_token(token, st.external_jwt_secret, external=True)
                except jwt.PyJWTError:
                    payload = None
        if not payload or not payload.get("sub"):
            raise HTTPException(401, "invalid or expired token")
        user = await session.get(User, payload["sub"])
        if user is None and payload.get("iss") != "uaw":  # first sight of an external-IdP user (Supabase/Auth0)
            email = payload.get("email") or f"{payload['sub']}@external"
            user = User(id=payload["sub"], email=email, name=str(payload.get("name", "")))
            session.add(user)
            await session.commit()
        if user is None:
            raise HTTPException(401, "unknown user")
        return user
    if st.auth_mode == "jwt":
        raise HTTPException(401, "authentication required")
    return await get_or_create_guest(session)


def bearer(request: Request) -> str | None:
    h = request.headers.get("authorization", "")
    return h[7:].strip() if h.lower().startswith("bearer ") else None


async def current_user(request: Request, ctx: AppContext = Depends(get_ctx), session: AsyncSession = Depends(get_session)) -> User:
    return await resolve_user(ctx, session, bearer(request))


async def role_for(ctx: AppContext, session: AsyncSession, ws_id: str, user: User) -> str | None:
    m = (await session.execute(select(Member).where(Member.workspace_id == ws_id, Member.user_id == user.id))).scalar_one_or_none()
    if m:
        return m.role
    if ctx.settings.auth_mode == "open" and user.is_guest:
        return ctx.settings.open_mode_role
    return None


@dataclass
class Access:
    ws: Workspace
    user: User
    role: str


async def authorize(ctx: AppContext, session: AsyncSession, ws_id: str, user: User, needed: str, action: str,
                    task_id: str | None = None) -> Access:
    ws = await session.get(Workspace, ws_id)
    role = await role_for(ctx, session, ws_id, user) if ws else None
    if ws is None or role is None:
        raise HTTPException(404, "workspace not found")  # do not reveal existence to non-members
    if RANK[role] < RANK[needed]:
        await ctx.events.append(ws_id, "authorization_denied", {
            "detail": f"{user.email} ({role}) attempted '{action}' which requires '{needed}'",
            "user": user.email, "role": role, "required": needed, "action": action}, task_id=task_id)
        raise HTTPException(403, f"'{action}' requires the '{needed}' role; you have '{role}'")
    return Access(ws, user, role)


def ws_access(needed: str, action: str) -> Callable:
    async def dep(workspace_id: str, ctx: AppContext = Depends(get_ctx), session: AsyncSession = Depends(get_session),
                  user: User = Depends(current_user)) -> Access:
        return await authorize(ctx, session, workspace_id, user, needed, action)
    return dep
