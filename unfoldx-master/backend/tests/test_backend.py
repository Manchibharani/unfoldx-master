import asyncio
import json
import sys

import pytest

from app.adapters.base import RunRequest
from app.adapters.normalize import claude_event, codex_event, generic_event
from app.events import GENESIS
from app.schemas import WorkspaceEvent
from tests.conftest import FAKE, FAKE_AGY, events, sql, wait_event, wait_for

PROMPT = "Build a login API with FastAPI and a React dashboard, then add tests"


def by_type(evts, t):
    return [e for e in evts if e["event_type"] == t]


# ------------------------------------------------------------------------------------------ seed
def test_demo_workspace_seeded_and_chain_valid(make_client):
    with make_client() as c:
        assert c.get("/healthz").json()["status"] == "ok"
        provs = c.get("/api/workspaces/demo-workspace/providers").json()
        assert {p["provider"] for p in provs} == {"bob", "claude_code", "codex", "gemini"}
        modes = {p["provider"]: p["mode"] for p in provs}
        assert modes["gemini"] == "real"      # fake Antigravity CLI is "installed" in tests
        assert set(v for k, v in modes.items() if k != "gemini") == {"simulated"}
        evts = events(c)
        assert len(by_type(evts, "provider_connected")) == 4
        for e in evts:
            WorkspaceEvent.model_validate(e)  # contract check on every emitted event
        v = c.get("/api/workspaces/demo-workspace/events/verify").json()
        assert v["valid"] and v["checked"] == len(evts)
        assert evts[0]["prev_hash"] == GENESIS


# ------------------------------------------------------------------------------------------ e2e
def test_end_to_end_task_pipeline(make_client):
    with make_client() as c:
        r = c.post("/api/workspaces/demo-workspace/tasks", json={"prompt": PROMPT})
        assert r.status_code == 202
        tid = r.json()["id"]
        done = wait_event(c, "task_completed", pred=lambda e: e["task_id"] == tid)
        assert done["payload"]["status"] == "completed"
        evts = [e for e in events(c) if e["task_id"] == tid]
        types = [e["event_type"] for e in evts]
        assert types[0] == "task_submitted"
        # Bob Plan mode runs first, before any routing
        first_dispatch = by_type(evts, "dispatch_started")[0]
        assert first_dispatch["provider"] == "bob" and first_dispatch["payload"]["mode"] == "plan"
        assert types.index("plan_decomposed") < types.index("route_decided")
        plan = by_type(evts, "plan_decomposed")[0]["payload"]
        assert plan["planner"]["provider"] == "bob" and len(plan["subtasks"]) >= 3
        assert len(by_type(evts, "route_decided")) == len(plan["subtasks"])
        assert all(e["payload"]["reason"] and e["payload"]["agent"] for e in by_type(evts, "route_decided"))
        assert by_type(evts, "budget_update") and by_type(evts, "log_line")
        h = by_type(evts, "handoff_emitted")
        assert len(h) == len(plan["subtasks"])
        for k in ("decisions", "constraints", "rejected_approaches", "files_touched"):
            assert k in h[0]["payload"]
        detail = c.get(f"/api/tasks/{tid}").json()
        assert detail["status"] == "completed" and all(s["status"] == "completed" for s in detail["subtasks"])
        assert len(detail["handoffs"]) == len(detail["subtasks"]) and len(detail["routes"]) >= len(detail["subtasks"])
        assert detail["cost_usd"] > 0
        # budget events carry deltas at top level, and spent never exceeds the cap here
        bu = by_type(evts, "budget_update")
        assert all(e["cost_delta"] >= 0 for e in bu) and bu[-1]["payload"]["spent_usd"] > 0
        assert c.get("/api/workspaces/demo-workspace/events/verify").json()["valid"]
        state = c.get("/api/workspaces/demo-workspace/state").json()
        assert state["tasks"][0]["subtasks"] and state["budgets"] and state["agents"]


def test_dependency_handoff_is_passed_to_next_agent(make_client):
    with make_client() as c:
        tid = c.post("/api/workspaces/demo-workspace/tasks", json={"prompt": "Build a login API and add tests"}).json()["id"]
        wait_event(c, "task_completed", pred=lambda e: e["task_id"] == tid)
        d = c.get(f"/api/tasks/{tid}").json()
        tests_sub = next(s for s in d["subtasks"] if "tests" in s["title"].lower())
        backend = next(s for s in d["subtasks"] if s["index"] == 0)
        assert backend["id"] in tests_sub["depends_on"]
        order = [e["subtask_id"] for e in events(c) if e["event_type"] in ("handoff_emitted", "dispatch_started")
                 and e["task_id"] == tid and e["subtask_id"]]
        assert order.index(backend["id"]) < order.index(tests_sub["id"])  # dependency finished first


