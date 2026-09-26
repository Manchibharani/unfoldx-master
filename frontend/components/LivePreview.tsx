"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

/**
 * Live preview shows the app the agents are building — not this app.
 *
 * Auto-discovery: when no URL is configured (env var / localStorage / manual),
 * the component asks the backend which artifact to show
 * (GET /api/workspaces/{id}/files/preview — picks index.html, then any .html,
 * then the first text file) and renders it from the backend origin. The
 * dashboard origin itself is rejected to avoid embedding this app inside
 * itself, and the iframe URL is refreshed as agents produce new files.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const CONFIGURED_URL = process.env.NEXT_PUBLIC_PREVIEW_URL ?? "";
const PREVIEW_STORAGE_KEY = "unfoldx.preview_url";
const DISCOVERY_POLL_MS = 8000;
const PINNED_HEALTH_CHECK_MS = 15000;

type PreviewSource = { url: string; origin: "discovered" | "configured" | "manual" };

function isUsablePreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.host !== window.location.host;
  } catch {
    return false;
  }
}

function MonitorOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13.7 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.3" />
      <path d="m2 2 20 20" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function LivePreview({ workspaceId = "demo-workspace" }: { workspaceId?: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [preview, setPreview] = useState<PreviewSource | null>(null);
  const [urlError, setUrlError] = useState("");
  const [artifacts, setArtifacts] = useState(false);
  const [discoveryNonce, setDiscoveryNonce] = useState(0);
  const configuredRef = useRef(false); // user/config pinned an explicit URL: stop discovery

  useEffect(() => {
    if (configuredRef.current) return; // manual/configured URL pinned: discovery paused
    // No explicit URL: discover what the agents built. Runs once and then polls,
    // so the preview appears (and updates) as soon as artifacts exist.
    let cancelled = false;
    const discover = () => {
      fetch(`${API_URL}/api/workspaces/${workspaceId}/files/preview`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: { path: string }) => {
          if (cancelled || !j.path) return;
          setArtifacts(true);
          setPreview((current) => {
            const url = `${API_URL}/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(j.path)}`;
            if (current?.url === url) return current;
            return { url, origin: "discovered" };
          });
        })
        .catch(() => {
          if (!cancelled) setArtifacts(false);
        });
    };
    discover();
    const timer = window.setInterval(discover, DISCOVERY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [workspaceId, discoveryNonce]);

  // One-time setup: pick up a pinned URL from storage/env before discovery takes over.
  useEffect(() => {
    const savedUrl = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (savedUrl && isUsablePreviewUrl(savedUrl)) {
      configuredRef.current = true;
      setUrlInput(savedUrl);
      setPreview({ url: savedUrl, origin: "manual" });
      return;
    }
    if (CONFIGURED_URL && isUsablePreviewUrl(CONFIGURED_URL)) {
      configuredRef.current = true;
      setUrlInput(CONFIGURED_URL);
      setPreview({ url: CONFIGURED_URL, origin: "configured" });
    }
  }, []);

  // Self-heal: a PINNED url whose server died (restart, closed dev server — e.g. a stale
  // localhost:PORT link) must not leave a permanently blank pane. Ping it; when it stops
  // responding, drop the pin and fall back to the workspace artifact discovery.
  useEffect(() => {
    if (!preview || preview.origin === "discovered") return;
    const pinnedUrl = preview.url;
    let cancelled = false;
    const check = async () => {
      try {
        // no-cors: an opaque response still proves the server is alive; a refused
        // connection / DNS failure rejects and triggers the fallback.
        await fetch(pinnedUrl, { mode: "no-cors", cache: "no-store" });
      } catch {
        if (cancelled || configuredRef.current === false) return;
        configuredRef.current = false;
        try {
          window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
        } catch {
          // ignore
        }
        setPreview(null);
        setDiscoveryNonce((n) => n + 1); // discovery effect takes over again
      }
    };
    const timer = window.setInterval(check, PINNED_HEALTH_CHECK_MS);
    void check();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [preview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const refresh = useCallback(() => setKey((k) => k + 1), []);

  const connectPreview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = urlInput.trim();
    if (!isUsablePreviewUrl(candidate)) {
      setUrlError("Enter an http(s) URL on a different host, such as http://localhost:3001.");
      return;
    }
    configuredRef.current = true;
    try {
      window.localStorage.setItem(PREVIEW_STORAGE_KEY, candidate);
    } catch {
      // storage unavailable — preview still works for this session
    }
    setPreview({ url: candidate, origin: "manual" });
    setUrlError("");
  };

  const useDiscovered = () => {
    configuredRef.current = false;
    try {
      window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
    } catch {
      // ignore
    }
    setPreview(null);
    setDiscoveryNonce((n) => n + 1); // re-run discovery immediately
  };

  const urlForm = (
    <form onSubmit={connectPreview} className="flex gap-1.5">
      <input
        type="url"
        value={urlInput}
        onChange={(event) => setUrlInput(event.target.value)}
        placeholder="http://localhost:3001"
        aria-label="Preview URL"
        className="min-w-0 flex-1 rounded-sm border border-ink-700 bg-ink-900 px-2 py-1.5 font-mono text-[10px] text-parchment placeholder:text-muted/60 focus:border-state-orchestration focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-sm bg-ink-700 px-2 text-[10px] font-medium text-parchment hover:bg-ink-600"
      >
        Connect
      </button>
    </form>
  );

  if (!preview) {
    return (
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted">Live preview</h2>
        </div>
        <div className="rounded-md bg-ink-800/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-parchment/80">
            <MonitorOffIcon />
            <p className="text-xs font-medium">
              {artifacts ? "Detecting preview…" : "No preview yet — waiting for the agents to build something"}
            </p>
          </div>
          {urlForm}
          <p className="mt-2 text-[11px] leading-relaxed text-muted/70">
            The preview picks up files the agents create in this workspace automatically
            (index.html first), or connect any running app URL above.
          </p>
          {urlError && <p role="alert" className="mt-1 text-[11px] text-state-conflict">{urlError}</p>}
        </div>
      </section>
    );
  }

  const previewHost = (() => {
    try {
      return new URL(preview.url).host;
    } catch {
      return preview.url;
    }
  })();
  const isDiscovered = preview.origin === "discovered";

  return (
    <>
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted">Live preview</h2>
          <div className="flex items-center gap-1">
            {preview.origin === "manual" && (
              <button
                type="button"
                onClick={useDiscovered}
                title="Go back to auto-detected workspace artifacts"
                className="rounded-sm px-1.5 py-1 text-[9px] text-state-inactive hover:bg-ink-800 hover:text-parchment"
              >
                Auto
              </button>
            )}
            <button
              type="button"
              onClick={refresh}
              title="Refresh preview"
              className="rounded-sm p-1 text-state-inactive hover:bg-ink-800 hover:text-parchment"
            >
              <RefreshIcon />
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              title="Expand preview"
              className="rounded-sm p-1 text-state-inactive hover:bg-ink-800 hover:text-parchment"
            >
              <ExpandIcon />
            </button>
          </div>
        </div>

        <div className="mb-2">
          {urlForm}
          {urlError && <p role="alert" className="mt-1 text-[11px] text-state-conflict">{urlError}</p>}
        </div>

        <div className="overflow-hidden rounded-md border border-ink-700 bg-ink-900">
          <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-state-running" />
            <span className="truncate font-mono text-[10px] text-muted">
              {isDiscovered ? "workspace artifact" : previewHost}
            </span>
            {isDiscovered && (
              <span className="shrink-0 rounded-full border border-state-running/30 bg-state-running/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-state-running">
                auto
              </span>
            )}
            <a
              href={preview.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto shrink-0 text-[10px] font-medium text-state-orchestration hover:text-parchment"
            >
              Open in new tab ↗
            </a>
          </div>
          <iframe
            key={key}
            src={preview.url}
            title="Live preview of the app the agents are building"
            className="h-[26rem] w-full border-0 bg-white"
            allow="fullscreen"
          />
        </div>
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[min(90vh,900px)] w-[min(94vw,1400px)] flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-ink-700 px-4 py-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-state-running" />
              <span className="truncate font-mono text-xs text-parchment">{isDiscovered ? "workspace artifact" : previewHost}</span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={refresh}
                  title="Refresh preview"
                  className="rounded-sm px-2 py-1 text-[10px] font-medium text-state-inactive hover:bg-ink-800 hover:text-parchment"
                >
                  Refresh
                </button>
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-sm px-2 py-1 text-[10px] font-medium text-state-orchestration hover:text-parchment"
                >
                  Open in new tab ↗
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  title="Close (Esc)"
                  className="rounded-sm p-1.5 text-state-inactive hover:bg-ink-800 hover:text-state-conflict"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            <iframe
              key={key}
              src={preview.url}
              title="Live preview (expanded)"
              className="h-full w-full flex-1 border-0 bg-white"
              allow="fullscreen"
            />
          </div>
        </div>
      )}
    </>
  );
}
