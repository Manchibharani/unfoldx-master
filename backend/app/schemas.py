from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, SecretStr

Role = Literal["view", "control", "approve"]


class WorkspaceEvent(BaseModel):
    """Canonical event: one per WebSocket frame. Mirror of frontend lib/types.ts."""
    id: str
    workspace_id: str
    seq: int = Field(description="Gapless per-workspace sequence number")
    ts: str = Field(description="ISO-8601 UTC timestamp")
    event_type: Literal["provider_connected", "task_submitted", "plan_decomposed", "route_decided",
                        "conflict_detected", "dispatch_started", "log_line", "budget_update",
                        "circuit_breaker_triggered", "handoff_emitted", "agent_output",
                        "authorization_denied", "task_completed", "error"]
    agent_id: str | None = None
    task_id: str | None = None
    subtask_id: str | None = None
    provider: str | None = None
    model: str | None = None
    session_id: str | None = None
    payload: dict[str, Any] = {}
    cost_delta: float = 0.0
    tokens_delta: int = 0
    prev_hash: str = Field(min_length=64, max_length=64)
    hash: str = Field(min_length=64, max_length=64)
    signature: str = Field(min_length=64, max_length=64, description="HMAC-SHA256(server key, hash)")


class RegisterIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(default="", max_length=120)


class LoginIn(BaseModel):
    email: str
    password: str


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    id: str | None = Field(default=None, description="optional slug, e.g. 'demo-workspace'")


class MemberIn(BaseModel):
    email: str
    role: Role = "view"


class ProviderConnectIn(BaseModel):
    provider: str
    api_key: SecretStr | None = None
    plan: str = Field(default="unknown", max_length=80)
    pricing: dict[str, Any] | None = None
    cap_usd: float | None = Field(default=None, ge=0)


class TaskCreate(BaseModel):
    prompt: str = Field(min_length=3, max_length=8000)
    attachment_ids: list[str] = Field(default_factory=list, max_length=20)


class AgentCreate(BaseModel):
    provider: str
    name: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    capabilities: dict[str, float] | None = None


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    capabilities: dict[str, float] | None = None
    enabled: bool | None = None


class RedirectIn(BaseModel):
    agent_id: str | None = None
    instruction: str | None = Field(default=None, max_length=2000)


class BudgetCapIn(BaseModel):
    cap_usd: float = Field(ge=0)


class OverrideIn(BaseModel):
    additional_usd: float = Field(gt=0, le=10000)
    reason: str | None = Field(default=None, max_length=500)
