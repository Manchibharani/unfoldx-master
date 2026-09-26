"use client";

import { useCallback, useEffect, useState } from "react";
import { providerApi, describeError, type ProviderStatus } from "@/lib/api";
import { PROVIDER_LABEL } from "@/lib/graph";
import type { Provider } from "@/lib/types";
import { ProviderLogo } from "./ProviderLogo";

/**
 * Provider connectivity + credential repair panel.
 *
 * The backend can route work only to providers it can authenticate. This panel shows the
 * RESOLVED auth state (API key stored / env key found / verified CLI login / signed out /
 * no credentials) and repairs the fixable ones inline by storing an API key through
 * POST /providers — the same flow entitlement.credential_env() consumes at dispatch time.
 */

const STATE_STYLE: Record<string, { label: string; cls: string }> = {
  api_key: { label: "API key", cls: "border-state-running/40 bg-state-running/10 text-state-running" },
  host_session: { label: "CLI login", cls: "border-state-running/40 bg-state-running/10 text-state-running" },
  signed_out: { label: "signed out", cls: "border-state-warning/40 bg-state-warning/10 text-state-warning" },
  no_credentials: { label: "no credentials", cls: "border-state-warning/40 bg-state-warning/10 text-state-warning" },
  disconnected: { label: "not connected", cls: "border-white/10 bg-white/[0.03] text-muted" },
};

/** Providers whose CLIs authenticate via a host login OR an API key we can store. */
const KEYED: Provider[] = ["bob", "opencode", "codex", "github_copilot", "gemini"];

export function ProvidersPanel({ workspaceId, canApprove }: { workspaceId: string; canApprove: boolean }) {
  const [rows, setRows] = useState<ProviderStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    providerApi
      .list(workspaceId)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [workspaceId, nonce]);

  const save = useCallback(
    async (provider: Provider) => {
      if (!keyValue.trim()) return;
      setBusy(true);
      setError(null);
      try {
        await providerApi.connectApiKey(workspaceId, provider, keyValue.trim());
        setEditing(null);
        setKeyValue("");
        setNonce((n) => n + 1);
      } catch (e) {
        setError(describeError(e));
      } finally {
        setBusy(false);
      }
    },
    [workspaceId, keyValue]
  );

  return (
    <section className="mt-3 overflow-hidden rounded-xl bg-ink-900">
      <div className="border-b border-ink-700 px-4 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-state-info">Provider connections</h2>
        <p className="mt-0.5 text-[10px] text-muted">CLI found ≠ signed in. Repair credentials here.</p>
      </div>
      <div className="divide-y divide-ink-700/70">
        {error && <p className="px-4 py-2 text-[10px] text-state-conflict">{error}</p>}
        {rows.length === 0 && !error && (
          <p className="px-4 py-4 text-center text-[10px] text-muted/60">Loading provider status…</p>
        )}
        {rows.map((row) => {
          const provider = row.provider as Provider;
          const st = STATE_STYLE[row.auth_state] ?? STATE_STYLE.disconnected;
          return (
            <div key={row.provider} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <ProviderLogo provider={provider} size={16} />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-parchment">
                  {PROVIDER_LABEL[provider] ?? row.display_name}
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${st.cls}`}>
                  {st.label}
                </span>
              </div>
              {row.credential_hint && (
                <p className="mt-1 text-[10px] leading-relaxed text-muted">{row.credential_hint}</p>
              )}
              {editing === provider ? (
                <div className="mt-2 flex gap-1.5">
                  <input
                    type="password"
                    value={keyValue}
                    onChange={(e) => setKeyValue(e.target.value)}
                    placeholder="paste API key (stored encrypted)"
                    disabled={!canApprove || busy}
                    className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-ink-800 px-2.5 py-1.5 text-[11px] text-parchment outline-none placeholder:text-muted focus:border-accent-indigo/50 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={!canApprove || busy || !keyValue.trim()}
                    onClick={() => save(provider)}
                    className="rounded-lg bg-accent-indigo px-2.5 py-1 text-[10px] font-semibold text-white disabled:opacity-40"
                  >
                    {busy ? "…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setKeyValue("");
                    }}
                    className="rounded-lg border border-ink-600 px-2 py-1 text-[10px] text-muted hover:text-parchment"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                KEYED.includes(provider) &&
                row.auth_state !== "api_key" && (
                  <button
                    type="button"
                    disabled={!canApprove}
                    onClick={() => setEditing(provider)}
                    className="mt-1.5 rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1 text-[10px] text-muted hover:border-accent-indigo/40 hover:text-parchment disabled:opacity-40"
                    title={canApprove ? "Store an API key for this provider" : "Requires the approve role"}
                  >
                    Add API key
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
