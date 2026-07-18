import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/whop-access";
import { resolveBlocker, abandonBlocker } from "@/lib/human-blockers";

/**
 * Cross-cutting recovery gap 17 — human-only-blocker resume. This is the
 * "human resumes it" side of waitForBlockerResolution: an admin marks a
 * blocker resolved (optionally supplying whatever data the blocked step
 * needs — a video URL, an approval timestamp, a credential reference),
 * which wakes the exact Inngest step durably waiting on it. See
 * src/lib/human-blockers.ts for the full mechanism.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.whopUserId || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await params;

  let body: { decision?: "resolved" | "abandoned"; resumePayload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.decision !== "resolved" && body.decision !== "abandoned") {
    return NextResponse.json({ error: "decision must be 'resolved' or 'abandoned'." }, { status: 400 });
  }

  const ok =
    body.decision === "resolved"
      ? await resolveBlocker(id, session.email, body.resumePayload)
      : await abandonBlocker(id, session.email);

  if (!ok) {
    return NextResponse.json({ error: "Blocker not found or already decided." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
