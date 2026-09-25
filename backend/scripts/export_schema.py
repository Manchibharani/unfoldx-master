"""Regenerate schema/workspace-event.schema.json (copy it into the frontend repo's schema/ folder)."""
import json
from pathlib import Path

from app.schemas import WorkspaceEvent

out = Path(__file__).resolve().parent.parent / "schema" / "workspace-event.schema.json"
out.write_text(json.dumps(WorkspaceEvent.model_json_schema(), indent=2) + "\n")
print("wrote", out)
