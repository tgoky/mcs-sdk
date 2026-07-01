import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq } from "drizzle-orm";
import { startRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";
import crypto from "crypto";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") ?? "weekly") as "weekly" | "monthly";
  const urlEngagementId = searchParams.get("engagement_id");

  const session = await getSession();
  const isUserAuthenticated = !!session.whopUserId;

  if (
    process.env.NODE_ENV === "production" &&
    !isUserAuthenticated &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  // FIXED: Restrict metric evaluation boundaries to individual client spaces
  let targets = [];
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