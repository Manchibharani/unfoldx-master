from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..context import AppContext
from ..deps import current_user, get_ctx, get_session
from ..models import User
from ..schemas import LoginIn, RegisterIn
from ..security import create_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token(ctx: AppContext, user: User) -> dict:
    return {"access_token": create_token(user.id, ctx.settings.secret_key, ctx.settings.token_ttl_minutes),
            "token_type": "bearer", "user": {"id": user.id, "email": user.email, "name": user.name}}


@router.post("/register", status_code=201)
async def register(body: RegisterIn, ctx: AppContext = Depends(get_ctx), s: AsyncSession = Depends(get_session)):
    email = body.email.lower()
    if (await s.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(409, "email already registered")
    user = User(email=email, name=body.name, password_hash=hash_password(body.password))
    s.add(user)
    await s.commit()
    return _token(ctx, user)


@router.post("/login")
async def login(body: LoginIn, ctx: AppContext = Depends(get_ctx), s: AsyncSession = Depends(get_session)):
    user = (await s.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if user is None or user.is_guest or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "invalid email or password")
    return _token(ctx, user)


@router.get("/me")
async def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "name": user.name, "guest": user.is_guest}
