import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { startRun } from "@/lib/run-log";
import { and, eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * Unified manual trigger endpoint.
 * * DECOUPLED ARCHITECTURE:
 * Synchronously seeds the run execution record in Postgres to prevent frontend
 * 404 race conditions, dispatches the long-running task to the background queue,
 * and instantly releases the request loop thread with a 202 Accepted payload.
 */
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

    // Ownership check — validation lookup before execution
    const [tenant] = await db
      .select()
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, engagementId),
          eq(engagements.whopUserId, session.whopUserId)
        )
      )
      .limit(1);

    if (!tenant) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    // ── Delegate long-running tasks to background queue ────────────────
    if (skillName === "pre-call-read" || skillName === "leak-map") {
      const runId = crypto.randomUUID();
      
      // Seed the run log row instantly before returning to clear the UI race path
      await startRun({
        id: runId,
        engagementId,
        skillName,
        phase: skillName === "pre-call-read" ? "roster_fetch" : "stage_1_data_pull",
        label: "Manually triggered via dashboard",
      });

      // Forward event to background task loop
      await inngest.send({
        name: "skill/run.execute",
        data: {
          runId,
          engagementId,
          skillName,
          tenant,
          ...(skillName === "leak-map" && { auditType: "weekly" }),
        },
      });

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
  } catch (err: any) {
    console.error("[skill-runs/trigger]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}