# ------------------------------------------------------------------------------------------ conflicts
def test_conflict_detected_and_serialised(make_client):
    with make_client(sim_delay_seconds=0.05) as c:
        tid = c.post("/api/workspaces/demo-workspace/tasks",
                     json={"prompt": "Implement the backend API and do a security review"}).json()["id"]
        wait_event(c, "task_completed", pred=lambda e: e["task_id"] == tid, timeout=30)
        evts = [e for e in events(c) if e["task_id"] == tid]
        cf = by_type(evts, "conflict_detected")
        assert cf and cf[0]["payload"]["averted"] is True and "backend/**" in cf[0]["payload"]["paths"][0]
        blocked = cf[0]["subtask_id"]
        # the blocked subtask only starts after the blocker's handoff
        blocker = cf[0]["payload"]["blocked_by"][0]
        pos = {(e["event_type"], e["subtask_id"]): i for i, e in enumerate(evts)}
        assert pos[("handoff_emitted", blocker)] < pos[("dispatch_started", blocked)]
        recs = c.get("/api/workspaces/demo-workspace/conflicts").json()
        assert recs and recs[0]["resolution"] == "deferred" and recs[0]["resolved_at"]


# ------------------------------------------------------------------------------------------ budget
def test_circuit_breaker_pause_and_override(make_client):
    with make_client(sim_delay_seconds=0.01) as c:
        base = "/api/workspaces/demo-workspace"
        for p in ("claude_code", "codex", "gemini"):  # leave only Bob to spend, with a tiny cap
            for a in c.get(f"{base}/agents").json():
                if a["provider"] == p:
                    c.patch(f"{base}/agents/{a['id']}", json={"enabled": False})
        c.post(f"{base}/providers", json={"provider": "bob", "cap_usd": 2.6,
               "pricing": {"model": "token", "input_per_mtok": 1000, "output_per_mtok": 1000}})
        tid = c.post(f"{base}/tasks", json={"prompt": "Implement the endpoint"}).json()["id"]
        cb = wait_event(c, "circuit_breaker_triggered", timeout=20)
        assert cb["provider"] == "bob" and cb["payload"]["spent_usd"] >= cb["payload"]["cap_usd"]
        detail = wait_for(lambda: (lambda d: d if any(s["status"] == "paused_budget" for s in d["subtasks"]) else None)(
            c.get(f"/api/tasks/{tid}").json()), msg="paused subtask")
        assert detail["status"] == "running"
        assert c.get(f"{base}/budget").json()["providers"][0]["breaker_state"] == "open"
        r = c.post(f"{base}/budget/bob/override", json={"additional_usd": 100, "reason": "demo"})
        assert r.status_code == 200 and r.json()["breaker_state"] == "closed" and r.json()["resumed_subtasks"] >= 1
        done = wait_event(c, "task_completed", pred=lambda e: e["task_id"] == tid, timeout=20)
        assert done["payload"]["status"] == "completed"
        ov = [e for e in events(c) if e["event_type"] == "budget_update" and e["payload"].get("override")]
        assert ov and ov[0]["payload"]["by"]
        assert c.get(f"{base}/events/verify").json()["valid"]


# ------------------------------------------------------------------------------------------ RBAC
def _register(c, email):
    r = c.post("/api/auth/register", json={"email": email, "password": "password123", "name": email.split("@")[0]})
    assert r.status_code == 201, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}


