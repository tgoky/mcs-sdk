import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm"; // <--- Added isNull
import { getDisabledEngagementIdsForSkill } from "@/lib/engagement-skills";
import { startRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import crypto from "crypto";

export const runtime = "nodejs"; // <--- Ensure this is present

export async function GET(request: Request) {
  const auth = await requireCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") ?? "weekly") as "weekly" | "monthly";
  const urlEngagementId = searchParams.get("engagement_id");

  // <--- ADDED: Base filters for pause and soft-delete
  const baseFilters = [
    isNull(engagements.deletedAt),
    isNull(engagements.pausedAt), // Verify this matches your schema column name
  ];

  let targets: (typeof engagements.$inferSelect)[] = [];
  if (urlEngagementId) {
    targets = await db
      .select()
      .from(engagements)
      .where(and(eq(engagements.engagementId, urlEngagementId), ...baseFilters)); // <--- APPLIED
  } else {
    // Sweep only clients that finished Showtime onboarding — same rule as
    // leakMapScheduleCron (inngest/crons.ts); an unfinished or
    // non-Showtime client must never get an audit run.
    targets = await db
      .select()
      .from(engagements)
      .where(and(...baseFilters, isNotNull(engagements.confirmationPageUrl))); // <--- APPLIED
  }

  // Ghost-run fix, same as every scheduled cron: drop explicit disables
  // before startRun, so a switched-off Leak Map never shows up as a run.
  const disabled = await getDisabledEngagementIdsForSkill("leak-map");
  targets = targets.filter((t) => !disabled.has(t.engagementId));

  const dispatched: string[] = [];
  const errors: string[] = [];

  for (const tenant of targets) {
    try {
      const runId = crypto.randomUUID();
      await startRun({
        id: runId,
        engagementId: tenant.engagementId,
        skillName: "leak-map",
        phase: "stage_1_data_pull",
       label: `${type === "monthly" ? "Monthly" : "Weekly"} Funnel Audit`,
      });

      await inngest.send(
        skillRunExecute.create({
          runId,
          engagementId: tenant.engagementId,
          skillName: "leak-map",
          auditType: type, // <--- PRESERVED: Still uses dynamic type
        })
      );

      dispatched.push(tenant.engagementId);
    } catch (err: any) {
      errors.push(`${tenant.engagementId}: ${err.message}`); // <--- PRESERVED: Error handling
    }
  }

  return NextResponse.json({
    success: true,
    engagementsDispatched: dispatched.length,
    auditType: type,
    errors,
  });
}