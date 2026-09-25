"use client";

import { useEffect, useRef } from "react";
import type { WorkspaceEvent } from "@/lib/types";
import { EventRow } from "./EventRow";

export function EventFeed({ events }: { events: WorkspaceEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !wasAtBottom.current) return;
    // Scroll only this container. scrollIntoView() walks every scrollable
    // ancestor (including the page), which is what yanked the viewport back.
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-ink-700 text-sm text-muted">
        Waiting for the first event — submit a task to start the chain.
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="max-h-[60vh] overflow-y-auto rounded-md border border-ink-700 bg-ink-900 p-4"
      onScroll={(e) => {
        const el = e.currentTarget;
        wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
    >
      {events.map((event, i) => (
        <EventRow key={event.id} event={event} isLast={i === events.length - 1} />
      ))}
    </div>
  );
}
