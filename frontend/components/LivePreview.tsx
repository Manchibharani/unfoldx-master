"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Live preview shows the app the agents are building — not this app. The
 * iframe therefore only renders when NEXT_PUBLIC_PREVIEW_URL points at a
 * real generated-workspace preview (the backend exposes none today, so by
 * default there is nothing to show and we say so). The old default of
 * http://localhost:3000 iframed this dashboard inside itself and is gone.
 */
const CONFIGURED_URL = process.env.NEXT_PUBLIC_PREVIEW_URL ?? "";

function isSelfReferential(url: string): boolean {
  try {
    return new URL(url).host === window.location.host;
  } catch {
    return true; // unparseable URL: treat as unusable rather than guess
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

export function LivePreview() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  // A URL that is missing, unparseable, or points at this app's own origin
  // never becomes an iframe — the placeholder renders instead.
  const previewUrl = useMemo(() => {
    if (!CONFIGURED_URL) return null;
    return isSelfReferential(CONFIGURED_URL) ? null : CONFIGURED_URL;
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const refresh = () => setKey((k) => k + 1);

  if (!previewUrl) {
    return (
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted">Live preview</h2>
        </div>
        <div className="flex h-52 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ink-700 bg-ink-900 px-6 text-center">
          <MonitorOffIcon />
          <p className="text-xs font-medium text-parchment/80">Preview not connected</p>
          <p className="text-[11px] leading-relaxed text-muted/70">
            No preview URL is configured. The backend does not serve generated-workspace
            previews yet; set <span className="font-mono text-muted">NEXT_PUBLIC_PREVIEW_URL</span> to a
            running preview host (not this app) to enable it.
          </p>
        </div>
      </section>
    );
  }

  const previewHost = (() => {
    try {
      return new URL(previewUrl).host;
    } catch {
      return previewUrl;
    }
  })();

  return (
    <>
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted">Live preview</h2>
          <div className="flex items-center gap-1">
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

        <div className="overflow-hidden rounded-md border border-ink-700 bg-ink-900">
          <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-state-running" />
            <span className="truncate font-mono text-[10px] text-muted">{previewHost}</span>
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto shrink-0 text-[10px] font-medium text-state-orchestration hover:text-parchment"
            >
              open ↗
            </a>
          </div>
          <iframe
            key={key}
            src={previewUrl}
            title="Live preview of the app the agents are building"
            className="h-52 w-full border-0 bg-white"
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
              <span className="truncate font-mono text-xs text-parchment">{previewHost}</span>
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
                  href={previewUrl}
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
              src={previewUrl}
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