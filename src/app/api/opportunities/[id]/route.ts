import { NextResponse } from "next/server";

import { setAction } from "@/lib/store";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["saved", "dismissed"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { action?: string | null };
  try {
    body = (await request.json()) as { action?: string | null };
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const action = body.action ?? null;
  if (action !== null && !ACTIONS.has(action)) {
    return NextResponse.json(
      { error: 'action must be "saved", "dismissed" or null.' },
      { status: 422 },
    );
  }

  const state = await setAction(id, action as "saved" | "dismissed" | null);
  return NextResponse.json({ actions: state.actions });
}
