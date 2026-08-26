import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getAutopilotClients } from "@/lib/autopilot-clients";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Backs the right-utility-panel's compact Autopilot tab (see
 * autopilot-panel-content.tsx) — same data /dashboard/autopilot's server
 * component fetches directly, exposed as JSON since the panel is a client
 * component mounted deep inside shell-layout.tsx, not a server component
 * with a direct DB import.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const clients = await getAutopilotClients(session.whopUserId, activeWorkspace.workspaceId);
    return NextResponse.json({ clients });
  } catch (err) {
    console.error("[engagements/autopilot-summary GET]", err);
    return NextResponse.json({ error: "Failed to load Autopilot summary." }, { status: 500 });
  }
}
