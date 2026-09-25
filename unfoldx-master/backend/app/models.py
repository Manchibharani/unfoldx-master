"""Core data model (PDF section 4). All ids are strings so the frontend can use slugs like
`demo-workspace`."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def uid() -> str:
    return uuid.uuid4().hex


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Workspace(Base):
    __tablename__ = "workspaces"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Member(Base):
    """In-workspace authorization: view < control < approve (distinct from provider-level auth)."""
    __tablename__ = "members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(16), default="view")


class ProviderConnection(Base):
    """One connected AI vendor in a workspace. Secret is Fernet-encrypted at rest."""
    __tablename__ = "provider_connections"
    __table_args__ = (UniqueConstraint("workspace_id", "provider"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    auth_type: Mapped[str] = mapped_column(String(16), default="none")  # api_key | host_session | none
    secret_ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan: Mapped[str] = mapped_column(String(80), default="unknown")
    pricing: Mapped[dict] = mapped_column(JSON, default=dict)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    connected_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Agent(Base):
    """A runnable instance of a provider with a capability profile used for routing."""
    __tablename__ = "agents"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(120))
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    capabilities: Mapped[dict] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    prompt: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="planning")
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attachment_ids: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Subtask(Base):
    __tablename__ = "subtasks"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    idx: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    capabilities: Mapped[list] = mapped_column(JSON, default=list)
    target_files: Mapped[list] = mapped_column(JSON, default=list)
    depends_on: Mapped[list] = mapped_column(JSON, default=list)
    # pending | blocked | running | paused_budget | completed | failed | cancelled
    status: Mapped[str] = mapped_column(String(24), default="pending")
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    forced_agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Route(Base):
    __tablename__ = "routes"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    subtask_id: Mapped[str] = mapped_column(ForeignKey("subtasks.id"), index=True)
    agent_id: Mapped[str] = mapped_column(String(64))
    provider: Mapped[str] = mapped_column(String(32))
    score: Mapped[float] = mapped_column(Float, default=0.0)
    est_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    quota_remaining_usd: Mapped[float] = mapped_column(Float, default=0.0)
    rationale: Mapped[str] = mapped_column(Text, default="")
    breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class HandoffObject(Base):
    __tablename__ = "handoffs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    task_id: Mapped[str] = mapped_column(String(64), index=True)
    subtask_id: Mapped[str] = mapped_column(String(64), index=True)
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    decisions: Mapped[list] = mapped_column(JSON, default=list)
    constraints: Mapped[list] = mapped_column(JSON, default=list)
    rejected_approaches: Mapped[list] = mapped_column(JSON, default=list)
    files_touched: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[str] = mapped_column(Text, default="")
    structured: Mapped[bool] = mapped_column(Boolean, default=False)  # agent supplied the schema itself
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class EventLogEntry(Base):
    """Append-only, hash-chained provenance record (prev_hash + hash, HMAC-signed)."""
    __tablename__ = "event_log"
    __table_args__ = (UniqueConstraint("workspace_id", "seq"), Index("ix_event_ws_seq", "workspace_id", "seq"))
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(64))
    seq: Mapped[int] = mapped_column(Integer)
    ts: Mapped[str] = mapped_column(String(40))
    event_type: Mapped[str] = mapped_column(String(48))
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    task_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    subtask_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    cost_delta: Mapped[float] = mapped_column(Float, default=0.0)
    tokens_delta: Mapped[int] = mapped_column(Integer, default=0)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))
    signature: Mapped[str] = mapped_column(String(64))


class BudgetLedger(Base):
    __tablename__ = "budget_ledgers"
    __table_args__ = (UniqueConstraint("workspace_id", "provider"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    cap_usd: Mapped[float] = mapped_column(Float, default=5.0)
    spent_usd: Mapped[float] = mapped_column(Float, default=0.0)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    requests: Mapped[int] = mapped_column(Integer, default=0)
    breaker_state: Mapped[str] = mapped_column(String(8), default="closed")  # closed | open
    tripped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ConflictRecord(Base):
    __tablename__ = "conflicts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    subtask_id: Mapped[str] = mapped_column(String(64))
    other_subtask_id: Mapped[str] = mapped_column(String(64))
    paths: Mapped[list] = mapped_column(JSON, default=list)
    resolution: Mapped[str] = mapped_column(String(24), default="deferred")  # deferred | detected_runtime
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Attachment(Base):
    __tablename__ = "attachments"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    path: Mapped[str] = mapped_column(String(500))
    size: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
