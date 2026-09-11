import { NextResponse } from "next/server";

import { profileSchema } from "@/lib/agent/profile";
import { saveProfile } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid profile.", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const state = await saveProfile({
    ...parsed.data,
    homeRegion: parsed.data.homeRegion.map((code) => code.toUpperCase()),
  });
  return NextResponse.json(state);
}
