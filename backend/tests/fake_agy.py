"""Stand-in for `agy -p ... --output-format stream-json`: emits Antigravity stream-json NDJSON lines."""
import json, sys

prompt = sys.argv[1] if len(sys.argv) > 1 else ""
def out(o): print(json.dumps(o), flush=True)

out({"event": "init", "conversation_id": "s1",
     "init": {"cwd": ".", "tools": ["run_command", "write_to_file"], "permission_mode": "accept-edits"}})
out({"event": "step_update", "step_update": {"step_index": 0, "state": "DONE", "step_type": "user_input"}})
out({"event": "step_update", "step_update": {"step_index": 1, "state": "ACTIVE", "step_type": "agent_response",
                                             "text_delta": "Working on it"}})
out({"event": "step_update", "step_update": {"step_index": 2, "state": "DONE", "step_type": "tool",
     "tool_name": "write_to_file",
     "tool_info": {"name": "write_to_file", "parameters": {"FilePath": "backend/app.py"}}}})
out({"event": "step_update", "step_update": {"step_index": 1, "state": "DONE", "step_type": "agent_response",
                                             "text_delta": "\n",
                                             "usage": {"input_tokens": 1000, "output_tokens": 2000,
                                                       "thinking_tokens": 0, "total_tokens": 3000}}})
handoff = {"summary": "did it", "decisions": ["use sqlite"], "constraints": ["py3.12"],
           "rejected_approaches": ["orm-less"], "files_touched": ["backend/app.py"]}
out({"event": "result", "result": {"status": "SUCCESS",
     "response": "Done\n```json\n" + json.dumps(handoff) + "\n```",
     "duration_seconds": 1.0, "usage": {"input_tokens": 1000, "output_tokens": 2000,
                                         "thinking_tokens": 0, "total_tokens": 3000}}})