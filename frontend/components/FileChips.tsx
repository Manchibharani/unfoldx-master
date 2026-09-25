"use client";

import { formatBytes } from "@/lib/attachments";

export interface ChipFile {
  id: string;
  name: string;
  size: number;
  type?: string;
}

export function FileChips({
  files,
  onDetach,
  className = "",
}: {
  files: ChipFile[];
  onDetach?: (id: string) => void;
  className?: string;
}) {
  if (files.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {files.map((f) => (
        <span
          key={f.id}
          title={`${f.name}${f.type ? ` (${f.type})` : ""}`}
          className="inline-flex max-w-[200px] items-center gap-1 rounded-sm border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-parchment/85"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-muted"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="truncate">{f.name}</span>
          <span className="shrink-0 text-muted/60">{formatBytes(f.size)}</span>
          {onDetach && (
            <button
              type="button"
              title="Remove file"
              onClick={() => onDetach(f.id)}
              className="shrink-0 px-0.5 text-muted transition-colors hover:text-ledger-coral"
            >
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );
}