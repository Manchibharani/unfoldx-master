"""Stand-in for `opencode run --format json`: emits opencode NDJSON event lines."""
import json, sys, time

prompt = sys.argv[1] if len(sys.argv) > 1 else ""
def out(o): print(json.dumps(o), flush=True)

out({"type": "step_start", "part": {"type": "step-start"}})
out({"type": "text", "part": {"type": "text", "text": "Working on it"}})
out({"type": "tool_use", "part": {"type": "tool", "tool": "write",
     "state": {"input": {"filePath": "backend/app.py"}}}})
print("plain non-json line", flush=True)
if "SLEEP" in prompt:
    time.sleep(60)
# duplicate message id: usage must NOT double count
out({"type": "text", "part": {"type": "text", "text": "echo of same message", "messageID": "m1"}})
handoff = {"summary": "did it", "decisions": ["use sqlite"], "constraints": ["py3.12"],
           "rejected_approaches": ["orm-less"], "files_touched": ["backend/app.py"]}
out({"type": "text", "part": {"type": "text", "text": "Done\n```json\n" + json.dumps(handoff) + "\n```"}})
out({"type": "step_finish", "part": {"type": "step-finish", "reason": "stop", "cost": 0.05,
     "tokens": {"input": 1000, "output": 2000, "reasoning": 0, "cache": {"read": 0}}}})
