import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { resolveBlocker, abandonBlocker, getBlockerEngagementId } from "@/lib/human-blockers";

/**
 * Cross-cutting recovery gap 17 — human-only-blocker resume. This is the
 * "human resumes it" side of waitForBlockerResolution: the engagement's
 * own tenant (or an admin) marks a blocker resolved (optionally supplying
 * whatever data the blocked step needs — a video URL, an approval
 * timestamp, a credential reference), which wakes the exact Inngest step
 * durably waiting on it. See src/lib/human-blockers.ts for the full
 * mechanism.
 *
 * Tenant-scoping fix: this used to be admin-only, but the Queue UI shows
 * open blockers to every tenant on their own engagement.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;

  const engagementId = await getBlockerEngagementId(id);
  if (!engagementId) {
    return NextResponse.json({ error: "Blocker not found or already decided." }, { status: 404 });
  }

  if (!(await isAuthorizedForEngagement(session, engagementId))) {
    return NextResponse.json({ error: "You don't have access to this engagement." }, { status: 403 });
  }

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
