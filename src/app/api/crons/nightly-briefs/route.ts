import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { startRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * Nightly Pre-Call Read cron — fires the Vercel cron job defined in
 * vercel.json: { "path": "/api/crons/nightly-briefs", "schedule": "0 20 * * *" }.
 *
 * This file previously was a near-duplicate of the manual dashboard trigger
 * endpoint: it required a logged-in user session (getSession()) and only
 * exported a POST handler expecting { engagementId, skillName } in the
 * body. Vercel Cron Jobs invoke via GET with no body and no user cookie —
 * so this cron has never actually fired successfully. It also called
 * executeNightlyBriefingCycle(tenant) directly with the old 1-arg
 * signature, which no longer compiles now that runId is required.
 *
 * Rewritten to match the working leak-map-audit cron's pattern: GET +
 * CRON_SECRET auth, loop every engagement with pre-call-read configured,
 * dispatch each through the same Inngest pipeline the manual trigger uses
 * (so retries/checkpointing/telemetry are identical on both paths).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  const { searchParams } = new URL(request.url);
  const urlEngagementId = searchParams.get("engagement_id");

  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let targets;
  if (urlEngagementId) {
    targets = await db
      .select()
      .from(engagements)
      .where(eq(engagements.engagementId, urlEngagementId));
  } else {
    targets = await db.select().from(engagements);
  }

  // Only engagements that have completed Pin-Down (booking platform wired
  // up) have anything to brief tonight.
  const eligible = targets.filter((t) => {
    const stack = t.stack as any;
    return stack?.booking_platform && stack?.booking_platform_credentials_ref;
  });

  const dispatched: string[] = [];
  const errors: string[] = [];

  for (const tenant of eligible) {
    try {
      const runId = crypto.randomUUID();
      await startRun({
        id: runId,
        engagementId: tenant.engagementId,
        skillName: "pre-call-read",
        phase: "roster_fetch",
        label: "Nightly cron",
      });

      await inngest.send(
        skillRunExecute.create({
          runId,
          engagementId: tenant.engagementId,
          skillName: "pre-call-read",
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
    errors,
  });
}