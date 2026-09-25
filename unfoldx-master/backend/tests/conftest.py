import os
import sqlite3
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

FAKE = str(Path(__file__).parent / "fake_cli.py")
FAKE_AGY = str(Path(__file__).parent / "fake_agy.py")

# Hermetic tests: host-installed provider CLIs (claude/codex/bob/agy) must not leak into the
# sandbox and flip adapter modes from "simulated" to "real". Keep only the Python interpreter's
# own directory plus the OS system directories on PATH so shutil.which() resolves nothing else.
_system_dirs = [r"C:\Windows\System32", r"C:\Windows"] if os.name == "nt" else ["/usr/bin", "/bin"]
os.environ["PATH"] = os.pathsep.join(
    [os.path.dirname(sys.executable)] + [d for d in _system_dirs if Path(d).exists()])


@pytest.fixture
def make_client(tmp_path):
    made = []

    def _make(**kw):
        params = dict(data_dir=tmp_path / "data", sim_delay_seconds=0.0, entitlement_poll_seconds=0,
                      # Deterministic routing: the Antigravity CLI is always "installed" (fake) so the
                      # router can prove it prefers a real executor over simulated ones. Bob/Claude/Codex
                      # are NOT on the test PATH, so they are excluded (or simulated) exactly as intended.
                      gemini_cmd=f"{sys.executable} {FAKE_AGY} {{prompt}}",
                      gemini_plan_cmd=f"{sys.executable} {FAKE_AGY} {{prompt}}")
        params.update(kw)
        c = TestClient(create_app(Settings(**params)))
        made.append(c)
        return c
    yield _make


def wait_for(fn, timeout=15.0, interval=0.05, msg="condition"):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(interval)
    raise AssertionError(f"timed out waiting for {msg}")


def events(c, ws="demo-workspace", **params):
    r = c.get(f"/api/workspaces/{ws}/events", params={"limit": 1000, **params})
    assert r.status_code == 200, r.text
    return r.json()


def wait_event(c, etype, ws="demo-workspace", pred=lambda e: True, timeout=15.0):
    return wait_for(lambda: next((e for e in events(c, ws) if e["event_type"] == etype and pred(e)), None),
                    timeout, msg=f"event {etype}")


def db_path(c) -> str:
    return str(c.app.state.ctx.settings.data_dir / "workspace.db")


def sql(c, query, args=()):
    con = sqlite3.connect(db_path(c))
    try:
        cur = con.execute(query, args)
        rows = cur.fetchall()
        con.commit()
        return rows
    finally:
        con.close()
