import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { listThreadsForWorkspace } from "@/lib/chat-threads";

export const runtime = "nodejs";

// Thread list for the Teammates page's left rail. Metadata only (id,
// title, lastMessageAt) — a selected thread's actual messages are loaded
// separately via GET /api/teammates/threads/[id], same as today, so
// switching threads client-side never re-fetches this list.
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const threads = await listThreadsForWorkspace(activeWorkspace.workspaceId);
    return NextResponse.json({ threads });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[teammates/threads]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