def test_rbac_and_authorization_denied_events(make_client):
    with make_client(auth_mode="jwt", sim_delay_seconds=0.15) as c:
        assert c.get("/api/workspaces").status_code == 401
        owner, viewer, ctl, ctl2, stranger = (_register(c, f"{n}@x.io") for n in ("owner", "viewer", "ctl", "ctl2", "stranger"))
        wsid = c.post("/api/workspaces", json={"name": "Team", "id": "team-ws"}, headers=owner).json()["id"]
        base = f"/api/workspaces/{wsid}"
        for email, role in (("viewer@x.io", "view"), ("ctl@x.io", "control"), ("ctl2@x.io", "control")):
            assert c.put(f"{base}/members", json={"email": email, "role": role}, headers=owner).status_code == 200
        assert c.post(f"{base}/providers", json={"provider": "bob"}, headers=ctl).status_code == 403  # control can't connect
        assert c.post(f"{base}/providers", json={"provider": "bob"}, headers=owner).status_code == 201
        assert c.post(f"{base}/providers", json={"provider": "claude_code", "api_key": "sk-ant-SECRET"}, headers=owner).status_code == 201
        assert c.get(base, headers=stranger).status_code == 404          # non-members can't even see it exists
        assert c.get(f"{base}/events", headers=viewer).status_code == 200
        r = c.post(f"{base}/tasks", json={"prompt": "Build a login API"}, headers=viewer)
        assert r.status_code == 403
        evts = c.get(f"{base}/events", params={"limit": 1000}, headers=owner).json()
        denied = by_type(evts, "authorization_denied")
        assert denied and denied[-1]["payload"]["action"] == "submit task" and denied[-1]["payload"]["role"] == "view"
        tid = c.post(f"{base}/tasks", json={"prompt": "Build a login API and a React dashboard, add tests"}, headers=ctl).json()["id"]
        # another *control* user is not the owner -> cannot stop; viewers neither
        assert c.post(f"/api/tasks/{tid}/stop", headers=ctl2).status_code == 403
        assert c.post(f"/api/tasks/{tid}/stop", headers=viewer).status_code == 403
        assert c.post(f"{base}/budget/bob/override", json={"additional_usd": 5}, headers=ctl).status_code == 403
        assert c.post(f"/api/tasks/{tid}/stop", headers=ctl).status_code == 200      # owner of the task
        d = c.get(f"/api/tasks/{tid}", headers=viewer).json()
        assert d["status"] == "stopped" and all(s["status"] in ("cancelled", "completed") for s in d["subtasks"])
        evts = c.get(f"{base}/events", params={"limit": 1000}, headers=owner).json()
        assert by_type(evts, "task_completed")[-1]["payload"]["status"] == "stopped"
        assert c.get(f"{base}/events/verify", headers=viewer).json()["valid"]
        # approver can stop someone else's task
        tid2 = c.post(f"{base}/tasks", json={"prompt": "Build a login API"}, headers=ctl).json()["id"]
        assert c.post(f"/api/tasks/{tid2}/stop", headers=owner).status_code == 200


def test_ws_requires_membership_in_jwt_mode(make_client):
    from starlette.websockets import WebSocketDisconnect
    with make_client(auth_mode="jwt") as c:
        owner = _register(c, "o@x.io")
        stranger = _register(c, "s@x.io")
        c.post("/api/workspaces", json={"name": "T", "id": "ws-one"}, headers=owner)
        with pytest.raises(WebSocketDisconnect):
            with c.websocket_connect("/ws/workspace/ws-one"):
                pass
        with pytest.raises(WebSocketDisconnect):
            with c.websocket_connect("/ws/workspace/ws-one?token=" + stranger["Authorization"][7:]):
                pass
        with c.websocket_connect("/ws/workspace/ws-one?token=" + owner["Authorization"][7:]):
            pass


# ------------------------------------------------------------------------------------------ redirect
def test_redirect_running_subtask_to_other_agent(make_client):
    with make_client(sim_delay_seconds=0.2) as c:
        base = "/api/workspaces/demo-workspace"
        agents = {a["provider"]: a["id"] for a in c.get(f"{base}/agents").json()}
        # Deterministic redirect: gemini's CLI is installed in tests, so it would win the first subtask
        # and finish its (fast) run before the redirect lands. Disable it so the first subtask runs on
        # a slow simulated agent, leaving time to redirect it while still in flight.
        r = c.patch(f"{base}/agents/{agents['gemini']}", json={"enabled": False})
        assert r.status_code == 200
        tid = c.post(f"{base}/tasks", json={"prompt": "Implement the backend endpoint"}).json()["id"]
        sub = wait_for(lambda: next((s for s in c.get(f"/api/tasks/{tid}").json()["subtasks"] if s["status"] == "running"), None),
                       msg="running subtask")
        r = c.post(f"/api/tasks/{tid}/subtasks/{sub['id']}/redirect",
                   json={"agent_id": agents["codex"], "instruction": "use raw SQL"})
        assert r.status_code == 200
        wait_event(c, "task_completed", pred=lambda e: e["task_id"] == tid, timeout=30)
        d = c.get(f"/api/tasks/{tid}").json()
        s = d["subtasks"][0]
        assert s["provider"] == "codex" and s["attempts"] == 2 and "use raw SQL" in s["description"]
        assert [r["provider"] for r in d["routes"]][-1] == "codex"


