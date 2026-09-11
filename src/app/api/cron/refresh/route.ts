import { NextResponse } from "next/server";

import { isDue, msUntilNextRun } from "@/lib/agent/schedule";
import { startRun } from "@/lib/runner";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Entry point for an external scheduler (Vercel Cron, GitHub Actions, crontab)
 * on hosts where a long-lived process cannot hold the in-app timer. Point it at
 * this route every 6 hours; it is a no-op when a scan is not yet owed.
 */
async function refresh(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const header = request.headers.get("authorization");
    const presented = header?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("key");
    if (presented !== secret) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const { schedule } = await readState();

  if (!force && !schedule.enabled) {
    return NextResponse.json({ status: "paused" });
  }
  if (!force && !isDue(schedule)) {
    return NextResponse.json({
      status: "not_due",
      msUntilNextRun: msUntilNextRun(schedule),
    });
  }

  const { run, joined } = startRun({ trigger: "cron" });
  if (joined) {
    return NextResponse.json({ status: "already_running", trigger: run.trigger });
  }

  try {
    const result = await run.promise;
    return NextResponse.json({
      status: "ok",
      finishedAt: result.run.finishedAt,
      counts: result.run.counts,
      onBoard: result.opportunities.length,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: (error as Error).message },
      { status: 500 },
    );
  }
}

export const GET = refresh;
export const POST = refresh;
