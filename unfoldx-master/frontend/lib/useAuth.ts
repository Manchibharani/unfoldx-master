"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  authApi,
  describeError,
  getAccessToken,
  setAccessToken,
  workspaceApi,
  type MeResult,
  type WorkspaceRole,
} from "./api";
import { permissionsFor, type Permissions } from "./permissions";

export type AuthStatus = "loading" | "anonymous" | "authenticated" | "mock";

export interface UseAuthResult {
  token: string | null;
  user: MeResult | null;
  role: WorkspaceRole | null;
  status: AuthStatus;
  busy: boolean;
  error: string | null;
  permissions: Permissions;
  login: (email: string, password: string) => Promise<boolean>;
  /** Registers a demo account, then joins this workspace as the given role. */
  register: (input: { email: string; password: string; name?: string; role: WorkspaceRole }) => Promise<boolean>;
  logout: () => void;
}

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

/**
 * Loads the current session's identity (/api/auth/me) and its role in the
 * given workspace (GET /api/workspaces/{id}). In AUTH_MODE=open an anonymous
 * browser still resolves to the guest approver, so the role is fetched even
 * without a token; with a token the response reflects that user's membership.
 */
export function useAuth(workspaceId: string): UseAuthResult {
  const [token, setToken] = useState<string | null>(() => (IS_MOCK ? null : getAccessToken()));
  const [user, setUser] = useState<MeResult | null>(null);
  const [role, setRole] = useState<WorkspaceRole | null>(() => (IS_MOCK ? "approve" : null));
  const [status, setStatus] = useState<AuthStatus>(IS_MOCK ? "mock" : "loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRole = useCallback(async () => {
    try {
      const info = await workspaceApi.getInfo(workspaceId);
      setRole(info.role);
      setError(null);
    } catch (err) {
      setRole(null);
      setError(describeError(err));
    }
  }, [workspaceId]);

  useEffect(() => {
    if (IS_MOCK) return;
    let alive = true;
    (async () => {
      const stored = getAccessToken();
      let me: MeResult | null = null;
      setStatus("loading");
      try {
        if (stored) {
          me = await authApi.me();
          if (!alive) return;
          setUser(me);
          setToken(stored);
        } else {
          if (!alive) return;
          setUser(null);
          setToken(null);
        }
      } catch {
        // Stored token is stale — drop it and keep the anonymous guest session.
        if (!alive) return;
        setAccessToken(null);
        setUser(null);
        setToken(null);
      }
      await loadRole();
      if (!alive) return;
      setStatus(me ? "authenticated" : "anonymous");
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId, loadRole]);

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (IS_MOCK) return false;
      setBusy(true);
      setError(null);
      try {
        await authApi.login(email, password);
        const me = await authApi.me();
        setUser(me);
        setToken(getAccessToken());
        await loadRole();
        setStatus("authenticated");
        return true;
      } catch (err) {
        setError(describeError(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [loadRole]
  );

  const register = useCallback(
    async (input: { email: string; password: string; name?: string; role: WorkspaceRole }): Promise<boolean> => {
      if (IS_MOCK) return false;
      setBusy(true);
      setError(null);
      try {
        const registered = await authApi.register({ email: input.email, password: input.password, name: input.name });
        // /register returns a bearer token just like /login. Persist it before
        // calling /me or joining the workspace, otherwise registration silently
        // falls back to the anonymous guest session.
        setAccessToken(registered.access_token);
        setToken(registered.access_token);
        setUser(registered.user);
        // Demo convenience: as the open-mode guest the frontend can add the
        // freshly registered user to this workspace with the chosen role.
        // Fails cleanly (with a hint) when the session can't manage members.
        try {
          await workspaceApi.joinWorkspace(workspaceId, input.email, input.role, { anonymous: true });
          await loadRole();
        } catch (joinErr) {
          setRole(null);
          setError(`Signed up, but could not join workspace as "${input.role}" (${describeError(joinErr)}). Ask an approver to add you.`);
        }
        setStatus("authenticated");
        return true;
      } catch (err) {
        setError(describeError(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [workspaceId, loadRole]
  );

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
    setToken(null);
    setRole(null);
    setError(null);
    if (IS_MOCK) return;
    // Back in open mode the anonymous guest is still an approver; reflect that.
    setStatus("loading");
    void loadRole().then(() => setStatus("anonymous"));
  }, [loadRole]);

  const permissions = useMemo(() => permissionsFor(role), [role]);

  return { token, user, role, status, busy, error, permissions, login, register, logout };
}