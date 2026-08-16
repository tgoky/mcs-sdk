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
} from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, asc } from "drizzle-orm";

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

      case "pin-down":
      default:
        return NextResponse.json({ run: row });
    }
  } catch (err) {
    console.error("[skill-runs/[id]/detail]", err);
    return NextResponse.json({ error: "Failed to fetch run detail." }, { status: 500 });
  }
}