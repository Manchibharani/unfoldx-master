"""Scan a workspace repo into the module graph the GitHub architecture visualiser renders.

Everything is derived from the REAL files under `workspaces_root/<ws>/repo`: file tree
(skipping vendored/hidden dirs), import edges for Python (`import x` / `from x import y`)
and JS/TS (`import`/`require` of relative paths and bare package names), plus simple
size/kind metadata. No external dependencies; bounded work on large repos.
"""
from __future__ import annotations

import re
from pathlib import Path

# Directories that are dependency/vendor noise rather than project architecture.
SKIP_DIRS = {"node_modules", ".git", ".next", ".venv", "venv", "__pycache__", "dist", "build",
             ".pytest_cache", ".mypy_cache", "coverage", "data", "home", "attachments"}
MAX_FILES = 400
_MAX_LINES_PER_FILE = 4000

_EXT_KIND = {
    ".py": "backend", ".pyi": "backend",
    ".ts": "frontend", ".tsx": "frontend", ".js": "frontend", ".jsx": "frontend", ".mjs": "frontend",
    ".vue": "frontend", ".svelte": "frontend", ".css": "frontend",
    ".html": "artifact", ".htm": "artifact",
    ".md": "docs", ".txt": "docs", ".rst": "docs",
    ".json": "config", ".yml": "config", ".yaml": "config", ".toml": "config", ".ini": "config",
    ".sql": "data", ".csv": "data", ".sh": "devops", ".bat": "devops", ".ps1": "devops",
    ".dockerfile": "devops", ".go": "backend", ".rs": "backend", ".java": "backend",
}
# Standard-library modules to ignore when resolving `import x` (keep the graph about the project).
_STDLIB = {
    "abc", "argparse", "asyncio", "base64", "collections", "contextlib", "dataclasses", "datetime",
    "decimal", "enum", "functools", "glob", "hashlib", "http", "importlib", "io", "itertools", "json",
    "logging", "math", "multiprocessing", "os", "pathlib", "pickle", "platform", "pprint", "queue",
    "re", "shutil", "signal", "socket", "sqlite3", "string", "subprocess", "sys", "tempfile", "time",
    "typing", "unittest", "urllib", "uuid", "warnings", "zipfile", "zlib", "secrets", "types",
}

_PY_IMPORT = re.compile(
    r"^[ \t]*(?:from[ \t]+([\w.]+)[ \t]+import[ \t]+([\w*.,() \t]+)|import[ \t]+([\w., \t]+?))[ \t]*(?:#.*)?$",
    re.M)
_JS_IMPORT = re.compile(
    r"(?:import\s+[^'\"]*?from\s+|import\s*\(\s*|require\s*\(\s*|export\s+[^'\"]*?from\s+)['\"]([^'\"]+)['\"]",
    re.S)


def _kind(rel: str) -> str:
    return _EXT_KIND.get("." + rel.rsplit(".", 1)[-1].lower() if "." in rel.rsplit("/", 1)[-1] else "", "other")


def _scan_repo(root: Path) -> tuple[list[dict], dict[str, Path]]:
    """Collect real files under root, up to MAX_FILES (breadth: shallow paths first).
    Skip-dirs are matched against path parts RELATIVE to the repo root — the repo may
    itself live under a directory named 'data' or 'build' in the host filesystem."""
    files: list[tuple[str, Path]] = []
    if root.is_dir():
        candidates = []
        for p in root.rglob("*"):
            if not p.is_file() or p.name.startswith("."):
                continue
            rel_parts = p.relative_to(root).parts[:-1]
            if set(rel_parts) & SKIP_DIRS:
                continue
            candidates.append(p)
        candidates.sort(key=lambda p: (len(p.parts), str(p)))  # shallow files first
        for p in candidates[:MAX_FILES]:
            rel = p.relative_to(root).as_posix()
            files.append((rel, p))
    return files


def _resolve_py(from_mod: str | None, names: str, module_to_file: dict[str, str]) -> list[str]:
    """Resolve python imports to project files. Handles `import a.b`, `from a import b`
    (b may be a submodule of a namespace package, i.e. no __init__.py), and
    `from a.b import c`. Standard-library modules are ignored."""
    targets: list[str] = []
    mods: list[str] = []
    if from_mod:
        mods.append(from_mod)
        for n in names.replace("(", "").replace(")", "").split(","):
            n = n.strip().split(" as ")[0]
            if n and n != "*":
                mods.append(f"{from_mod}.{n}")  # `from pkg import submodule`
    else:
        mods += [n.strip().split(" as ")[0] for n in names.replace("(", "").replace(")", "").split(",")]
    for m in mods:
        m = m.strip()
        if not m or m.split(".")[0] in _STDLIB:
            continue
        # absolute import of a project module: match the longest known prefix
        parts = m.split(".")
        while parts:
            key = "/".join(parts)
            hit = module_to_file.get(key)
            if hit:
                targets.append(hit)
                break
            # relative sibling: package a.b importing .c resolves to a.c
            parts.pop()
    return targets