# ------------------------------------------------------------------------------------------ security
def test_credentials_encrypted_and_never_returned(make_client):
    with make_client() as c:
        base = "/api/workspaces/demo-workspace"
        r = c.post(f"{base}/providers", json={"provider": "claude_code", "api_key": "sk-ant-PLAINTEXT-123"})
        assert r.status_code == 201
        assert "PLAINTEXT" not in r.text and r.json()["credential_stored"] is True
        assert "PLAINTEXT" not in c.get(f"{base}/providers").text
        (cipher,) = sql(c, "select secret_ciphertext from provider_connections where provider='claude_code'")[0]
        assert cipher and "PLAINTEXT" not in cipher
        ctx = c.app.state.ctx
        assert ctx.vault.decrypt(cipher) == "sk-ant-PLAINTEXT-123"
        assert c.post(f"{base}/providers", json={"provider": "nope"}).status_code == 422
        assert c.delete(f"{base}/providers/bob").status_code == 409


def test_tamper_evidence(make_client):
    with make_client() as c:
        base = "/api/workspaces/demo-workspace"
        assert c.get(f"{base}/events/verify").json()["valid"]
        sql(c, "update event_log set payload=? where seq=2", (json.dumps({"detail": "forged"}),))
        v = c.get(f"{base}/events/verify").json()
        assert v["valid"] is False and v["first_invalid_seq"] == 2 and "hash mismatch" in v["reason"]


def test_attachments_and_task_prompt_reference(make_client):
    with make_client() as c:
        base = "/api/workspaces/demo-workspace"
        a = c.post(f"{base}/attachments", files={"file": ("../../etc/spec doc.md", b"# spec")}).json()
        assert a["filename"] == "spec_doc.md" and a["size"] == 6
        assert c.post(f"{base}/tasks", json={"prompt": "Do it", "attachment_ids": ["nope"]}).status_code == 422
        r = c.post(f"{base}/tasks", json={"prompt": "Write docs from the spec", "attachment_ids": [a["id"]]})
        assert r.status_code == 202
        sub = [e for e in wait_for(lambda: events(c)) if e["event_type"] == "task_submitted"][-1]
        assert sub["payload"]["attachments"] == ["spec_doc.md"]


def test_without_bob_uses_heuristic_planner(make_client):
    """Bob not connected: the heuristic planner replaces the planning step and the subtasks go
    through the normal routing -> conflict -> runner -> execution flow (no fake Bob connection)."""
    with make_client(seed_demo_workspace=False) as c:  # allow_simulation defaults on
        base = "/api/workspaces/no-bob"
        assert c.post("/api/workspaces", json={"name": "x", "id": "no-bob"}).status_code == 201
        for p in ("claude_code", "codex", "gemini"):
            assert c.post(f"{base}/providers", json={"provider": p}).status_code == 201
        r = c.post(f"{base}/tasks", json={"prompt": PROMPT})
        assert r.status_code == 202
        tid = r.json()["id"]
        done = wait_event(c, "task_completed", ws="no-bob", pred=lambda e: e["task_id"] == tid)
        assert done["payload"]["status"] == "completed"
        evts = [e for e in events(c, ws="no-bob") if e["task_id"] == tid]
        plan = by_type(evts, "plan_decomposed")[0]["payload"]
        # planning was NOT attributed to Bob, and subtasks ran on the connected executors
        assert plan["planner"]["provider"] is None and plan["planner"]["mode"] == "heuristic-fallback"
        dispatched = [e["provider"] for e in by_type(evts, "dispatch_started")]
        assert dispatched and "bob" not in dispatched and set(dispatched) <= {"claude_code", "codex", "gemini"}
        assert len(by_type(evts, "handoff_emitted")) == len(plan["subtasks"])
        detail = c.get(f"/api/tasks/{tid}").json()
        assert detail["status"] == "completed" and all(s["status"] == "completed" for s in detail["subtasks"])
        assert c.get(f"{base}/events/verify").json()["valid"]


