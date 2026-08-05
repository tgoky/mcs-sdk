import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { startRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";
import { and, eq, isNull } from "drizzle-orm";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * Nightly Pre-Call Read cron. NOT scheduled by Vercel Cron — vercel.json
 * has no crons block. The actual nightly trigger is nightlyBriefsCron in
 * src/inngest/crons.ts (registered in src/app/api/inngest/route.ts), which
 * moved off Vercel Cron because the Hobby plan caps cron cadence at once a
 * day, too coarse for several of this app's other jobs. This route is kept
 * as a manually-triggerable / admin-invocable equivalent — useful for
 * backfills or on-demand runs — but nothing schedules it automatically.
 */
export async function GET(request: Request) {
  // 1. Unified security gate
  const auth = await requireCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const urlEngagementId = searchParams.get("engagement_id");

  // 2. Base query: skip paused and soft-deleted
  const baseFilters = [
    isNull(engagements.deletedAt),
    isNull(engagements.pausedAt), // Verify this matches your exact schema column name (e.g., pausedReason?)
  ];

  let targets;
  if (urlEngagementId) {
    targets = await db
      .select()
      .from(engagements)
      .where(and(eq(engagements.engagementId, urlEngagementId), ...baseFilters));
  } else {
    targets = await db
      .select()
      .from(engagements)
      .where(and(...baseFilters));
  }

  // Only engagements that have completed Pin-Down (booking platform wired
  // up) have anything to brief tonight.
  const eligible = targets.filter((t) => {
    const stack = t.stack as any;
    return stack?.booking_platform && stack?.booking_platform_credentials_ref;
  });

  const dispatched: string[] = [];
  const errors: string[] = [];

  // 3. Safe Inngest dispatch (fast, no Vercel timeout risk)
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