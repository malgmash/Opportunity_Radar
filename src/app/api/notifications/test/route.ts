import { NextResponse } from "next/server";

import { maskAddress, readNotifyConfig } from "@/lib/notify";
import { renderDigest } from "@/lib/notify/render";
import { deliver } from "@/lib/notify/transport";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends one digest built from what is already on the board, so mail setup can
 * be proven without waiting for a new internship to appear. It deliberately
 * does not mark anything as notified.
 */
export async function POST() {
  const config = readNotifyConfig();
  const state = await readState();

  const sample = state.opportunities
    .filter((item) => config.kinds.includes(item.kind))
    .filter((item) => item.eligibility.decision === "eligible")
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, 3);

  const digest = renderDigest({
    items: sample,
    omitted: 0,
    profile: state.profile,
    firstRun: true,
    boardUrl: process.env.NOTIFY_BOARD_URL ?? "http://localhost:43127",
  });
  digest.subject = `[test] ${digest.subject}`;

  try {
    const delivery = await deliver(config, digest);
    return NextResponse.json({
      status: "ok",
      transport: delivery.transport,
      sampleSize: sample.length,
      detail:
        delivery.transport === "outbox"
          ? `No mail credentials set, so the digest was written to ${delivery.detail}.`
          : `Sent to ${config.to.map(maskAddress).join(", ")}.`,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", detail: (error as Error).message },
      { status: 502 },
    );
  }
}
