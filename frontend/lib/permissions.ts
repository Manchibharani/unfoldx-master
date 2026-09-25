/**
 * Role → UI permission mapping for the workspace canvas. Mirrors the backend's
 * role ladder (view < control < approve, see backend/app/deps.py RANK) so the
 * UI can visibly disable/hide actions the current session can't perform. This
 * never replaces server-side enforcement — the backend still checks every call.
 */
import type { WorkspaceRole } from "./api";

export interface Permissions {
  role: WorkspaceRole | null;
  /** control-level actions: submit tasks, stop/redirect, add agents, attach files, prompt agents. */
  canControl: boolean;
  /** approve-level actions: budget overrides (and member management). */
  canApprove: boolean;
}

const RANK: Record<WorkspaceRole, number> = { view: 1, control: 2, approve: 3 };

/** Unknown/null role is treated as least-privileged (view). */
export function permissionsFor(role: WorkspaceRole | null | undefined): Permissions {
  const rank = role ? RANK[role] : 1;
  return {
    role: role ?? null,
    canControl: rank >= 2,
    canApprove: rank >= 3,
  };
}