def test_without_bob_and_simulation_disabled_fails_clearly(make_client):
    """Bob unavailable AND allow_simulation=False: the task fails with an explicit error rather
    than pretending a planner exists."""
    with make_client(seed_demo_workspace=False, allow_simulation=False) as c:
        assert c.post("/api/workspaces", json={"name": "x", "id": "no-bob"}).status_code == 201
        r = c.post("/api/workspaces/no-bob/tasks", json={"prompt": "Build something"})
        assert r.status_code == 202
        tid = r.json()["id"]
        wait_event(c, "error", ws="no-bob",
                   pred=lambda e: e["task_id"] == tid and "No planner available" in e["payload"].get("message", ""))
        d = wait_for(lambda: (lambda t: t if t["status"] == "failed" else None)(c.get(f"/api/tasks/{tid}").json()),
                     msg="failed task")
        assert d["summary"] and "No planner available" in d["summary"]


# ------------------------------------------------------------------------------------------ transport
def test_websocket_replay_then_live_without_gaps_or_dupes(make_client):
    with make_client() as c:
        with c.websocket_connect("/ws/workspace/demo-workspace?replay=3") as ws:
            first = [ws.receive_json() for _ in range(3)]
            assert [e["seq"] for e in first] == sorted(e["seq"] for e in first)
            c.post("/api/workspaces/demo-workspace/tasks", json={"prompt": "Implement the endpoint"})
            got, seen_types = [], set()
            while "task_completed" not in seen_types:
                e = ws.receive_json()
                WorkspaceEvent.model_validate(e)
                got.append(e["seq"])
                seen_types.add(e["event_type"])
            assert got == list(range(got[0], got[0] + len(got)))  # strictly consecutive
            assert first[-1]["seq"] + 1 == got[0]
            assert {"task_submitted", "plan_decomposed", "route_decided", "dispatch_started", "log_line"} <= seen_types


def test_live_server_sse_and_websocket(tmp_path):
    """Real uvicorn socket: proves SSE streaming and the WebSocket the browser will actually use."""
    import socket, threading, time as _t
    import httpx, uvicorn, websockets.sync.client as wsc
    from app.config import Settings
    from app.main import create_app

    with socket.socket() as sk:
        sk.bind(("127.0.0.1", 0))
        port = sk.getsockname()[1]
    app = create_app(Settings(data_dir=tmp_path / "live", sim_delay_seconds=0.0, entitlement_poll_seconds=0,
                              # hermetically deterministic: the fake agy "installs" gemini so the router
                              # completes tasks instantly instead of invoking the real Antigravity CLI
                              gemini_cmd=f"{sys.executable} {FAKE_AGY} {{prompt}}",
                              gemini_plan_cmd=f"{sys.executable} {FAKE_AGY} {{prompt}}"))
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", ws="websockets"))
    th = threading.Thread(target=server.run, daemon=True)
    th.start()
    try:
        for _ in range(100):
            if server.started:
                break
            _t.sleep(0.05)
        assert server.started
        base = f"http://127.0.0.1:{port}"
        # SSE replay
        with httpx.stream("GET", f"{base}/api/workspaces/demo-workspace/events/stream?replay=2", timeout=10) as r:
            assert r.headers["content-type"].startswith("text/event-stream")
            datas = []
            for line in r.iter_lines():
                if line.startswith("data:"):
                    datas.append(json.loads(line[5:]))
                if len(datas) == 2:
                    break
        assert [d["event_type"] for d in datas] == ["provider_connected"] * 2
        # WebSocket at the exact path the frontend's .env.example uses, Origin like GitHub Pages
        with wsc.connect(f"ws://127.0.0.1:{port}/ws/workspace/demo-workspace?replay=1",
                         origin="https://aashvarsha26.github.io") as ws:
            WorkspaceEvent.model_validate(json.loads(ws.recv(timeout=5)))
            httpx.post(f"{base}/api/workspaces/demo-workspace/tasks", json={"prompt": "Implement the endpoint"})
            seen = set()
            end = _t.time() + 15
            while "task_completed" not in seen and _t.time() < end:
                seen.add(json.loads(ws.recv(timeout=10))["event_type"])
            assert "task_completed" in seen and "handoff_emitted" in seen
        # CORS preflight from the GitHub Pages origin
        pre = httpx.options(f"{base}/api/workspaces/demo-workspace/tasks", headers={
            "Origin": "https://aashvarsha26.github.io", "Access-Control-Request-Method": "POST"})
        assert pre.headers.get("access-control-allow-origin") == "https://aashvarsha26.github.io"
    finally:
        server.should_exit = True
        th.join(timeout=10)


