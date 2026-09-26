"""Runtime configuration (env vars / .env). Every provider CLI command is a template so it can be
adjusted to whatever the installed CLI version actually accepts, without code changes."""
from __future__ import annotations

import os
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _load_env_values(env_file: Path) -> dict[str, str]:
    """KEY=VALUE pairs from a .env file (no interpolation). Unknown keys matter: provider API
    keys (BOBSHELL_API_KEY, OPENAI_API_KEY, ...) live here and must reach the CLIs' child
    processes even though pydantic-settings ignores fields it has no model for."""
    out: dict[str, str] = {}
    if not env_file.is_file():
        return out
    for raw in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key:
            out[key] = value
    return out


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

    # Dev CORS: allow any localhost port so the Next.js dev server can talk to the
    # backend regardless of which random port the dev server rebinds to after a restart.
    # (The Next.js dev server rebinds to a new random port on every restart, so a
    # fixed single port like 3000 quickly goes stale.) Starlette's CORSMiddleware has
    # NO port-wildcard support in the plain origin list ("http://localhost:*" would be
    # treated as a literal string that never matches), so the dev wildcard is expressed
    # via cors_origin_regex instead. In production set explicit origins and an empty regex.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,https://aashvarsha26.github.io,https://creative-unity-production.up.railway.app"
    cors_origin_regex: str = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
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

    # Failover: when a real CLI executor fails mid-task (bad auth, crash, non-zero exit), the
    # subtask is re-queued to the next-best agent and the failing provider is benched for this
    # many seconds so one broken CLI cannot poison the whole task with repeated failures.
    # An auth failure ("not signed in") cannot recover mid-task — the user has to log in on the
    # host — so the default bench is long enough that sibling subtasks skip the dead CLI
    # entirely instead of each paying a doomed attempt on it.
    failover_cooldown_seconds: float = 600.0
    # Total dispatch attempts one subtask may consume before it is declared failed. With four
    # providers, a cap of 4 lets every real CLI fail once and the task still finish on a
    # simulated agent instead of dying because two different CLIs each failed once.
    max_subtask_attempts: int = 4

    # --- provider CLI command templates ({prompt} becomes ONE argv token; no shell is involved) --
    bob_cmd: str = "bob run --output-format stream-json {prompt}"
    bob_plan_cmd: str = "bob run --mode plan --output-format stream-json {prompt}"
    # --skip-git-repo-check: tasks run in per-workspace dirs under data/workspaces, which are
    # not git repositories — without the flag codex 0.157 refuses to start there.
    # -s danger-full-access: codex's internal workspace-write sandbox helper fails on Windows
    # ("unified exec process ... setup refresh had errors"), so its shell can't start at all.
    # The backend provides the real containment itself (per-workspace cwd, scrubbed env,
    # redirected HOME, hard timeout, process-group kill), which is the documented use for
    # this mode. Read-only works but cannot edit files, so it's useless for coding tasks.
    codex_cmd: str = "codex exec --json --skip-git-repo-check -s danger-full-access {prompt}"
    codex_plan_cmd: str = "codex exec --json --skip-git-repo-check -s read-only {prompt}"
    gemini_cmd: str = "agy -p {prompt} --output-format stream-json --mode accept-edits"
    gemini_plan_cmd: str = "agy -p {prompt} --output-format stream-json --mode plan"
    # opencode: `run --format json` emits NDJSON (step_start / text / tool_use / step_finish with
    # token counts). --auto approves write permissions non-interactively (the backend provides the
    # real containment: per-workspace cwd, scrubbed env, timeout, process-group kill).
    # Plan mode uses opencode's built-in read-only `plan` agent.
    opencode_cmd: str = "opencode run --auto --format json {prompt}"
    opencode_plan_cmd: str = "opencode run --agent plan --format json {prompt}"
    opencode_api_key_env: str = "OPENCODE_API_KEY"
    copilot_api_key_env: str = "GITHUB_TOKEN"
    copilot_cmd: str = "copilot -p {prompt} --allow-all-tools"
    copilot_plan_cmd: str = "copilot -p {prompt}"
    # Env var each CLI reads its API key from (Bob's is an assumption - override to match Bob Shell).
    bob_api_key_env: str = "BOBSHELL_API_KEY"
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
        # Provider key VALUES (BOBSHELL_API_KEY etc.) are not model fields, so pydantic-settings
        # parses .env and drops them. Re-apply the whole file into the process environment
        # (without overriding real env vars) so entitlement.credential_env() can find the keys
        # and inject them into provider subprocesses. This is the fix for ".env documents the
        # key NAME but the VALUE is never used".
        for key, value in _load_env_values(Path(".env")).items():
            if value and key not in os.environ:
                os.environ[key] = value
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
