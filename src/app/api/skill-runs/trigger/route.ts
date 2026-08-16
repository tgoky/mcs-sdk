import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { startRun, failRun } from "@/lib/run-log";
import { and, eq } from "drizzle-orm";
import { inngest, skillRunExecute } from "@/lib/inngest";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { SKILL_REGISTRY } from "@/lib/skill-registry";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { engagementId, skillName } = body as {
      engagementId?: string;
      skillName?: string;
    };

    if (!engagementId || !skillName) {
      return NextResponse.json(
        { error: "Missing engagementId or skillName" },
        { status: 400 }
      );
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    // Ownership check — validation lookup before execution
    const [tenant] = await db
      .select()
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, engagementId),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!tenant) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    // ── Delegate long-running tasks to background queue ────────────────
    if (skillName === "pre-call-read" || skillName === "leak-map") {
      const enabled = await isSkillEnabledForEngagement(engagementId, skillName);
      if (!enabled) {
        return NextResponse.json(
          {
            error: `${SKILL_REGISTRY[skillName].name} is turned off for this client. Enable it from the Skills panel first.`,
          },
          { status: 422 }
        );
      }

      const runId = crypto.randomUUID();
      
      // Seed the run log row instantly before returning to clear the UI race path
      await startRun({
        id: runId,
        engagementId,
        skillName,
        phase: skillName === "pre-call-read" ? "roster_fetch" : "stage_1_data_pull",
        label: "Manually triggered via dashboard",
      });

      try {
        await inngest.send(
          skillRunExecute.create({
            runId,
            engagementId,
            skillName,
            manualOverride: true,
            ...(skillName === "leak-map" && { auditType: "weekly" as const }),
          })
        );
      } catch (dispatchErr: unknown) {
        await failRun(runId, dispatchErr);
        return NextResponse.json(
          { error: "Failed to dispatch run to background queue" },
          { status: 502 }
        );
      }

      return NextResponse.json(
        { 
          success: true, 
          runId, 
          message: "Run initiated. Processing in background." 
        }, 
        { status: 202 }
      );
    }

    // ── Handle synchronous / invalid skill triggers ────────────────────
    switch (skillName) {
      case "pin-down":
        return NextResponse.json(
          {
            error: "Pin Down requires the full setup wizard. Go to Add a New Client to re-run it.",
          },
          { status: 422 }
        );

      case "pile-on":
      case "win-back":
        return NextResponse.json(
          {
            error: "This module fires automatically on bookings. Send a test event from your booking platform to trigger it.",
          },
          { status: 422 }
        );

      default:
        return NextResponse.json(
          { error: `Unknown skill: ${skillName}` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[skill-runs/trigger]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}