import sys
from pathlib import Path

from app.adapters.base import RunRequest
from app.adapters.providers import GeminiAdapter
from app.config import Settings


async def _run(adapter, req):
    handle = await adapter.start(req)
    events = []
    async for event in adapter.stream(handle, req):
        events.append(event)
    return handle, events


def test_threaded_windows_subprocess_bridge(monkeypatch, tmp_path):
    """Exercise the Popen bridge used by Windows SelectorEventLoop/Uvicorn reload."""
    import asyncio

    from app.adapters import base

    monkeypatch.setattr(base, "_use_threaded_subprocess", lambda: True)
    fake = Path(__file__).with_name("fake_agy.py")
    settings = Settings(
        data_dir=tmp_path / "data",
        sim_delay_seconds=0,
        gemini_cmd=f"{sys.executable} {fake} {{prompt}}",
        gemini_plan_cmd=f"{sys.executable} {fake} {{prompt}}",
    )
    adapter = GeminiAdapter(settings)
    req = RunRequest(prompt="hello", cwd=tmp_path / "repo", timeout=10)
    handle, events = asyncio.run(_run(adapter, req))
    assert handle.simulated is False
    assert handle.exit_code == 0
    assert any(e.kind == "result" and "Done" in e.text for e in events)
    # The fake reports usage once on the DONE step and repeats cumulative usage in result.
    assert len([e for e in events if e.kind == "usage"]) == 1
