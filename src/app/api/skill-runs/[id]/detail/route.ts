import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  skillRuns,
  engagements,
  briefedCallsLog,
  pileOnSendLog,
  winBackEnrollments,
  winBackSendLog,
  auditRunsLog,
  sequenceMessageLog,
  repIdentityGraphs,
  repEngineFindings,
  repTrustpilotReviews,
  repRedditMentions,
  repTwitterMentions,
  repIncidents,
} from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, asc, gte, lte } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [row] = await db
      .select({
        id: skillRuns.id,
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        startedAt: skillRuns.startedAt,
        completedAt: skillRuns.completedAt,
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
      .where(
        and(
          eq(skillRuns.id, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
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
        return NextResponse.json({ run: row, calls });
      }

      case "pile-on": {
        const [send] = await db
          .select()
          .from(pileOnSendLog)
          .where(eq(pileOnSendLog.runId, row.id))
          .limit(1);
        const smsMessages = await db
          .select()
          .from(sequenceMessageLog)
          .where(and(eq(sequenceMessageLog.runId, row.id), eq(sequenceMessageLog.sequenceType, "pile_on_sms")))
          .orderBy(asc(sequenceMessageLog.sentAt));
        return NextResponse.json({ run: row, send: send ?? null, smsMessages });
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

      // Reputation Manager's 5 skills. Their ingestion/finding tables
      // (rep_engine_findings, rep_trustpilot_reviews, rep_reddit_mentions,
      // rep_incidents) were built without a runId column — unlike
      // Showtime's per-skill log tables above, they only carry
      // engagementId + their own timestamp. Rather than a migration to add
      // one, this scopes to rows whose timestamp falls inside this run's
      // own execution window [startedAt, completedAt ?? now] — accurate
      // as long as the same (engagement, skill) pair never runs twice
      // concurrently, which a per-client cron skill never does.
      case "rep-onboarding": {
        const [identityGraph] = await db
          .select()
          .from(repIdentityGraphs)
          .where(eq(repIdentityGraphs.engagementId, row.engagementId))
          .limit(1);
        return NextResponse.json({ run: row, identityGraph: identityGraph ?? null });
      }

      case "rep-engine-panel": {
        const windowEnd = row.completedAt ?? new Date();
        const findings = await db
          .select()
          .from(repEngineFindings)
          .where(
            and(
              eq(repEngineFindings.engagementId, row.engagementId),
              gte(repEngineFindings.runAt, row.startedAt),
              lte(repEngineFindings.runAt, windowEnd)
            )
          )
          .orderBy(asc(repEngineFindings.runAt));
        return NextResponse.json({ run: row, findings });
      }

      case "rep-trustpilot-watch": {
        const windowEnd = row.completedAt ?? new Date();
        const reviews = await db
          .select()
          .from(repTrustpilotReviews)
          .where(
            and(
              eq(repTrustpilotReviews.engagementId, row.engagementId),
              gte(repTrustpilotReviews.createdAt, row.startedAt),
              lte(repTrustpilotReviews.createdAt, windowEnd)
            )
          )
          .orderBy(asc(repTrustpilotReviews.createdAt));
        return NextResponse.json({ run: row, reviews });
      }

      case "rep-reddit-watch": {
        const windowEnd = row.completedAt ?? new Date();
        const mentions = await db
          .select()
          .from(repRedditMentions)
          .where(
            and(
              eq(repRedditMentions.engagementId, row.engagementId),
              gte(repRedditMentions.createdAt, row.startedAt),
              lte(repRedditMentions.createdAt, windowEnd)
            )
          )
          .orderBy(asc(repRedditMentions.createdAt));
        return NextResponse.json({ run: row, mentions });
      }

      case "rep-twitter-watch": {
        const windowEnd = row.completedAt ?? new Date();
        const mentions = await db
          .select()
          .from(repTwitterMentions)
          .where(
            and(
              eq(repTwitterMentions.engagementId, row.engagementId),
              gte(repTwitterMentions.createdAt, row.startedAt),
              lte(repTwitterMentions.createdAt, windowEnd)
            )
          )
          .orderBy(asc(repTwitterMentions.createdAt));
        return NextResponse.json({ run: row, mentions });
      }

      case "rep-crisis-response": {
        const windowEnd = row.completedAt ?? new Date();
        const [incident] = await db
          .select()
          .from(repIncidents)
          .where(
            and(
              eq(repIncidents.engagementId, row.engagementId),
              gte(repIncidents.declaredAt, row.startedAt),
              lte(repIncidents.declaredAt, windowEnd)
            )
          )
          .limit(1);
        return NextResponse.json({ run: row, incident: incident ?? null });
      }

      case "pin-down":
      default:
        return NextResponse.json({ run: row });
    }
  } catch (err) {
    console.error("[skill-runs/[id]/detail]", err);
    return NextResponse.json({ error: "Failed to fetch run detail." }, { status: 500 });
  }
}