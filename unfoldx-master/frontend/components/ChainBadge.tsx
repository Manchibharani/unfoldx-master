"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, describeError, workspaceApi, type VerifyResult } from "@/lib/api";

const POLL_MS = 8000;
const THROTTLE_MS = 3000;

type ChainStatus = "loading" | "ok" | "broken" | "unavailable";

const STYLE: Record<ChainStatus, string> = {
  loading: "border-ink-600 bg-ink-800 text-muted",
  ok: "border-ledger-teal/40 bg-ledger-teal/10 text-ledger-teal",
  broken: "border-ledger-coral/50 bg-ledger-coral/10 text-ledger-coral",
  unavailable: "border-ink-700 bg-ink-950 text-muted/60",
};

const LABEL: Record<ChainStatus, string> = {
  loading: "verifying chain…",
  ok: "chain verified ✓",
  broken: "⚠ chain broken",
  unavailable: "chain · offline",
};

/**
 * Calls GET /api/workspaces/{id}/events/verify (recomputes every hash +
 * signature server-side) and shows the provenance verdict next to the event
 * feed. Polls while feed receives events; never calls the backend in mock mode.
 */
export function ChainBadge({ workspaceId, eventsLen }: { workspaceId: string; eventsLen: number }) {
  const isMock = process.env.NEXT_PUBLIC_MOCK === "1";
  const [status, setStatus] = useState<ChainStatus>("loading");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [detail, setDetail] = useState<string | undefined>();
  const lastRunRef = useRef(0);
  const inFlightRef = useRef(false);

  const verify = useCallback(async () => {
    if (isMock) return;
    const now = Date.now();
    if (now - lastRunRef.current < THROTTLE_MS || inFlightRef.current) return;
    lastRunRef.current = now;
    inFlightRef.current = true;
    try {
      const res = await workspaceApi.verifyEvents(workspaceId);
      setResult(res);
      setStatus(res.valid ? "ok" : "broken");
      setDetail(res.valid ? undefined : res.reason ?? "chain failed verification");
    } catch (err) {
      setResult(null);
      setStatus("unavailable");
      setDetail(err instanceof ApiError || err instanceof Error ? describeError(err) : String(err));
    } finally {
      inFlightRef.current = false;
    }
  }, [workspaceId, isMock]);

  useEffect(() => {
    if (isMock || eventsLen === 0) return;
    void verify();
    const timer = setInterval(() => void verify(), POLL_MS);
    return () => clearInterval(timer);
  }, [isMock, eventsLen, verify]);

  if (isMock) {
    return <span className="rounded-sm border border-ink-700 bg-ink-950 px-1.5 py-0.5 font-mono text-[10px] text-muted/50">chain · mock</span>;
  }

  if (eventsLen === 0) {
    return <span className="rounded-sm border border-ink-700 bg-ink-950 px-1.5 py-0.5 font-mono text-[10px] text-muted/50">chain · empty</span>;
  }

  const suffix =
    status === "ok" && result
      ? ` · ${result.checked}`
      : status === "broken" && result?.first_invalid_seq
        ? ` · seq ${result.first_invalid_seq}`
        : "";

  return (
    <span
      className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${STYLE[status]}`}
      title={
        detail
          ? detail
          : status === "ok" && result
            ? `recomputed ${result.checked} event hash/signature(s)`
            : undefined
      }
    >
      {LABEL[status]}
      {suffix}
    </span>
  );
}