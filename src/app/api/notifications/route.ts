import { NextResponse } from "next/server";

import { notifyStatus } from "@/lib/notify/status";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(notifyStatus(await readState()));
}
