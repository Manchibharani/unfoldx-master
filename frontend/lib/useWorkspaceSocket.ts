"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { BudgetSnapshot, ConnectionState, Provider, WorkspaceEvent } from "./types";
import { startMockFeed } from "./mockEvents";

const MAX_EVENTS = 500;
const MAX_BACKOFF_MS = 10_000;

export function useWorkspaceSocket(workspaceId: string, token: string | null = null) {
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);
  const [budgets, setBudgets] = useState<Map<Provider, BudgetSnapshot>>(() => new Map());
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const cleanupMockRef = useRef<(() => void) | null>(null);

  const handleEvent = useCallback((event: WorkspaceEvent) => {
    setEvents((prev) => {
      const next = [...prev, event];
      return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
    });

    if (event.event_type === "budget_update" || event.event_type === "circuit_breaker_triggered") {
      setBudgets((prev) => {
        const current = prev.get(event.provider);
        const payload = event.payload as Record<string, unknown>;
        const next: BudgetSnapshot = {
          provider: event.provider,
          spent_usd: typeof payload.spent_usd === "number" ? payload.spent_usd : (current?.spent_usd ?? 0),
          cap_usd: typeof payload.cap_usd === "number" ? payload.cap_usd : (current?.cap_usd ?? 0),
          tokens_used: (current?.tokens_used ?? 0) + (typeof event.tokens_delta === "number" ? event.tokens_delta : 0),
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
        ? `${wsUrl}/${workspaceId}?token=${encodeURIComponent(token)}`
        : `${wsUrl}/${workspaceId}`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setConnectionState("connected");
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
  }, [workspaceId, token, handleEvent]);

  return { events, budgets, connectionState };
}
