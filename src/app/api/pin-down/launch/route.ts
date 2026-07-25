import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { startRun, logStep, failRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";
import { getSkillsRunOnSetup } from "@/lib/skill-registry";
import crypto from "crypto";

export const maxDuration = 30;

/**
 * The explicit "go" button for a freshly-saved engagement. Setup
 * (POST /api/engagements/setup) only persists config and encrypted
 * credentials — nothing runs until this endpoint is called, which only
 * happens when the user clicks "Launch Setup" on the wizard's post-save
 * screen. Mirrors the seed-then-dispatch shape /api/skill-runs/trigger
 * already uses for pre-call-read and leak-map.
 *
 * Loops over getSkillsRunOnSetup() rather than hardcoding "pin-down" —
 * today that's a list of one, but a future agent bundle with a different
 * (or no) setup-time skill plugs in by editing its SKILL_REGISTRY entry,
 * not this route. The URL still says pin-down since that's the only
 * setup-time skill that exists today; worth a rename once a second one
 * does.
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

    const setupSkills = getSkillsRunOnSetup();
    if (setupSkills.length === 0) {
      return NextResponse.json({ error: "No setup-time skill is configured to launch." }, { status: 500 });
    }

    const runIds: string[] = [];

    for (const skillName of setupSkills) {
      const runId = crypto.randomUUID();
      try {
        await startRun({ id: runId, engagementId, skillName, phase: "onboarding_start", label: row.buyer });

        // Credentials were already stored during setup — log it here as an
        // already-complete step so the run timeline still reads as a full,
        // continuous sequence rather than jumping straight to voice_scrape.
        await logStep(runId, {
          phase: "credential_storage",
          status: "success",
          detail: "Credentials stored during setup",
        });

        await inngest.send(skillRunExecute.create({ runId, engagementId, skillName }));
        runIds.push(runId);
      } catch (err) {
        await failRun(runId, err).catch(() => {});
        throw err;
      }
    }

    return NextResponse.json({ success: true, runId: runIds[0], runIds, engagementId, status: "processing" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[pin-down launch]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