def test_redis_bus_fanout():
    import fakeredis.aioredis
    from app.bus import RedisBus

    async def run():
        bus = RedisBus("redis://fake", client=fakeredis.aioredis.FakeRedis(decode_responses=True))
        await bus.start()
        async with bus.subscribe("w1") as q:
            await asyncio.sleep(0.1)
            await bus.publish("w1", {"seq": 1, "x": "y"})
            await bus.publish("other", {"seq": 9})
            assert await asyncio.wait_for(q.get(), 3) == {"seq": 1, "x": "y"}
            assert q.empty()
        await bus.stop()
    asyncio.run(run())


# ------------------------------------------------------------------------------------------ real subprocess path
def _claude_agent(c):
    ctx = c.app.state.ctx
    ctx.settings.claude_cmd = f"{sys.executable} {FAKE} {{prompt}}"
    ctx.settings.claude_plan_cmd = ctx.settings.claude_cmd
    base = "/api/workspaces/demo-workspace"
    ag = next(a for a in c.get(f"{base}/agents").json() if a["provider"] == "claude_code")
    from app.models import Agent

    async def get():
        async with ctx.db.sessionmaker() as s:
            return await s.get(Agent, ag["id"])
    return ctx, c.portal.call(get)


def test_real_subprocess_parsing_cost_reconciliation_and_handoff(make_client):
    from app.services.planning import parse_handoff
    with make_client() as c:
        ctx, agent = _claude_agent(c)
        req = RunRequest(prompt="do it", cwd=ctx.settings.workspaces_root / "demo-workspace" / "repo", title="t")
        out = c.portal.call(lambda: ctx.runner.run(ws_id="demo-workspace", task_id=None, subtask_id=None, agent=agent, req=req))
        assert out.ok and not out.simulated and out.files == ["backend/app.py"]
        assert out.tokens == 3000                     # duplicate message id NOT double counted
        assert abs(out.cost_usd - 0.05) < 1e-9        # reconciled to vendor-reported total_cost_usd
        assert parse_handoff(out.final_text)["decisions"] == ["use sqlite"]
        evts = events(c)
        d = [e for e in by_type(evts, "dispatch_started") if e["provider"] == "claude_code"][-1]
        assert d["payload"]["simulated"] is False and "fake_cli.py" in d["payload"]["command"]
        assert any(e["payload"].get("line") == "plain non-json line" for e in by_type(evts, "log_line"))


def test_real_subprocess_killed_by_circuit_breaker_and_timeout(make_client):
    with make_client() as c:
        ctx, agent = _claude_agent(c)
        base = "/api/workspaces/demo-workspace"
        cwd = ctx.settings.workspaces_root / "demo-workspace" / "repo"
        # tiny cap: first usage event (3000 tokens ~ $0.036) trips the breaker and the still-sleeping process must die
        c.post(f"{base}/providers", json={"provider": "claude_code", "cap_usd": 0.01})
        holder = {}
        req = RunRequest(prompt="SLEEP forever", cwd=cwd, title="t")
        out = c.portal.call(lambda: ctx.runner.run(ws_id="demo-workspace", task_id=None, subtask_id=None, agent=agent, req=req,
                                                   on_handle=lambda h: holder.setdefault("h", h)))
        assert out.tripped and not out.ok
        assert holder["h"].proc.returncode is not None  # child process group was killed
        assert by_type(events(c), "circuit_breaker_triggered")
        # timeout path
        c.post(f"{base}/budget/claude_code/override", json={"additional_usd": 50})
        req2 = RunRequest(prompt="SLEEP forever", cwd=cwd, title="t2", timeout=1.5)
        # first usage line arrives instantly; give it a prompt without usage by using timeout only
        ctx.settings.claude_cmd = f"{sys.executable} -c 'import time;print(1,flush=True);time.sleep(60)' {{prompt}}"
        out2 = c.portal.call(lambda: ctx.runner.run(ws_id="demo-workspace", task_id=None, subtask_id=None, agent=agent, req=req2))
        assert not out2.ok and "timed out" in (out2.error or "")


def test_missing_cli_without_simulation_fails_cleanly(make_client):
    # every CLI (incl. gemini) is absent on this host and simulation is off -> clean failure
    with make_client(allow_simulation=False, gemini_cmd="definitely-missing-agy -p {prompt}",
                     gemini_plan_cmd="definitely-missing-agy -p {prompt}") as c:
        tid = c.post("/api/workspaces/demo-workspace/tasks", json={"prompt": "Implement the endpoint"}).json()["id"]
        err = wait_event(c, "error", pred=lambda e: "not found on PATH" in e["payload"].get("message", "") or "Task failed" in e["payload"].get("message", ""))
        d = wait_for(lambda: (lambda x: x if x["status"] == "failed" else None)(c.get(f"/api/tasks/{tid}").json()))
        assert d["status"] == "failed"


