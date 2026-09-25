"use client";

import { useLayoutEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import type { Provider } from "@/lib/types";
import { PROVIDER_ACCENT, type FileDraft } from "@/lib/graph";
import type { ControlAction } from "@/lib/useOrchestration";
import type { Permissions } from "@/lib/permissions";
import { readFiles } from "@/lib/attachments";
import { FileChips } from "./FileChips";

const LOGO_ORDER: Provider[] = ["bob", "claude_code", "codex", "gemini"];
const ASSET_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

interface LogoSpec {
  label: string;
  short: string;
  mono: string;
  img?: string;
}

const LOGOS: Record<Provider, LogoSpec> = {
  bob: { label: "Bob Shell", short: "Bob", mono: "B", img: "/logos/bob.png" },
  claude_code: {
    label: "Claude Code",
    short: "Claude",
    mono: "CC",
    img: "/logos/claude-code.webp",
  },
  codex: { label: "Codex", short: "Codex", mono: "CX", img: "/logos/codex.webp" },
  gemini: { label: "Gemini", short: "Gemini", mono: "G", img: "/logos/gemini.png" },
  system: { label: "System", short: "System", mono: "S" },
};

const EDGE_MARGIN = 12;
const MIN_VISIBLE = 72;

function LogoButton({
  provider,
  disabled,
  onAction,
}: {
  provider: Provider;
  disabled?: boolean;
  onAction: (action: ControlAction) => void;
}) {
  const spec = LOGOS[provider];
  const accent = PROVIDER_ACCENT[provider];
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Adding agents requires the control role" : `Add ${spec.label} to the canvas`}
      onClick={() => onAction({ kind: "add_agent", provider })}
      className="group flex flex-col items-center gap-0.5 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border transition-transform group-hover:scale-105 group-hover:brightness-125"
        style={{ borderColor: `${accent}66`, backgroundColor: `${accent}1a` }}
      >
        {spec.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${ASSET_BASE_PATH}${spec.img}`} alt={spec.label} className="h-full w-full object-cover" />
        ) : (
          <span className="font-mono text-xs font-semibold uppercase" style={{ color: accent }}>
            {spec.mono}
          </span>
        )}
      </span>
      <span className="text-[9px] font-medium uppercase tracking-wide text-muted/70 transition-colors group-hover:text-parchment">
        {spec.short}
      </span>
    </button>
  );
}

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden className="text-muted/60">
      <circle cx="2" cy="2" r="1.2" />
      <circle cx="8" cy="2" r="1.2" />
      <circle cx="2" cy="7" r="1.2" />
      <circle cx="8" cy="7" r="1.2" />
      <circle cx="2" cy="12" r="1.2" />
      <circle cx="8" cy="12" r="1.2" />
    </svg>
  );
}

function ClipIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

/**
 * Floating, draggable taskbar overlaid on the canvas. Ask Bob a question
 * (he routes it to the best agent), attach files to send with it, or click a
 * provider logo to drop that agent onto the canvas. Starts centered near the
 * bottom; any non-interactive spot drags it around.
 */
export function Taskbar({
  onAction,
  addedCount = 0,
  permissions,
}: {
  onAction: (action: ControlAction) => void;
  addedCount?: number;
  permissions?: Permissions;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<FileDraft[]>([]);

  // Center the bar horizontally, resting near the bottom edge of the canvas,
  // once its size and the container are known.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const bar = barRef.current;
    if (!container || !bar || pos) return;
    const next = {
      x: Math.round((container.clientWidth - bar.offsetWidth) / 2),
      y: Math.round(container.clientHeight - bar.offsetHeight - EDGE_MARGIN),
    };
    posRef.current = next;
    setPos(next);
  }, [pos]);

  const clampToContainer = (x: number, y: number) => {
    const container = containerRef.current;
    const bar = barRef.current;
    if (!container || !bar) return { x, y };
    return {
      x: Math.min(Math.max(x, MIN_VISIBLE - bar.offsetWidth), container.clientWidth - MIN_VISIBLE),
      y: Math.min(Math.max(y, EDGE_MARGIN), container.clientHeight - 40),
    };
  };

  const isInteractive = (target: EventTarget | null) =>
    !(target instanceof HTMLElement) ||
    Boolean(target.closest("button, input, textarea, select, label, a"));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isInteractive(e.target)) return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      offsetX: e.clientX - posRef.current.x,
      offsetY: e.clientY - posRef.current.y,
    };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clampToContainer(e.clientX - drag.offsetX, e.clientY - drag.offsetY);
    posRef.current = next;
    setPos(next);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    setDragging(false);
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const drafts = await readFiles(e.target.files);
    if (drafts.length > 0) setFiles((prev) => [...prev, ...drafts]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text && files.length === 0) return;
    onAction({ kind: "submit_task", summary: text || "New task with attachment", files });
    setValue("");
    setFiles([]);
  };

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-10 select-none">
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`pointer-events-auto absolute flex flex-col gap-2 rounded-xl border border-ink-600/80 bg-ink-900/95 p-3 shadow-2xl shadow-black/40 backdrop-blur transition-opacity ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          left: pos?.x ?? 0,
          top: pos?.y ?? 0,
          width: 440,
          maxWidth: "min(94vw, 560px)",
          opacity: pos ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-2">
          <GripIcon />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Agent taskbar
          </span>
          <span className="hidden text-[10px] text-muted/50 sm:inline">
            drag to move · ask Bob or add an agent
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              disabled={addedCount === 0}
              onClick={() => onAction({ kind: "clear_added_agents" })}
              title={`Remove all ${addedCount} added agent${addedCount === 1 ? "" : "s"} (core accounts stay)`}
              className="mr-1 rounded-sm border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted transition-colors hover:text-ledger-coral disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear added
            </button>
            {LOGO_ORDER.map((p) => (
              <LogoButton key={p} provider={p} disabled={!permissions?.canControl} onAction={onAction} />
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="flex items-center gap-1.5">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!permissions?.canControl}
            placeholder={
              permissions?.canControl
                ? "Ask Bob anything — he routes it to the best agent…"
                : "Submitting tasks requires the control role"
            }
            className="min-w-0 flex-1 select-text rounded-sm border border-ink-600 bg-ink-800 px-2 py-1.5 text-[11px] text-parchment outline-none placeholder:text-muted/50 focus:border-ledger-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <label
            className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-ink-600 bg-ink-800 text-muted transition-colors hover:text-parchment ${
              permissions?.canControl ? "" : "pointer-events-none opacity-40"
            }`}
            title={permissions?.canControl ? "Attach files to send with your question" : "Attaching files requires the control role"}
          >
            <ClipIcon />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onPickFiles}
              disabled={!permissions?.canControl}
            />
          </label>
          <button
            type="submit"
            disabled={(!value.trim() && files.length === 0) || !permissions?.canControl}
            className="shrink-0 rounded-sm border border-ledger-gold/40 bg-ledger-gold/10 px-2.5 py-1.5 text-[10px] font-medium text-ledger-gold transition-colors hover:bg-ledger-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Ask Bob
          </button>
        </form>

        {files.length > 0 && (
          <FileChips files={files} onDetach={(id) => setFiles((prev) => prev.filter((f) => f.id !== id))} />
        )}
      </div>
    </div>
  );
}