from __future__ import annotations

from ..config import Settings
from .base import AgentEvent, CliAdapter
from .normalize import agy_event, claude_event, codex_event


class BobAdapter(CliAdapter):
    """IBM Bob Shell: Plan-mode decomposition + headless execution (`bob run --output-format stream-json`)."""
    provider, binary = "bob", "bob"
    api_key_env_attr, cmd_attr, plan_cmd_attr = "bob_api_key_env", "bob_cmd", "bob_plan_cmd"


class ClaudeCodeAdapter(CliAdapter):
    provider, binary = "claude_code", "claude"
    api_key_env_attr, cmd_attr, plan_cmd_attr = "claude_api_key_env", "claude_cmd", "claude_plan_cmd"

    def parse_json_event(self, obj: dict, state: dict) -> list[AgentEvent]:
        return claude_event(obj, state)


class CodexAdapter(CliAdapter):
    """Best-effort: Codex headless mode is reported unstable for sustained non-TTY orchestration."""
    provider, binary = "codex", "codex"
    api_key_env_attr, cmd_attr, plan_cmd_attr = "codex_api_key_env", "codex_cmd", "codex_plan_cmd"

    def parse_json_event(self, obj: dict, state: dict) -> list[AgentEvent]:
        return codex_event(obj, state)


class GeminiAdapter(CliAdapter):
    """Google Antigravity CLI (agy): host-session authenticated, `--output-format stream-json` NDJSON
    normalised by `agy_event` (init / step_update with tool + usage / result)."""
    provider, binary = "gemini", "agy"
    api_key_env_attr, cmd_attr, plan_cmd_attr = "gemini_api_key_env", "gemini_cmd", "gemini_plan_cmd"

    def parse_json_event(self, obj: dict, state: dict) -> list[AgentEvent]:
        return agy_event(obj, state)


def build_adapters(settings: Settings) -> dict[str, CliAdapter]:
    return {a.provider: a for a in (BobAdapter(settings), ClaudeCodeAdapter(settings),
                                    CodexAdapter(settings), GeminiAdapter(settings))}
