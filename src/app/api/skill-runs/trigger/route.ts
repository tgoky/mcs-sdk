import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { executeNightlyBriefingCycle } from "@/features/pre-call-read/server/brief-service";
import { AuditEngine } from "@/features/leak-map/server/audit-engine";

export const runtime = "nodejs";

/**
 * Unified manual trigger endpoint called by the TriggerSkillButton in the
 * dashboard. Previously the button component expected an `endpoint` prop
 * (pointing directly at cron routes) but the parent page was passing
 * `engagementId` + `skillName` — so every button was dead.
 *
 * This route:
 *  - Accepts POST { engagementId, skillName }
 *  - Verifies the session and engagement ownership
 *  - Routes to the correct service function
 *  - Returns { runId, message } so the button can link to the run detail page
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

    // Ownership check — the user can only trigger runs for their own engagements
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

    switch (skillName) {
      case "pre-call-read": {
        const count = await executeNightlyBriefingCycle(tenant);
        return NextResponse.json({
          success: true,
          message: `${count} brief${count === 1 ? "" : "s"} delivered`,
        });
      }

      case "leak-map": {
        const engine = new AuditEngine();
        await engine.runAuditPipeline(engagementId, "weekly");
        return NextResponse.json({
          success: true,
          message: "Weekly funnel health check completed",
        });
      }

      // Pin-Down is wizard-driven (full credential setup form); we can't
      // meaningfully re-trigger it without the wizard payload. Direct user
      // to the setup page instead.
      case "pin-down":
        return NextResponse.json(
          {
            error:
              "Pin Down requires the full setup wizard. Go to Add a New Client to re-run it.",
          },
          { status: 422 }
        );

      // Pile-On and Win-Back fire from booking webhooks automatically.
      // They can be tested by sending a test webhook from the booking platform.
      case "pile-on":
      case "win-back":
        return NextResponse.json(
          {
            error:
              "This module fires automatically on bookings. Send a test event from your booking platform to trigger it.",
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