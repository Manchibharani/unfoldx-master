from __future__ import annotations


def agent_out(a) -> dict:
    return {"id": a.id, "provider": a.provider, "name": a.name, "model": a.model, "capabilities": a.capabilities,
            "enabled": a.enabled}


def subtask_out(s) -> dict:
    return {"id": s.id, "task_id": s.task_id, "index": s.idx, "title": s.title, "description": s.description,
            "capabilities": s.capabilities, "target_files": s.target_files, "depends_on": s.depends_on, "status": s.status,
            "agent_id": s.agent_id, "provider": s.provider, "attempts": s.attempts, "result_summary": s.result_summary,
            "error": s.error, "cost_usd": round(s.cost_usd, 6), "tokens": s.tokens,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "finished_at": s.finished_at.isoformat() if s.finished_at else None}


def task_out(t) -> dict:
    return {"id": t.id, "workspace_id": t.workspace_id, "prompt": t.prompt, "status": t.status, "created_by": t.created_by,
            "summary": t.summary, "cost_usd": round(t.cost_usd, 6), "tokens": t.tokens, "attachment_ids": t.attachment_ids,
            "created_at": t.created_at.isoformat(), "completed_at": t.completed_at.isoformat() if t.completed_at else None}


def handoff_out(h) -> dict:
    return {"id": h.id, "task_id": h.task_id, "subtask_id": h.subtask_id, "agent_id": h.agent_id, "provider": h.provider,
            "model": h.model, "session_id": h.session_id, "decisions": h.decisions, "constraints": h.constraints,
            "rejected_approaches": h.rejected_approaches, "files_touched": h.files_touched, "summary": h.summary,
            "structured": h.structured, "created_at": h.created_at.isoformat()}


def route_out(r) -> dict:
    return {"id": r.id, "subtask_id": r.subtask_id, "agent_id": r.agent_id, "provider": r.provider, "score": r.score,
            "est_cost_usd": r.est_cost_usd, "quota_remaining_usd": r.quota_remaining_usd, "rationale": r.rationale,
            "breakdown": r.breakdown, "created_at": r.created_at.isoformat()}


def conflict_out(c) -> dict:
    return {"id": c.id, "subtask_id": c.subtask_id, "other_subtask_id": c.other_subtask_id, "paths": c.paths,
            "resolution": c.resolution, "created_at": c.created_at.isoformat(),
            "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None}