# ------------------------------------------------------------------------------------------ units
def test_normalizers():
    st = {}
    ev = claude_event({"type": "assistant", "message": {"id": "a", "content": [
        {"type": "tool_use", "name": "Write", "input": {"file_path": "x.py"}}], "usage": {"input_tokens": 5, "output_tokens": 7}}}, st)
    assert [e.kind for e in ev] == ["log", "file", "usage"] and ev[2].tokens_out == 7
    assert claude_event({"type": "result", "is_error": True, "result": "boom"}, {})[-1].kind == "error"
    cx = codex_event({"type": "item.completed", "item": {"type": "file_change", "changes": [{"path": "a.py"}]}}, {})
    assert cx[-1].files == ["a.py"]
    assert codex_event({"type": "turn.completed", "usage": {"input_tokens": 3, "output_tokens": 4}}, {})[0].tokens_in == 3
    g = generic_event({"type": "message", "text": "hi", "usage": {"prompt_tokens": 2, "completion_tokens": 3}, "cost_usd": 0.1}, {})
    assert [e.kind for e in g] == ["log", "usage", "cost_total"]


def test_gemini_agy_command_construction(tmp_path):
    from app.adapters.base import RunRequest
    from app.adapters.providers import GeminiAdapter
    from app.config import Settings
    adapter = GeminiAdapter(Settings(data_dir=tmp_path / "d"))
    argv = adapter.build_argv(RunRequest(prompt="Build a counter", cwd=tmp_path, mode="execute"))
    assert argv == ["agy", "-p", "Build a counter", "--output-format", "stream-json", "--mode", "accept-edits"]
    assert "--dangerously-skip-permissions" not in argv
    plan_argv = adapter.build_argv(RunRequest(prompt="p", cwd=tmp_path, mode="plan"))
    assert plan_argv == ["agy", "-p", "p", "--output-format", "stream-json", "--mode", "plan"]
    assert adapter.executable() == "agy"


def test_antigravity_event_parsing(tmp_path):
    from app.adapters.providers import GeminiAdapter
    from app.config import Settings
    adapter = GeminiAdapter(Settings(data_dir=tmp_path / "d"))
    st: dict = {}
    ev: list = []
    for obj in [
        {"event": "init", "conversation_id": "c1", "init": {"cwd": "/ws", "tools": ["run_command", "write_to_file"],
                                                             "permission_mode": "request-review"}},
        {"event": "step_update", "step_update": {"step_index": 0, "state": "DONE", "step_type": "user_input"}},
        {"event": "step_update", "step_update": {"step_index": 1, "state": "ACTIVE", "step_type": "agent_response",
                                                 "text_delta": "Hello"}},
        {"event": "step_update", "step_update": {"step_index": 1, "state": "DONE", "step_type": "agent_response",
                                                 "text_delta": " world\n", "usage": {"input_tokens": 100,
                                                                                     "output_tokens": 50,
                                                                                     "thinking_tokens": 10,
                                                                                     "total_tokens": 160}}},
        {"event": "step_update", "step_update": {"step_index": 2, "state": "DONE", "step_type": "tool",
                                                 "tool_name": "write_to_file",
                                                 "tool_info": {"name": "write_to_file",
                                                               "parameters": {"FilePath": "src/app.py"},
                                                               "output": "written"}}},
        {"event": "step_update", "step_update": {"step_index": 3, "state": "DONE", "step_type": "tool",
                                                 "tool_name": "run_command",
                                                 "tool_info": {"name": "run_command",
                                                               "parameters": {"CommandLine": "npm test"},
                                                               "error": {"type": "MCP_TOOL_USE",
                                                                         "message": "permission denied"}}}},
        {"event": "result", "result": {"status": "SUCCESS", "response": "Done\n", "duration_seconds": 4.2,
                                       "usage": {"input_tokens": 200, "output_tokens": 80, "thinking_tokens": 20,
                                                 "total_tokens": 300}}},
    ]:
        ev += adapter.parse_json_event(obj, st)
    assert [e.kind for e in ev] == ["log", "log", "log", "usage", "log", "file", "log", "error", "result"]
    assert ev[0].text.startswith("session started (permission mode: request-review)")
    assert ev[3].tokens_in == 100 and ev[3].tokens_out == 60       # output + thinking tokens
    assert ev[5].files == ["src/app.py"]
    assert ev[6].text == "tool: run_command npm test"
    assert ev[7].text == "permission denied"
    assert ev[8].text == "Done\n"
    # agy repeats cumulative usage in the final result; the parser must not count it twice.
    assert [e for e in ev if e.kind == "usage"] == [ev[3]]
    # ERROR result -> error event (no result event)
    err = adapter.parse_json_event({"event": "result", "result": {"status": "ERROR", "error": "auth failed"}}, {})
    assert [e.kind for e in err] == ["error"]


