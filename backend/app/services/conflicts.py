"""Pre-commit collision detection. Two subtasks conflict if any claimed path/glob/resource overlaps.
Deliberately conservative: false positives serialise work, false negatives corrupt it."""
from __future__ import annotations

from fnmatch import fnmatchcase

_WILD = set("*?[")


def _norm(p: str) -> str:
    p = p.strip().replace("\\", "/")
    while p.startswith("./"):
        p = p[2:]
    return p.lstrip("/")


def _wild(p: str) -> bool:
    return any(c in _WILD for c in p)


def _static_prefix(p: str) -> str:
    for i, c in enumerate(p):
        if c in _WILD:
            return p[:i]
    return p


def overlaps(a: str, b: str) -> bool:
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return False
    if a == b or fnmatchcase(a, b) or fnmatchcase(b, a):
        return True
    da, db = a.rstrip("/"), b.rstrip("/")
    if not _wild(a) and b.startswith(da + "/") or not _wild(b) and a.startswith(db + "/"):  # dir contains file
        return True
    if _wild(a) and _wild(b):
        pa, pb = _static_prefix(a), _static_prefix(b)
        return pa.startswith(pb) or pb.startswith(pa)
    return False


def colliding_paths(claims_a: list[str], claims_b: list[str]) -> list[str]:
    out: list[str] = []
    for a in claims_a:
        for b in claims_b:
            if overlaps(a, b):
                out.append(a if a == b else f"{a} <-> {b}")
    return list(dict.fromkeys(out))
