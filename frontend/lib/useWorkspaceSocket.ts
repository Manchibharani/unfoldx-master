"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { budgetApi } from "./api";
import type { BudgetSnapshot, ConnectionState, Provider, WorkspaceEvent } from "./types";
import { startMockFeed } from "./mockEvents";

const MAX_EVENTS = 2000;
const MAX_BACKOFF_MS = 10_000;
const WS_REPLAY = 2000;

export function useWorkspaceSocket(workspaceId: string, token: string | null = null) {
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);
  const [budgets, setBudgets] = useState<Map<Provider, BudgetSnapshot>>(() => new Map());
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const cleanupMockRef = useRef<(() => void) | null>(null);
  // seq numbers the client has already applied. Reconnects replay the tail of the log, so
  // without this the feed double-counts token/cost deltas and duplicates rows.
  const seenSeqsRef = useRef<Set<string>>(new Set<string>());

  const handleEvent = useCallback((event: WorkspaceEvent) => {
    const seen = seenSeqsRef.current;
    const dedupKey = `${event.workspace_id}:${event.seq}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    if (seen.size > 5000) {
      // bounded: drop the oldest quarter once the set grows large
      seenSeqsRef.current = new Set([...seen].slice(-3750));
    }
    setEvents((prev) => {
      const next = [...prev, event];
      return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
    });

    if (event.event_type === "budget_update" || event.event_type === "circuit_breaker_triggered") {
      setBudgets((prev) => {
        const current = prev.get(event.provider);
        const payload = event.payload as Record<string, unknown>;
        // The backend sends absolute tokens_in/tokens_out in every budget_update
        // payload; prefer those so a missed event can never leave the ledger stale.
        // Fall back to delta accumulation for feeds that only carry tokens_delta
        // (the mock feed does).
        const absTokens =
          (typeof payload.tokens_in === "number" ? payload.tokens_in : 0) +
          (typeof payload.tokens_out === "number" ? payload.tokens_out : 0);
        const deltaTokens = typeof event.tokens_delta === "number" ? event.tokens_delta : 0;
        const tokens = absTokens > 0 ? absTokens : (current?.tokens_used ?? 0) + deltaTokens;
        const next: BudgetSnapshot = {
          provider: event.provider,
          spent_usd: typeof payload.spent_usd === "number" ? payload.spent_usd : (current?.spent_usd ?? 0),
          cap_usd: typeof payload.cap_usd === "number" ? payload.cap_usd : (current?.cap_usd ?? 0),
          tokens_used: tokens,
          circuit_breaker_tripped:
            event.event_type === "circuit_breaker_triggered"
              ? true
              : payload.override === true
                ? false
                : (current?.circuit_breaker_tripped ?? false),
        };
        const updated = new Map(prev);
        updated.set(event.provider, next);
        return updated;
      });
    }
  }, []);

  /**
   * Hydrate the ledger from the authoritative REST budget endpoint. The WS
   * stream only carries budget_update events for *new* spend, so after a
   * reload the ledger would sit at $0.000 / 0 tok until the next task runs.
   * Also reconciles counters after a reconnect dropped events.
   */
  const hydrateBudgets = useCallback(() => {
    if (process.env.NEXT_PUBLIC_MOCK === "1") return;
    budgetApi
      .get(workspaceId)
      .then((res) => {
        setBudgets((prev) => {
          const next = new Map(prev);
          for (const row of res.providers) {
            next.set(row.provider as Provider, {
              provider: row.provider as Provider,
              spent_usd: row.spent_usd,
              cap_usd: row.cap_usd,
              tokens_used: row.tokens_in + row.tokens_out,
              circuit_breaker_tripped: row.breaker_state === "open",
            });
          }
          return next;
        });
      })
      .catch(() => {
        // Backend not reachable yet — live budget_update events still work.
      });
  }, [workspaceId]);

  useEffect(() => {
    const useMock = process.env.NEXT_PUBLIC_MOCK === "1";
    const wsUrl = process.env.NEXT_PUBLIC_WORKSPACE_WS_URL;

    if (useMock || !wsUrl) {
      cleanupMockRef.current = startMockFeed(handleEvent, setConnectionState);
      return () => cleanupMockRef.current?.();
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setConnectionState(attemptRef.current === 0 ? "connecting" : "reconnecting");
      // Browsers can't set headers on a WS handshake, so the JWT rides in the
      // query string. AUTH_MODE=open needs no token — only attach one if the
      // session holds a token, otherwise leave the URL clean.
      const url = token
        ? `${wsUrl}/${workspaceId}?token=${encodeURIComponent(token)}&replay=${WS_REPLAY}`
        : `${wsUrl}/${workspaceId}?replay=${WS_REPLAY}`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setConnectionState("connected");
        // Ledger totals live in the DB, not the WS backlog: hydrate on every
        // (re)connect so values are correct after reloads and reconnects.
        hydrateBudgets();
      };

      socket.onmessage = (message) => {
        try {
          const parsed = JSON.parse(message.data) as WorkspaceEvent;
          handleEvent(parsed);
        } catch {
          // Malformed frame from the backend — surfaced in dev tools, not the UI,
          // so one bad event never breaks the whole feed.
          console.warn("Received a non-JSON or malformed workspace event", message.data);
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setConnectionState("reconnecting");
        const delay = Math.min(1000 * 2 ** attemptRef.current, MAX_BACKOFF_MS);
        attemptRef.current += 1;
        setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, [workspaceId, token, handleEvent, hydrateBudgets]);

  return { events, budgets, connectionState };
}
