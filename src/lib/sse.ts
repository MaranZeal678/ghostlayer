import { db } from "./db";

/**
 * Server-Sent Events backed by the persisted AgentEvent table.
 * Clients resume with Last-Event-ID, so refreshes/reconnects never lose events and never affect the job.
 */
export function eventStream(
  req: Request,
  where: { scanId?: string; repairAttemptId?: string },
  snapshot: () => Promise<Record<string, unknown>>,
  isTerminal: (snap: Record<string, unknown>) => boolean,
) {
  const lastId = req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("after");
  let cursor = lastId ? BigInt(lastId) : BigInt(0);
  const enc = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => (closed = true));
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => {
        if (!closed) controller.enqueue(enc.encode(s));
      };
      let lastSnap = "";
      let idleTicks = 0;
      // End before the serverless limit; EventSource reconnects with Last-Event-ID and resumes seamlessly.
      const deadline = Date.now() + 240_000;
      while (!closed && Date.now() < deadline) {
        const events = await db.agentEvent.findMany({
          where: { ...where, id: { gt: cursor } },
          orderBy: { id: "asc" },
          take: 200,
        });
        for (const e of events) {
          cursor = e.id;
          send(`id: ${e.id}\nevent: agent\ndata: ${JSON.stringify({ ...e, id: e.id.toString() })}\n\n`);
        }
        const snap = await snapshot();
        const s = JSON.stringify(snap, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
        if (s !== lastSnap) {
          lastSnap = s;
          send(`event: snapshot\ndata: ${s}\n\n`);
        }
        if (isTerminal(snap) && events.length === 0) {
          if (++idleTicks > 3) {
            send(`event: done\ndata: {}\n\n`);
            break;
          }
        } else idleTicks = 0;
        send(`: ping\n\n`);
        await new Promise((r) => setTimeout(r, 1000));
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
