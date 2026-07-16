import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRuns } from "@/models/schema";
import { and, eq, lt } from "drizzle-orm";
import { timeoutRun } from "@/lib/run-log";
import { requireCronOrAdmin } from "@/lib/cron-auth";

/**
 * Manually-triggerable stale-run reaper.
 * Location: src/app/api/crons/stale-run-reaper/route.ts
 *
 * Nothing schedules this route anymore — staleRunReaperCron in
 * src/inngest/crons.ts is what actually runs every 15 minutes via
 * Inngest's own scheduler (see the note at the top of crons.ts on why
 * Vercel Cron Jobs aren't used for any of this app's scheduled work).
 * This endpoint exists for manual backfills / external monitoring only,
 * same role the other /api/crons/* routes already serve. Acts on every
 * tenant's stuck runs, so it's gated to CRON_SECRET or an admin session
 * only (see src/lib/cron-auth.ts) — not any logged-in customer.
 */
const STALE_RUN_CEILING_MS =
  Number(process.env.STALE_RUN_CEILING_MINUTES ?? 120) * 60 * 1000;

export async function GET(request: Request) {
  const auth = await requireCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const cutoff = new Date(Date.now() - STALE_RUN_CEILING_MS);
    const stuck = await db
      .select({ id: skillRuns.id })
      .from(skillRuns)
      .where(and(eq(skillRuns.status, "running"), lt(skillRuns.startedAt, cutoff)));

    let reaped = 0;
    for (const run of stuck) {
      // timeoutRun() returns false if the run resolved on its own between
      // this scan and the write (see src/lib/run-log.ts) — don't count
      // those as reaped.
      if (await timeoutRun(run.id)) reaped++;
    }

    return NextResponse.json({ success: true, reaped });
  } catch (error: any) {
    console.error("[CRON STALE RUN REAPER OUTAGE]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
