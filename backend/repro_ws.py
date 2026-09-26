"""One-off repro: JWT-mode live server - does the owner's WS receive task events?"""
import json, socket, threading, time, sys
import httpx, uvicorn
import websockets.sync.client as wsc
sys.path.insert(0, ".")
from app.config import Settings
from app.main import create_app

with socket.socket() as sk:
    sk.bind(("127.0.0.1", 0))
    port = sk.getsockname()[1]
app = create_app(Settings(data_dir="data_repro", auth_mode="jwt", sim_delay_seconds=0.0,
                          entitlement_poll_seconds=0))
server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", ws="websockets"))
th = threading.Thread(target=server.run, daemon=True)
th.start()
try:
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    assert server.started
    base = f"http://127.0.0.1:{port}"
    o = httpx.post(f"{base}/api/auth/register", json={"email": "o@x.io", "password": "password123"}).json()["access_token"]
    s = httpx.post(f"{base}/api/auth/register", json={"email": "s@x.io", "password": "password123"}).json()["access_token"]
    httpx.post(f"{base}/api/workspaces", json={"name": "T", "id": "ws-one"}, headers={"Authorization": "Bearer " + o})
    # deny attempts first (anonymous + stranger)
    for tok in (None, s):
        kw = {"additional_headers": {"Authorization": f"Bearer {tok}"}} if tok else {}
        try:
            with wsc.connect(f"ws://127.0.0.1:{port}/ws/workspace/ws-one", **kw) as ws:
                try:
                    f = ws.recv(timeout=5)
                    print("DENY PATH GOT FRAME (unexpected):", f[:80])
                except Exception as ex:
                    print("deny recv ->", type(ex).__name__, str(ex)[:80])
        except Exception as ex:
            print("deny connect ->", type(ex).__name__, str(ex)[:100])
    with wsc.connect(f"ws://127.0.0.1:{port}/ws/workspace/ws-one?token={o}") as ws:
        print("WS connected")
        r = httpx.post(f"{base}/api/workspaces/ws-one/tasks",
                       json={"prompt": "Implement the endpoint"}, headers={"Authorization": "Bearer " + o})
        print("task POST:", r.status_code)
        end = time.time() + 10
        n = 0
        try:
            while time.time() < end and n < 5:
                e = json.loads(ws.recv(timeout=10))
                n += 1
                print("frame:", e["seq"], e["event_type"])
        except Exception as ex:
            print("recv stopped:", type(ex).__name__, ex)
        print("total frames:", n)
finally:
    server.should_exit = True
    th.join(timeout=10)
