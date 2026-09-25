"""Plan parsing/validation, the heuristic fallback planner, and handoff-object parsing."""
from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field, ValidationError

from ..catalog import CAPABILITIES

MAX_SUBTASKS = 8

HANDOFF_INSTRUCTIONS = (
    "When you finish, END your reply with one fenced ```json block containing exactly these keys: "
    '{"summary": str, "decisions": [str], "constraints": [str], "rejected_approaches": [str], '
    '"files_touched": [str]}. decisions = choices you made and why; constraints = limits you discovered '
    "that the next agent must respect; rejected_approaches = things you tried or considered and dropped."
)

PLAN_START, PLAN_END = "### REQUEST", "### END REQUEST"


class PlanSubtask(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    capabilities: list[str] = []
    files: list[str] = []
    depends_on: list[int] = []


class Plan(BaseModel):
    rationale: str = ""
    subtasks: list[PlanSubtask] = Field(min_length=1)


# ---------------------------------------------------------------------------------------------
def _json_candidates(text: str) -> list[dict]:
    """All JSON objects found in text: fenced blocks first, then balanced-brace scans."""
    found: list[dict] = []
    for m in re.finditer(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S | re.I):
        try:
            v = json.loads(m.group(1))
            if isinstance(v, dict):
                found.append(v)
        except json.JSONDecodeError:
            pass
    i, n = 0, len(text)
    while i < n:
        if text[i] != "{":
            i += 1
            continue
        depth, j, in_str, esc = 0, i, False, False
        while j < n:
            c = text[j]
            if in_str:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == '"':
                    in_str = False
            elif c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    try:
                        v = json.loads(text[i:j + 1])
                        if isinstance(v, dict) and v not in found:
                            found.append(v)
                    except json.JSONDecodeError:
                        pass
                    break
            j += 1
        i = j + 1 if depth == 0 and j < n else i + 1
    return found


def _clean_path(p: str) -> str | None:
    p = p.strip().replace("\\", "/").lstrip("/")
    while p.startswith("./"):
        p = p[2:]
    if not p or ".." in p.split("/") or len(p) > 200:
        return None
    return p


def parse_plan(text: str) -> Plan | None:
    """Validate Bob's plan output and sanitise it (known capabilities, safe paths, acyclic deps)."""
    for cand in _json_candidates(text):
        if "subtasks" not in cand:
            continue
        try:
            plan = Plan.model_validate(cand)
        except ValidationError:
            continue
        plan.subtasks = plan.subtasks[:MAX_SUBTASKS]
        for i, st in enumerate(plan.subtasks):
            st.capabilities = [c for c in dict.fromkeys(x.lower() for x in st.capabilities) if c in CAPABILITIES] or ["backend"]
            st.files = [f for f in (_clean_path(x) for x in st.files) if f][:20]
            st.depends_on = sorted({d for d in st.depends_on if isinstance(d, int) and 0 <= d < i})
        return plan
    return None


def parse_handoff(text: str) -> dict | None:
    keys = {"decisions", "constraints", "rejected_approaches", "files_touched"}
    for cand in reversed(_json_candidates(text)):
        if keys & cand.keys():
            def lst(k):
                v = cand.get(k)
                return [str(x)[:500] for x in v][:50] if isinstance(v, list) else []
            return {"summary": str(cand.get("summary", ""))[:2000], "decisions": lst("decisions"),
                    "constraints": lst("constraints"), "rejected_approaches": lst("rejected_approaches"),
                    "files_touched": lst("files_touched")}
    return None


# ---------------------------------------------------------------------------------------------
_RULES: list[tuple[str, tuple[str, ...], str, list[str]]] = [
    # capability, keywords, title, default claimed paths
    ("architecture", ("architecture", "design the", "data model", "schema"), "Design the approach and data model", ["docs/design/**"]),
    ("backend", ("api", "endpoint", "server", "backend", "database", "fastapi", "django", "flask", "express", "sql", "auth", "login"), "Implement backend logic", ["backend/**"]),
    ("data", ("csv", "etl", "pandas", "dataset", "analysis", "analytics"), "Build the data pipeline", ["data/**"]),
    ("refactor", ("refactor", "clean up", "cleanup", "rename", "restructure"), "Refactor existing code", ["src/**"]),
    ("debugging", ("bug", "fix", "crash", "error", "broken"), "Diagnose and fix the defect", ["src/**"]),
    ("security", ("security", "vulnerab", "sanitiz", "xss", "csrf", "harden"), "Security review and hardening", ["backend/**"]),
    ("frontend", ("ui", "page", "component", "frontend", "react", "next.js", "css", "layout", "dashboard", "form", "button"), "Build the user interface", ["frontend/**"]),
    ("devops", ("docker", "deploy", "ci/cd", "pipeline", "kubernetes"), "Containerise and configure deployment", ["Dockerfile", "docker-compose.yml", ".github/**"]),
    ("testing", ("test", "pytest", "coverage", "qa"), "Write and run tests", ["tests/**"]),
    ("docs", ("readme", "docs", "documentation", "document "), "Write documentation", ["docs/**", "README.md"]),
]
_EXT_TO_CAP = {".py": "backend", ".go": "backend", ".java": "backend", ".rs": "backend", ".sql": "backend",
               ".tsx": "frontend", ".jsx": "frontend", ".css": "frontend", ".html": "frontend", ".vue": "frontend",
               ".md": "docs", ".yml": "devops", ".yaml": "devops", ".csv": "data"}


def heuristic_plan(request: str) -> dict:
    """Keyword-based decomposition. Used ONLY as a fallback when Bob is unavailable/unparseable, and by
    the simulator. Real decomposition is Bob's Plan mode."""
    low = request.lower()
    chosen = [r for r in _RULES if any(re.search(r"\b" + re.escape(k.strip()), low) for k in r[1])]
    if not chosen:
        chosen = [_RULES[1]]
    explicit = [p for p in re.findall(r"[\w./-]+\.[A-Za-z0-9]{1,5}\b", request) if "/" in p or p.count(".") == 1]
    explicit = [p for p in (_clean_path(x) for x in explicit) if p and not p.startswith("http")]
    subtasks: list[dict] = []
    for cap, _, title, files in chosen:
        mine = [p for p in explicit if _EXT_TO_CAP.get(_ext(p)) == cap]
        subtasks.append({"title": title, "description": f"{title} for: {request.strip()[:400]}",
                         "capabilities": [cap], "files": mine or list(files), "depends_on": []})
    for i, st in enumerate(subtasks):  # tests/docs run after the implementation work they describe
        if st["capabilities"][0] in ("testing", "docs", "devops"):
            st["depends_on"] = [j for j in range(i) if subtasks[j]["capabilities"][0] not in ("testing", "docs", "devops")]
    return {"rationale": "Heuristic decomposition by capability keywords (Bob Plan mode output was unavailable).",
            "subtasks": subtasks[:MAX_SUBTASKS]}


def _ext(p: str) -> str:
    return "." + p.rsplit(".", 1)[-1].lower() if "." in p.rsplit("/", 1)[-1] else ""


def build_plan_prompt(request: str, attachments: list[str], agents: list[dict]) -> str:
    agent_lines = "\n".join(f"- {a['provider']}: strengths " + ", ".join(
        k for k, v in sorted(a["capabilities"].items(), key=lambda kv: -kv[1])[:4]) for a in agents)
    return (
        "You are Bob in Plan mode, the conductor of a multi-agent development workspace. Decompose the request "
        f"into 1-{MAX_SUBTASKS} subtasks that independent coding agents can execute. Subtasks that edit the same "
        "files must not run in parallel, so list precise `files` (globs allowed) each subtask will modify.\n"
        "Respond with ONLY one JSON object, no prose:\n"
        '{"rationale": str, "subtasks": [{"title": str, "description": str, "capabilities": [str], '
        '"files": [str], "depends_on": [int]}]}\n'
        f"capabilities must come from: {', '.join(CAPABILITIES)}. depends_on lists indices of EARLIER subtasks.\n"
        f"Connected agents:\n{agent_lines}\n"
        + (f"Attached files: {', '.join(attachments)}\n" if attachments else "")
        + f"{PLAN_START}\n{request}\n{PLAN_END}")


def extract_request(prompt: str) -> str:
    if PLAN_START in prompt and PLAN_END in prompt:
        return prompt.split(PLAN_START, 1)[1].split(PLAN_END, 1)[0].strip()
    return prompt
