import { NextResponse } from "next/server";
import { z } from "zod";

import { clampIntervalHours } from "@/lib/agent/schedule";
import { rescheduleNow, scheduleStatus } from "@/lib/scheduler";
import { saveSchedule } from "@/lib/store";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  intervalHours: z.number().optional(),
});

export async function GET() {
  return NextResponse.json(await scheduleStatus());
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid schedule update." }, { status: 400 });
  }

  await saveSchedule({
    ...(parsed.data.enabled === undefined ? {} : { enabled: parsed.data.enabled }),
    ...(parsed.data.intervalHours === undefined
      ? {}
      : { intervalHours: clampIntervalHours(parsed.data.intervalHours) }),
  });

  rescheduleNow();
  return NextResponse.json(await scheduleStatus());
}
