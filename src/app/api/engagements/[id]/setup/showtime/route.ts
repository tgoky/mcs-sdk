import { NextResponse } from "next/server";
import { loadShowtimeSetupState } from "@/lib/showtime-setup/state";
import { authorizeShowtimeSetup } from "./access";

export const runtime = "nodejs";
export const revalidate = 0;

/** Everything the Showtime setup screen shows. See showtime-setup/state.ts. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeShowtimeSetup(id);
  if (!access.ok) return access.response;

  try {
    const state = await loadShowtimeSetupState(id, access.workspaceId);
    if (!state) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    return NextResponse.json(state);
  } catch (err) {
    console.error(`[setup/showtime GET] ${id}:`, err);
    return NextResponse.json({ error: "Couldn't load Showtime's setup for this client." }, { status: 500 });
  }
}
