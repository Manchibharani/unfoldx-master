"""Stand-in for `claude -p ... --output-format stream-json`: emits Claude-Code-shaped JSON lines."""
import json, sys, time

prompt = sys.argv[1] if len(sys.argv) > 1 else ""
def out(o): print(json.dumps(o), flush=True)

out({"type": "system", "subtype": "init", "model": "fake-claude", "session_id": "s1"})
out({"type": "assistant", "message": {"id": "m1", "content": [
    {"type": "text", "text": "Working on it"},
    {"type": "tool_use", "name": "Edit", "input": {"file_path": "backend/app.py"}}],
    "usage": {"input_tokens": 1000, "output_tokens": 2000}}})
print("plain non-json line", flush=True)
if "SLEEP" in prompt:
    time.sleep(60)
out({"type": "assistant", "message": {"id": "m1", "content": [{"type": "text", "text": "echo of same message"}],
    "usage": {"input_tokens": 1000, "output_tokens": 2000}}})  # duplicate id: must NOT double count
handoff = {"summary": "did it", "decisions": ["use sqlite"], "constraints": ["py3.12"],
           "rejected_approaches": ["orm-less"], "files_touched": ["backend/app.py"]}
out({"type": "result", "is_error": False, "total_cost_usd": 0.05, "result": "Done\n```json\n" + json.dumps(handoff) + "\n```"})
