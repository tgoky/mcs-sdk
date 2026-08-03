// src/app/api/skill-runs/[id]/detail/route.ts
//
// Skill-specific companion to GET /api/skill-runs/[id]. That route stays
// as-is (generic steps/summary/tokens/cost — every skill needs those, and
// existing callers depend on that exact shape). This route adds the
// per-skill payload the five run-detail views need, correlated to this
// specific run via the run_id columns added alongside it:
//
//   pre-call-read  -> every briefedCallsLog row this run wrote (a nightly
//                      run loops over many calls under one runId)
//   pile-on        -> the single pileOnSendLog row for this run's booking
//   win-back       -> the single winBackEnrollments row this run created,
//                      plus its winBackSendLog row and the engagement's
//                      cadence template (winBackSequenceAssetMap) so the
//                      30-day calendar can be computed
//   leak-map       -> the single auditRunsLog row this run wrote
//   pin-down       -> no per-run log table; reads straight off the
//                      engagement (confirmation page, brand voice, script
//                      pack, ad briefs) since pin-down is a one-time setup
//                      receipt, not a repeating log
//
// Every skill-specific query is scoped to run_id = this run's id AND
// (transitively, via the run's own engagementId) the caller's own
// whopUserId — the same ownership check the base route already does.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  skillRuns,
  engagements,
  briefedCallsLog,
  briefOutcomeLog,
  pileOnSendLog,
  winBackEnrollments,
  winBackSendLog,
  auditRunsLog,
} from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, asc, inArray } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [row] = await db
      .select({
        id: skillRuns.id,
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        engagementId: skillRuns.engagementId,
        buyer: engagements.buyer,
        stack: engagements.stack,
        offerDetails: engagements.offerDetails,
        brandVoiceProfile: engagements.brandVoiceProfile,
        confirmationPageUrl: engagements.confirmationPageUrl,
        confirmationPageDeployment: engagements.confirmationPageDeployment,
        pasteReadyHtml: engagements.pasteReadyHtml,
        pasteReadyInstructions: engagements.pasteReadyInstructions,
        adCreativeBriefs: engagements.adCreativeBriefs,
        pinDownScriptPack: engagements.pinDownScriptPack,
        pinDownPageAudit: engagements.pinDownPageAudit,
        winBackSequenceAssetMap: engagements.winBackSequenceAssetMap,
        winBackCounts: engagements.winBackCounts,
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(skillRuns.id, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    switch (row.skillName) {
      case "pre-call-read": {
        const calls = await db
          .select()
          .from(briefedCallsLog)
          .where(eq(briefedCallsLog.runId, row.id))
          .orderBy(asc(briefedCallsLog.callTime));

        // brief_outcome_log is keyed by bookingId === briefedCallsLog.callId
        // (not briefedCallsLog.id — see the module comment on that table)
        // and is append-only, written from either the Slack interactive
        // buttons (src/app/api/slack/interactions/route.ts) or this run's
        // own "Log Sales Call Outcome" control
        // (src/app/api/pre-call-read/calls/[id]/outcome/route.ts). Pull the
        // latest row per call so both paths converge on one value here.
        const bookingIds = calls.map((c) => c.callId);
        const outcomeRows = bookingIds.length
          ? await db
              .select({
                bookingId: briefOutcomeLog.bookingId,
                outcome: briefOutcomeLog.outcome,
                loggedAt: briefOutcomeLog.loggedAt,
              })
              .from(briefOutcomeLog)
              .where(and(eq(briefOutcomeLog.engagementId, row.engagementId), inArray(briefOutcomeLog.bookingId, bookingIds)))
              .orderBy(asc(briefOutcomeLog.loggedAt))
          : [];

        const latestOutcomeByBookingId = new Map<string, string>();
        for (const o of outcomeRows) latestOutcomeByBookingId.set(o.bookingId, o.outcome); // later rows win

        const callsWithOutcome = calls.map((c) => ({
          ...c,
          outcome: latestOutcomeByBookingId.get(c.callId) ?? null,
        }));

        return NextResponse.json({ run: row, calls: callsWithOutcome });
      }

      case "pile-on": {
        const [send] = await db
          .select()
          .from(pileOnSendLog)
          .where(eq(pileOnSendLog.runId, row.id))
          .limit(1);
        return NextResponse.json({ run: row, send: send ?? null });
      }

      case "win-back": {
        const [enrollment] = await db
          .select()
          .from(winBackEnrollments)
          .where(eq(winBackEnrollments.runId, row.id))
          .limit(1);

        const sendLog = enrollment
          ? await db
              .select()
              .from(winBackSendLog)
              .where(eq(winBackSendLog.enrollmentId, enrollment.id))
              .orderBy(asc(winBackSendLog.createdAt))
          : [];

        return NextResponse.json({ run: row, enrollment: enrollment ?? null, sendLog });
      }

      case "leak-map": {
        const [audit] = await db
          .select()
          .from(auditRunsLog)
          .where(eq(auditRunsLog.runId, row.id))
          .limit(1);
        return NextResponse.json({ run: row, audit: audit ?? null });
      }

      case "pin-down":
      default:
        // Pin-Down has no per-run log table to join — everything it needs
        // is already on `row` (confirmation page, brand voice, script
        // pack, ad briefs), all pulled from the engagement above.
        return NextResponse.json({ run: row });
    }
  } catch (err) {
    console.error("[skill-runs/[id]/detail]", err);
    return NextResponse.json({ error: "Failed to fetch run detail." }, { status: 500 });
  }
}
