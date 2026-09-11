import type { AgentEvent } from "@/lib/agent/types";
import { getActiveRun, startRun, subscribe } from "@/lib/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Streams a scan as NDJSON. When a scheduled scan is already in flight the
 * request attaches to it instead of queueing a second one, so the dashboard
 * can show background work as it happens.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const quick = url.searchParams.get("quick") === "1";

  // `attach=1` watches an unattended scan without ever starting a new one.
  if (url.searchParams.get("attach") === "1" && !getActiveRun()) {
    return new Response(null, { status: 204 });
  }

  const { run, joined } = startRun({ trigger: "manual", quick });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      const unsubscribe = subscribe(run, send);
      // The run persists its own results, so a rejection here is already handled.
      await run.promise.catch(() => {});
      unsubscribe();
      closed = true;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
      "x-run-joined": joined ? "1" : "0",
      "x-run-trigger": run.trigger,
    },
  });
}
