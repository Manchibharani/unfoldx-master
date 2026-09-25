"""Runtime configuration (env vars / .env). Every provider CLI command is a template so it can be
adjusted to whatever the installed CLI version actually accepts, without code changes."""
from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Universal AI Workspace Backend"
    environment: str = "dev"
    data_dir: Path = Path("./data")
    database_url: str = ""  # default: SQLite file in data_dir. Use postgresql+asyncpg://... in Docker.
    redis_url: str | None = None  # optional: cross-process event fan-out

    # --- secrets -----------------------------------------------------------------------------
    secret_key: str | None = None  # JWT signing + provenance HMAC. Auto-generated & persisted in dev.
    fernet_key: str | None = None  # credential vault key. Derived from secret_key if unset (dev only).

    # --- people auth ---------------------------------------------------------------------------
    # open: no token needed; anonymous callers act as a guest with `open_mode_role` (demo / dev).
    # jwt : every HTTP/WS call needs a valid token (built-in login, or Supabase/Auth0 HS256 secret).
    auth_mode: str = "open"
    open_mode_role: str = "approve"
    external_jwt_secret: str | None = None
    token_ttl_minutes: int = 60 * 24

    cors_origins: str = "http://localhost:3000,https://aashvarsha26.github.io"
    seed_demo_workspace: bool = True  # creates `demo-workspace` on startup when auth_mode=open
    demo_workspace_id: str = "demo-workspace"

    # --- orchestration -------------------------------------------------------------------------
    max_concurrent_subtasks: int = 3
    subtask_timeout_seconds: float = 900
    plan_timeout_seconds: float = 180
    default_budget_cap_usd: float = 5.0
    ws_replay_default: int = 200
    entitlement_poll_seconds: float = 60
    max_upload_bytes: int = 10 * 1024 * 1024

    # Simulation: when a provider CLI is not installed, run a clearly-labelled simulated agent so
    # the full pipeline stays demoable. Set ALLOW_SIMULATION=0 in production.
    allow_simulation: bool = True
    sim_delay_seconds: float = 0.35

    # --- provider CLI command templates ({prompt} becomes ONE argv token; no shell is involved) --
    bob_cmd: str = "bob run --output-format stream-json {prompt}"
    bob_plan_cmd: str = "bob run --mode plan --output-format stream-json {prompt}"
    claude_cmd: str = "claude -p {prompt} --output-format stream-json --verbose --permission-mode acceptEdits"
    claude_plan_cmd: str = "claude -p {prompt} --output-format stream-json --verbose --permission-mode plan"
    codex_cmd: str = "codex exec --json {prompt}"
    codex_plan_cmd: str = "codex exec --json {prompt}"
    gemini_cmd: str = "agy -p {prompt} --output-format stream-json --mode accept-edits"
    gemini_plan_cmd: str = "agy -p {prompt} --output-format stream-json --mode plan"
    # Env var each CLI reads its API key from (Bob's is an assumption - override to match Bob Shell).
    bob_api_key_env: str = "BOBSHELL_API_KEY"
    claude_api_key_env: str = "ANTHROPIC_API_KEY"
    codex_api_key_env: str = "OPENAI_API_KEY"
    gemini_api_key_env: str = "GEMINI_API_KEY"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def workspaces_root(self) -> Path:
        return self.data_dir / "workspaces"

    @model_validator(mode="after")
    def _finalize(self) -> "Settings":
        self.data_dir = Path(self.data_dir).resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        if not self.database_url:
            self.database_url = f"sqlite+aiosqlite:///{self.data_dir / 'workspace.db'}"
        if not self.secret_key:
            keyfile = self.data_dir / ".secret_key"
            if keyfile.exists():
                self.secret_key = keyfile.read_text().strip()
            else:
                self.secret_key = secrets.token_hex(32)
                keyfile.write_text(self.secret_key)
                try:
                    keyfile.chmod(0o600)
                except OSError:
                    pass
        if self.auth_mode not in ("open", "jwt"):
            raise ValueError("AUTH_MODE must be 'open' or 'jwt'")
        if self.open_mode_role not in ("view", "control", "approve"):
            raise ValueError("OPEN_MODE_ROLE must be view|control|approve")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
