import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";

export const maxDuration = 30;

/**
 * Superseded by POST /api/engagements/[id]/skills/pin-down (the generic
 * per-bridge enable route) — enabling Pin-Down there does exactly this
 * now: sets engagement_skills and fires dispatchSkillRun. Kept working,
 * as a thin wrapper around the same helper, in case anything still
 * points at this URL; the wizard itself no longer calls it.
 *
 * This used to be the client-launch button itself, and used to loop
 * every getSkillsRunOnSetup() bridge rather than just Pin-Down — that
 * behavior moved out entirely. Launching a client (POST
 * /api/engagements/[id]/launch) no longer fires any bridge; bridge
 * selection, including Pin-Down, is its own step after that.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { engagementId } = body;
    if (!engagementId) {
      return new Response("Missing required field: engagementId", { status: 400 });
    }

    const [row] = await db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
      .from(engagements)
      .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    await setSkillEnabledForEngagement(engagementId, "pin-down", true);
    const runId = await dispatchSkillRun(engagementId, "pin-down", row.buyer);

    return NextResponse.json({ success: true, runId, runIds: [runId], engagementId, status: "processing" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[pin-down launch]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
