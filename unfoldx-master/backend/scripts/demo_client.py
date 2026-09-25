"""Tiny CLI: submit a task and print the live event feed.
   python -m scripts.demo_client "Build a login API and a React dashboard, add tests" [--url http://localhost:8000] [--ws demo-workspace]"""
import argparse, json, sys, threading

import httpx
import websockets.sync.client as wsc

ap = argparse.ArgumentParser()
ap.add_argument("prompt")
ap.add_argument("--url", default="http://localhost:8000")
ap.add_argument("--ws", default="demo-workspace")
ap.add_argument("--token", default=None)
a = ap.parse_args()
hdr = {"Authorization": f"Bearer {a.token}"} if a.token else {}
q = f"&token={a.token}" if a.token else ""
with wsc.connect(f"{a.url.replace('http', 'ws', 1)}/ws/workspace/{a.ws}?replay=0{q}") as sock:
    r = httpx.post(f"{a.url}/api/workspaces/{a.ws}/tasks", json={"prompt": a.prompt}, headers=hdr)
    r.raise_for_status()
    print("submitted task", r.json()["id"])
    while True:
        e = json.loads(sock.recv())
        p = e["payload"]
        detail = p.get("line") or p.get("reason") or p.get("detail") or p.get("summary") or p.get("message") or p.get("command") or ""
        print(f"#{e['seq']:>4} {e['event_type']:<26} {e.get('provider') or '':<12} {str(detail)[:110]}  {e['hash'][:8]}")
        if e["event_type"] in ("task_completed", "error") and p.get("task_id") == r.json()["id"] and (
                e["event_type"] == "task_completed" or p.get("status") == "failed"):
            break
