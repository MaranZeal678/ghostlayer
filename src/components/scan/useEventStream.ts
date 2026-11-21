"use client";
import { useEffect, useRef, useState } from "react";

export interface AgentEventRow {
  id: string;
  agentType: string | null;
  eventType: string;
  message: string;
  timestamp: string;
  structuredPayload: Record<string, unknown> | null;
  repairAttemptId: string | null;
}

/** Subscribes to a persisted-event SSE endpoint. EventSource resends Last-Event-ID on reconnect, so nothing is lost. */
export function useEventStream<S>(url: string | null) {
  const [events, setEvents] = useState<AgentEventRow[]>([]);
  const [snapshot, setSnapshot] = useState<S | null>(null);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!url) return;
    // Reset per-stream state when the stream URL changes (e.g. a retried repair). Subscription setup, not derived state.
    /* eslint-disable react-hooks/set-state-in-effect */
    setEvents([]);
    setSnapshot(null);
    setDone(false);
    setConnected(false);
    seen.current = new Set();
    /* eslint-enable react-hooks/set-state-in-effect */
    let lastId = "";
    let finished = false;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    const open = () => {
      es = new EventSource(lastId ? `${url}${url.includes("?") ? "&" : "?"}after=${lastId}` : url);
      es.onopen = () => {
        setConnected(true);
        backoff = 1000;
      };
      es.onerror = () => {
        setConnected(false);
        // EventSource retries by itself on network errors; a non-2xx response closes it for good, so reopen with backoff.
        if (es?.readyState === EventSource.CLOSED && !finished) {
          timer = setTimeout(open, backoff);
          backoff = Math.min(backoff * 2, 10_000);
        }
      };
      es.addEventListener("agent", (e) => {
        const row = JSON.parse((e as MessageEvent).data) as AgentEventRow;
        lastId = row.id;
        if (seen.current.has(row.id)) return;
        seen.current.add(row.id);
        setEvents((prev) => [...prev, row]);
      });
      es.addEventListener("snapshot", (e) => setSnapshot(JSON.parse((e as MessageEvent).data)));
      es.addEventListener("done", () => {
        finished = true;
        setDone(true);
        es?.close();
        setConnected(false);
      });
    };
    open();
    return () => {
      finished = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [url]);
  return { events, snapshot, connected, done };
}
