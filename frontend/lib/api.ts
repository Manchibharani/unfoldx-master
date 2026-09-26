"use client";

/**
 * Thin REST client for the FastAPI backend (everything under /api).
 *
 * Every call goes through apiFetch, which attaches the bearer token from
 * POST /api/auth/login whenever one is stored. That keeps auth transparent:
 * with AUTH_MODE=open the backend runs token-less, and any stored token is
 * forwarded consistently across endpoints.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "uaw.access_token";

/** In-workspace role the backend enforces (view < control < approve). */
export type WorkspaceRole = "view" | "control" | "approve";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode, …) — calls just go token-less
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `Request failed (HTTP ${status})`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Fetch wrapper: JSON in/out, bearer token attached when one is stored.
 * Pass `auth = false` for calls that must run as the anonymous guest (used by
 * the demo join flow, where the open-mode guest owns the workspace).
 */
async function apiFetch<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (auth) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const body = init.body;
  if (body && !(body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${API_URL}${path}`, { ...init, headers, body });
  if (!response.ok) {
    let detail: unknown = response.statusText;
    try {
      const payload = (await response.json()) as { detail?: unknown } | unknown;
      if (payload && typeof payload === "object" && "detail" in payload) {
        detail = (payload as { detail: unknown }).detail;
      } else {
        detail = payload;
      }
    } catch {
      // non-JSON error body
    }
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Human-readable message for any thrown API/network error. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const d = error.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((item) =>
          item && typeof item === "object" && "msg" in item && typeof (item as { msg: unknown }).msg === "string"
            ? (item as { msg: string }).msg
            : JSON.stringify(item)
        )
        .join("; ");
    }
    if (d && typeof d === "object") {
      try {
        return JSON.stringify(d);
      } catch {
        return error.message;
      }
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface LoginResult {
  access_token: string;
  token_type: string;
  user: { id: string; email: string; name: string };
}

/** GET /api/auth/me — identity only; the workspace role comes from getInfo. */
export interface MeResult {
  id: string;
  email: string;
  name: string;
  /** /me always includes this; /register does not. */
  guest?: boolean;
}

/** GET /api/workspaces/{id} — includes this caller's role in the workspace. */
export interface WorkspaceInfo {
  id: string;
  name: string;
  role: WorkspaceRole;
  owner_id: string;
}

export interface AgentDto {
  id: string;
  provider: string;
  name: string;
  model: string | null;
  capabilities: unknown;
  enabled: boolean;
}

export interface UploadedAttachment {
  id: string;
  filename: string;
  size: number;
}

export const authApi = {
  async login(email: string, password: string): Promise<LoginResult> {
    const result = await apiFetch<LoginResult>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(result.access_token);
    return result;
  },
  register(body: { email: string; password: string; name?: string }): Promise<LoginResult> {
    return apiFetch<LoginResult>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  me(): Promise<MeResult> {
    return apiFetch<MeResult>("/api/auth/me");
  },
  logout(): void {
    setAccessToken(null);
  },
};

/** GET /api/workspaces/{id}/events/verify — hash-chain + signature verification. */
export interface VerifyResult {
  valid: boolean;
  checked: number;
  first_invalid_seq?: number;
  reason?: string;
  head_hash?: string | null;
}

/** One row of GET /api/workspaces/{id}/budget (mirrors BudgetService output). */
export interface BudgetRow {
  provider: string;
  cap_usd: number;
  spent_usd: number;
  remaining_usd: number;
  tokens_in: number;
  tokens_out: number;
  requests: number;
  breaker_state: string;
  tripped_at: string | null;
}

export interface BudgetsResponse {
  providers: BudgetRow[];
  total_spent_usd: number;
  total_cap_usd: number;
}

export const budgetApi = {
  /** Authoritative per-provider spend/token totals — used to hydrate/reconcile
   *  the ledger, which otherwise only moves on live budget_update events. */
  get(workspaceId: string): Promise<BudgetsResponse> {
    return apiFetch(`/api/workspaces/${workspaceId}/budget`);
  },
};

/** GET /api/workspaces/{id}/providers — entitlement + credential state per connected provider. */
export interface ProviderStatus {
  provider: string;
  display_name: string;
  cli_available: boolean;
  cli_version: string | null;
  mode: "real" | "simulated" | "unavailable";
  auth_type: "api_key" | "host_session" | null;
  /** Resolved credential state: api_key (stored/env), host_session (verified login),
   *  signed_out (CLI installed but login probe failed), no_credentials, disconnected. */
  auth_state: string;
  authenticated: boolean;
  credential_stored: boolean;
  env_key_present: boolean;
  credential_hint: string | null;
  connected: boolean;
  plan: string | null;
  quota: { monthly_request_quota: number; requests_used: number; requests_remaining: number } | null;
  budget: { cap_usd: number; spent_usd: number; remaining_usd: number } | null;
}

export const providerApi = {
  list(workspaceId: string): Promise<ProviderStatus[]> {
    return apiFetch(`/api/workspaces/${workspaceId}/providers`);
  },
  /** Store an API key for a provider (encrypted at rest; wins over env/.env values). */
  connectApiKey(workspaceId: string, provider: string, apiKey: string): Promise<ProviderStatus> {
    return apiFetch(`/api/workspaces/${workspaceId}/providers`, {
      method: "POST",
      body: JSON.stringify({ provider, api_key: apiKey, plan: "user" }),
    });
  },
  refresh(workspaceId: string, provider: string): Promise<ProviderStatus> {
    return apiFetch(`/api/workspaces/${workspaceId}/providers/${provider}/refresh`, { method: "POST" });
  },
};

export const workspaceApi = {
  /** The caller's role in this workspace (view/control/approve) + name/owner. */
  getInfo(workspaceId: string): Promise<WorkspaceInfo> {
    return apiFetch(`/api/workspaces/${workspaceId}`);
  },
  /** Recompute the whole hash chain + signatures and report tampering. */
  verifyEvents(workspaceId: string): Promise<VerifyResult> {
    return apiFetch(`/api/workspaces/${workspaceId}/events/verify`);
  },
  /**
   * PUT members: add/refresh a user's role in the workspace. Requires the
   * approver role. Pass `anonymous = true` to run as the open-mode guest
   * (who owns the seeded demo workspace) — used by the demo register flow.
   */
  joinWorkspace(
    workspaceId: string,
    email: string,
    role: WorkspaceRole,
    options: { anonymous?: boolean } = {}
  ): Promise<unknown> {
    return apiFetch(
      `/api/workspaces/${workspaceId}/members`,
      { method: "PUT", body: JSON.stringify({ email, role }) },
      !options.anonymous
    );
  },
  listAgents(workspaceId: string): Promise<AgentDto[]> {
    return apiFetch(`/api/workspaces/${workspaceId}/agents`);
  },
  addAgent(workspaceId: string, body: { provider: string; name?: string; model?: string }): Promise<AgentDto> {
    return apiFetch(`/api/workspaces/${workspaceId}/agents`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  submitTask(workspaceId: string, body: { prompt: string; attachment_ids?: string[] }): Promise<unknown> {
    return apiFetch(`/api/workspaces/${workspaceId}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  setBudgetCap(workspaceId: string, provider: string, capUsd: number): Promise<unknown> {
    return apiFetch(`/api/workspaces/${workspaceId}/budget/${provider}`, {
      method: "PUT",
      body: JSON.stringify({ cap_usd: capUsd }),
    });
  },
  approveOverride(workspaceId: string, provider: string, additionalUsd: number, reason?: string): Promise<unknown> {
    return apiFetch(`/api/workspaces/${workspaceId}/budget/${provider}/override`, {
      method: "POST",
      body: JSON.stringify({ additional_usd: additionalUsd, reason }),
    });
  },
  uploadAttachment(workspaceId: string, file: File): Promise<UploadedAttachment> {
    const form = new FormData();
    form.append("file", file, file.name);
    return apiFetch(`/api/workspaces/${workspaceId}/attachments`, { method: "POST", body: form });
  },
};

export const taskApi = {
  stop(taskId: string): Promise<unknown> {
    return apiFetch(`/api/tasks/${taskId}/stop`, { method: "POST" });
  },
  redirect(
    taskId: string,
    subtaskId: string,
    body: { agent_id?: string | null; instruction?: string | null }
  ): Promise<unknown> {
    return apiFetch(`/api/tasks/${taskId}/subtasks/${subtaskId}/redirect`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};