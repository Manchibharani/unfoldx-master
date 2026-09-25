"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const PREVIEW_URL = process.env.NEXT_PUBLIC_PREVIEW_URL ?? "http://localhost:3000";

function previewHost(): string {
  try {
    return new URL(PREVIEW_URL).host;
  } catch {
    return PREVIEW_URL;
  }
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const refresh = () => setKey((k) => k + 1);

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
              className="rounded-sm p-1 text-muted transition-colors hover:bg-ink-800 hover:text-parchment"
            >
              <RefreshIcon />
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              title="Expand preview"
              className="rounded-sm p-1 text-muted transition-colors hover:bg-ink-800 hover:text-parchment"
            >
              <ExpandIcon />
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-ink-700 bg-ink-900">
          <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-ledger-teal" />
            <span className="truncate font-mono text-[10px] text-muted">{previewHost()}</span>
            <a
              href={PREVIEW_URL}
              target="_blank"
              rel="noreferrer"
              className="ml-auto shrink-0 text-[10px] font-medium text-ledger-violet transition-colors hover:text-parchment"
            >
              open ↗
            </a>
          </div>
          <iframe
            key={key}
            src={PREVIEW_URL}
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
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[min(90vh,900px)] w-[min(94vw,1400px)] flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-ink-700 px-4 py-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-ledger-teal" />
              <span className="truncate font-mono text-xs text-parchment">{previewHost()}</span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={refresh}
                  title="Refresh preview"
                  className="rounded-sm px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-ink-800 hover:text-parchment"
                >
                  Refresh
                </button>
                <a
                  href={PREVIEW_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-sm px-2 py-1 text-[10px] font-medium text-ledger-violet transition-colors hover:text-parchment"
                >
                  Open in new tab ↗
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  title="Close (Esc)"
                  className="rounded-sm p-1.5 text-muted transition-colors hover:bg-ink-800 hover:text-ledger-coral"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            <iframe
              key={key}
              src={PREVIEW_URL}
              title="Live preview (expanded)"
              className="h-full w-full flex-1 border-0 bg-white"
              allow="fullscreen"
            />
          </motion.div>
        </div>
      )}
    </>
  );
}