import { runAgent } from "@/lib/agent/pipeline";
import type { AgentEvent } from "@/lib/agent/types";
import { readState, saveRun } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** One run at a time: the sources are shared and the run is I/O heavy. */
let activeRun: Promise<unknown> | null = null;

export async function POST(request: Request) {
  if (activeRun) {
    return Response.json(
      { error: "A run is already in progress." },
      { status: 409 },
    );
  }

  const url = new URL(request.url);
  const quick = url.searchParams.get("quick") === "1";
  const state = await readState();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The client disconnected; the run finishes and still persists.
        }
      };

      const run = (async () => {
        try {
          const result = await runAgent({
            profile: state.profile,
            travelCheckBudget: quick ? 8 : undefined,
            emit: send,
          });
          await saveRun(result.run, result.opportunities);
        } catch (error) {
          send({ type: "error", message: (error as Error).message });
        } finally {
          controller.close();
        }
      })();

      activeRun = run.finally(() => {
        activeRun = null;
      });
      await activeRun;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