def _resolve_js(spec: str, importer_rel: str, path_to_rel: dict[str, str]) -> list[str]:
    if not spec.startswith("."):
        # bare package import (react, next, fastapi, ...): node_modules-style dependency
        pkg = spec.split("/")[0]
        return [f"pkg:{pkg}"]
    base = importer_rel.rsplit("/", 1)[0] if "/" in importer_rel else ""
    parts = (base + "/" + spec).split("/")
    stack: list[str] = []
    for seg in parts:
        if seg == "..":
            if stack:
                stack.pop()
        elif seg not in (".", ""):
            stack.append(seg)
    joined = "/".join(stack)
    for cand in (joined, joined + ".ts", joined + ".tsx", joined + ".js", joined + ".jsx",
                 joined + ".mjs", joined + ".py", joined + "/index.ts", joined + "/index.tsx",
                 joined + "/index.js", joined + "/__init__.py"):
        if cand in path_to_rel:
            return [path_to_rel[cand]]
    return []


def scan_architecture(root: Path) -> dict:
    """The graph the visualiser renders: real files, real import edges, real aggregates."""
    files = _scan_repo(root)
    rels = [rel for rel, _ in files]
    path_set = set(rels)
    path_to_rel = {rel: rel for rel in rels}

    # module-name -> file for python resolution, keyed by SLASH-separated path
    # (a/b.py -> 'a/b'; pkg/__init__.py -> 'pkg') so _resolve_py can look up
    # import paths directly without a dot/slash conversion bug.
    module_to_file: dict[str, str] = {}
    for rel in rels:
        if rel.endswith(".py"):
            mod = rel[:-3]  # 'backend/api'
            module_to_file[mod] = rel
            if rel.endswith("__init__.py"):
                module_to_file[mod[: -len("/__init__")]] = rel

    edges_set: set[tuple[str, str]] = set()
    packages: dict[str, int] = {}
    total_bytes = 0
    total_loc = 0
    for rel, path in files:
        total_bytes += path.stat().st_size
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        lines = text.splitlines()
        total_loc += min(len(lines), _MAX_LINES_PER_FILE)
        suffix = "." + rel.rsplit(".", 1)[-1].lower() if "." in rel.rsplit("/", 1)[-1] else ""
        if suffix == ".py":
            for m in _PY_IMPORT.finditer(text[: 200_000]):
                for tgt in _resolve_py(m.group(1), m.group(2) or m.group(3) or "", module_to_file):
                    if tgt != rel:
                        edges_set.add((rel, tgt))
        elif suffix in (".ts", ".tsx", ".js", ".jsx", ".mjs"):
            for m in _JS_IMPORT.finditer(text[: 200_000]):
                for tgt in _resolve_js(m.group(1), rel, path_to_rel):
                    if not tgt.startswith("pkg:"):
                        edges_set.add((rel, tgt))
                    else:
                        packages[tgt[4:]] = packages.get(tgt[4:], 0) + 1

    edges = [{"source": s, "target": t} for s, t in sorted(edges_set)]
    pkg_edges = [{"target": f"pkg:{pkg}", "count": n} for pkg, n in sorted(packages.items())]

    by_kind: dict[str, int] = {}
    for rel in rels:
        k = _kind(rel)
        by_kind[k] = by_kind.get(k, 0) + 1
    # hub files = most-referenced modules (highest in-degree within the repo)
    indegree: dict[str, int] = {}
    for _, t in edges_set:
        indegree[t] = indegree.get(t, 0) + 1
    hubs = sorted(indegree.items(), key=lambda kv: (-kv[1], kv[0]))[:8]

    return {
        "root": str(root.name or root),
        "exists": bool(files),
        "files": [{"path": rel, "kind": _kind(rel), "size": p.stat().st_size} for rel, p in files],
        "edges": edges,
        "package_deps": pkg_edges,
        "stats": {
            "file_count": len(rels),
            "total_bytes": total_bytes,
            "total_loc": total_loc,
            "edge_count": len(edges),
            "package_count": len(packages),
            "by_kind": by_kind,
            "top_hubs": [{"path": p, "importers": n} for p, n in hubs],
        },
    }