# --------------------------------------------------------------------------------------- real routing
def _mock_budget(cap=5.0):
    return {"provider": "x", "cap_usd": cap, "spent_usd": 0.0, "remaining_usd": cap, "tokens_in": 0,
            "tokens_out": 0, "requests": 0, "breaker_state": "closed", "tripped_at": None}


def test_choose_prefers_real_executor_over_unavailable_higher_scorer():
    from app.catalog import PROVIDERS
    from app.services.routing import Candidate, choose
    bob = Candidate("b1", "bob", "IBM Bob", PROVIDERS["bob"]["capabilities"], PROVIDERS["bob"]["pricing"],
                    _mock_budget(), cli_available=False)
    gemini = Candidate("g1", "gemini", "Gemini CLI", PROVIDERS["gemini"]["capabilities"],
                       PROVIDERS["gemini"]["pricing"], _mock_budget(), cli_available=True)
    # Bob scores higher for planning (0.95 fit + 0.03 conductor bonus) but its CLI is NOT installed:
    # routing must skip it and pick the genuinely-available Gemini instead of a simulated Bob run.
    d = choose(["planning"], "decompose the data model", [bob, gemini])
    assert d.provider == "gemini" and d.agent_id == "g1"
    assert "CLI not installed" in d.rationale and d.rationale.split("Skipped:")[1].startswith(" IBM Bob")
    # when a CLI-independent matter is forced, unavailable agents survive the scoring filter (explicit override)
    d2 = choose([], "x", [bob, gemini], forced_agent_id="b1")
    assert d2.provider == "bob"


def test_choose_all_unavailable_keeps_simulation_fallback():
    from app.catalog import PROVIDERS
    from app.services.routing import Candidate, choose, RouteFailure
    cands = [
        Candidate("b1", "bob", "IBM Bob", PROVIDERS["bob"]["capabilities"], PROVIDERS["bob"]["pricing"],
                  _mock_budget(), cli_available=False),
        Candidate("g1", "gemini", "Gemini CLI", PROVIDERS["gemini"]["capabilities"],
                  PROVIDERS["gemini"]["pricing"], _mock_budget(), cli_available=False),
    ]
    d = choose(["planning"], "decompose the data model", cands)
    assert d.provider == "bob"          # demo mode: highest scorer still wins and runs labelled-simulated
    assert "CLI not installed" not in d.rationale
    with pytest.raises(RouteFailure):          # no candidates at all still raises
        choose([], "x", [])


def test_end_to_end_task_routes_to_real_gemini_when_bob_cli_missing(make_client):
    with make_client() as c:
        # only Antigravity (agy) has a genuinely runnable CLI on this host; bob/claude/codex do not.
        ctx = c.app.state.ctx
        ctx.settings.gemini_cmd = f"{sys.executable} {FAKE_AGY} {{prompt}}"
        ctx.settings.gemini_plan_cmd = ctx.settings.gemini_cmd
        base = "/api/workspaces/demo-workspace"
        tid = c.post(f"{base}/tasks", json={"prompt": PROMPT}).json()["id"]
        d = wait_for(lambda: (lambda x: x if x["status"] == "completed" else None)(c.get(f"/api/tasks/{tid}").json()),
                     timeout=60, msg="completed task")
        subs, routes = d["subtasks"], d["routes"]
        assert subs and all(s["provider"] == "gemini" and s["status"] == "completed" for s in subs)
        assert [r["provider"] for r in routes] == ["gemini"] * len(routes)
        dsp = [e for e in by_type(events(c), "dispatch_started") if e["task_id"] == tid
               and e["payload"].get("mode") == "execute"]
        assert dsp and all(e["payload"]["simulated"] is False and e["payload"]["provider"] == "gemini" for e in dsp)
        assert any("fake_agy.py" in e["payload"]["command"] for e in dsp)
