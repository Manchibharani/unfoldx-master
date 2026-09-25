"use client";

import { useState, type FormEvent } from "react";
import type { MeResult, WorkspaceRole } from "@/lib/api";
import type { AuthStatus } from "@/lib/useAuth";

const ROLE_CHIP: Record<WorkspaceRole, string> = {
  view: "border-ink-600 bg-ink-800 text-state-inactive",
  control: "border-state-running/40 bg-state-running/10 text-state-running",
  approve: "border-state-warning/40 bg-state-warning/10 text-state-warning",
};

const ROLE_DOT: Record<WorkspaceRole, string> = {
  view: "bg-state-inactive",
  control: "bg-state-running",
  approve: "bg-state-warning",
};

const STATUS_LABEL: Record<AuthStatus, string> = {
  loading: "loading role…",
  anonymous: "guest",
  authenticated: "signed in",
  mock: "mock mode",
};

interface AuthBarProps {
  status: AuthStatus;
  user: MeResult | null;
  role: WorkspaceRole | null;
  busy: boolean;
  error: string | null;
  onLogin: (email: string, password: string) => Promise<boolean>;
  onRegister: (input: { email: string; password: string; name?: string; role: WorkspaceRole }) => Promise<boolean>;
  onLogout: () => void;
}

/**
 * Minimal session control: sign in, or register a demo account that joins
 * this workspace as a chosen role. Once a session exists it shows the identity
 * + in-workspace role so two side-by-side browsers can demo role gating.
 */
export function AuthBar({ status, user, role, busy, error, onLogin, onRegister, onLogout }: AuthBarProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [roleChoice, setRoleChoice] = useState<WorkspaceRole>("view");

  const signedIn = status === "authenticated";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok =
      mode === "login"
        ? await onLogin(email.trim(), password)
        : await onRegister({ email: email.trim(), password, name: name.trim() || undefined, role: roleChoice });
    if (ok) {
      setOpen(false);
      setEmail("");
      setPassword("");
      setMode("login");
    }
  };

  const input =
    "min-w-0 w-full rounded-sm border border-ink-600 bg-ink-800 px-2 py-1 text-[11px] text-parchment outline-none placeholder:text-muted focus:border-state-orchestration/60";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <span
          title={!role && error ? error : undefined}
          className="text-[10px] uppercase tracking-wide text-state-inactive"
        >
          {STATUS_LABEL[status]}
          {!role && error && <span className="ml-1 text-state-conflict">· no role</span>}
        </span>
        {role && (
          <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${ROLE_CHIP[role]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[role]}`} />
            {role}
          </span>
        )}
        {signedIn ? (
          <>
            <span className="max-w-[160px] truncate text-[10px] text-parchment">{user?.email}</span>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-sm border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-[10px] font-medium text-state-inactive hover:text-state-conflict"
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={status === "mock"}
            className="rounded-sm border border-state-orchestration/50 bg-state-orchestration/10 px-2 py-0.5 text-[10px] font-medium text-state-orchestration disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sign in / Register
          </button>
        )}
      </div>

      {open && (
        <div className="w-72 rounded-md border border-ink-600 bg-ink-900 p-2.5 shadow-xl shadow-black/40">
          <div className="mb-2 flex gap-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 rounded-sm px-2 py-1 text-[10px] font-medium ${
                mode === "login" ? "bg-ink-700 text-parchment" : "text-muted hover:text-parchment"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 rounded-sm px-2 py-1 text-[10px] font-medium ${
                mode === "register" ? "bg-ink-700 text-parchment" : "text-muted hover:text-parchment"
              }`}
            >
              Register (demo)
            </button>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-1.5">
            {mode === "register" && (
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className={input} />
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={input}
            />
            <input
              type="password"
              required
              minLength={mode === "register" ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`Password (${mode === "register" ? "min 8 chars" : "…"})`}
              className={input}
            />
            {mode === "register" && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-muted/70">Join as</label>
                <select
                  value={roleChoice}
                  onChange={(e) => setRoleChoice(e.target.value as WorkspaceRole)}
                  className="flex-1 rounded-sm border border-ink-600 bg-ink-800 px-1.5 py-1 text-[10px] text-parchment outline-none focus:border-state-orchestration/60"
                >
                  <option value="view">view</option>
                  <option value="control">control</option>
                  <option value="approve">approve</option>
                </select>
              </div>
            )}

            {error && (
              <p className="max-h-16 overflow-y-auto border-l border-state-conflict/50 pl-2 text-[10px] leading-snug text-state-conflict">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="rounded-sm border border-state-orchestration/50 bg-state-orchestration/10 px-2 py-1 text-[10px] font-medium text-state-orchestration disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (mode === "login" ? "Signing in…" : "Creating account…") : mode === "login" ? "Sign in" : "Create account & join"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}