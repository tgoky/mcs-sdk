import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { startRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import crypto from "crypto";

export async function GET(request: Request) {
  const auth = await requireCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") ?? "weekly") as "weekly" | "monthly";
  const urlEngagementId = searchParams.get("engagement_id");

  // Only CRON_SECRET or an admin session reaches this point (see
  // requireCronOrAdmin above), so an unscoped sweep of every tenant is the
  // intended behavior here, not a leak — this endpoint's whole job is the
  // scheduler's full-fleet weekly/monthly run. `engagement_id` is only an
  // optional narrowing for admin ad-hoc re-runs of a single tenant.
  let targets: (typeof engagements.$inferSelect)[] = [];
  if (urlEngagementId) {
    targets = await db
      .select()
      .from(engagements)
      .where(eq(engagements.engagementId, urlEngagementId));
  } else {
    targets = await db.select().from(engagements);
  }

  // Dispatches each engagement's audit through the same Inngest pipeline
  // the manual trigger uses, instead of calling AuditEngine directly.
  // The direct call (`engine.runAuditPipeline(tenant.engagementId, type)`)
  // no longer compiles now that runId is a required argument — and even if
  // it did, running every tenant's audit synchronously in a loop inside
  // one request is exactly the kind of long-running work this whole
  // refactor was meant to get off the request thread.
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
        label: `${type} cron`,
      });

      await inngest.send(
        skillRunExecute.create({
          runId,
          engagementId: tenant.engagementId,
          skillName: "leak-map",
          auditType: type,
        })
      );

      dispatched.push(tenant.engagementId);
    } catch (err: any) {
      errors.push(`${tenant.engagementId}: ${err.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    engagementsDispatched: dispatched.length,
    auditType: type,
    errors,
  });
}