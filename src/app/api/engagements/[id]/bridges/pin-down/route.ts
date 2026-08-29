import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { setSkillEnabledForEngagement, isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Pin-Down's own hinges — the config that's genuinely exclusive to this
 * one bridge (how to learn the brand voice, which confirmation page
 * design to ship), as opposed to shared client-profile data (offer,
 * ICP, testimonials, top questions/objections) that the general wizard
 * still collects because Pile-On, Win-Back, Pre-Call Read, and Leak-Map
 * all read it too.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [row] = await db
    .select({
      buyer: engagements.buyer,
      stack: engagements.stack,
      rawVoiceCorpus: engagements.rawVoiceCorpus,
      confirmationPageTemplate: engagements.confirmationPageTemplate,
      offerDetails: engagements.offerDetails,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const enabled = await isSkillEnabledForEngagement(id, "pin-down");

  return NextResponse.json({
    buyer: row.buyer,
    enabled,
    marketingDomain: row.stack?.buyer_domain ?? "",
    existingConfirmationPageUrl: row.stack?.existing_confirmation_page_url ?? "",
    rawVoiceCorpus: row.rawVoiceCorpus ?? "",
    confirmationPageTemplate: row.confirmationPageTemplate ?? "signal",
    existingPileOnSequenceFlagged: row.stack?.existing_pile_on_sequence_flagged ?? false,
    existingAuditFlagged: row.stack?.existing_audit_flagged ?? false,
    existingAuditDescription: row.stack?.existing_audit_description ?? "",
    notificationPackSelections: row.stack?.notification_pack_selections ?? [],
    existingConfirmationPageReuse: row.stack?.existing_confirmation_page_reuse ?? false,
    emailPlatform: row.stack?.email_platform ?? "",
    offerDetails: row.offerDetails,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const body = await req.json().catch(() => ({}));
    const voiceSource: "scrape" | "manual" = body.voiceSource === "manual" ? "manual" : "scrape";
    const marketingDomain: string = typeof body.marketingDomain === "string" ? body.marketingDomain.trim() : "";
    const rawVoiceCorpus: string = typeof body.rawVoiceCorpus === "string" ? body.rawVoiceCorpus : "";
    const existingConfirmationPageUrl: string =
      typeof body.existingConfirmationPageUrl === "string" ? body.existingConfirmationPageUrl.trim() : "";
    const confirmationPageTemplate: string =
      typeof body.confirmationPageTemplate === "string" && body.confirmationPageTemplate ? body.confirmationPageTemplate : "signal";
    const existingPileOnSequenceFlagged: boolean = body.existingPileOnSequenceFlagged === true;
    const existingAuditFlagged: boolean = body.existingAuditFlagged === true;
    const existingAuditDescription: string =
      typeof body.existingAuditDescription === "string" ? body.existingAuditDescription.trim() : "";
    const existingConfirmationPageReuse: boolean = body.existingConfirmationPageReuse === true;
    const notificationPackSelections: string[] = Array.isArray(body.notificationPackSelections)
      ? body.notificationPackSelections.filter((x: unknown) => typeof x === "string")
      : [];

    if (voiceSource === "scrape" && !marketingDomain) {
      return NextResponse.json({ error: "Marketing website URL is required when scraping brand voice." }, { status: 400 });
    }
    if (voiceSource === "manual") {
      const wordCount = rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < 50) {
        return NextResponse.json(
          { error: `Brand voice sample needs at least 50 words (currently ${wordCount}).` },
          { status: 400 }
        );
      }
    }

    const [row] = await db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const mergedStack = {
      ...(row.stack ?? {}),
      ...(marketingDomain ? { buyer_domain: marketingDomain } : {}),
      ...(existingConfirmationPageUrl ? { existing_confirmation_page_url: existingConfirmationPageUrl } : {}),
      existing_confirmation_page_reuse: existingConfirmationPageUrl ? existingConfirmationPageReuse : false,
      existing_pile_on_sequence_flagged: existingPileOnSequenceFlagged,
      existing_audit_flagged: existingAuditFlagged,
      ...(existingAuditFlagged ? { existing_audit_description: existingAuditDescription } : {}),
      notification_pack_selections: notificationPackSelections,
    } as EngagementStack;

    await db
      .update(engagements)
      .set({
        stack: mergedStack,
        rawVoiceCorpus,
        confirmationPageTemplate,
        updatedAt: new Date(),
      })
      .where(eq(engagements.engagementId, id));

    await setSkillEnabledForEngagement(id, "pin-down", true);
    const runId = await dispatchSkillRun(id, "pin-down", row.buyer, {
      completedSteps: [{ phase: "credential_storage", detail: "Credentials stored during setup" }],
    });

    return NextResponse.json({ ok: true, runId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/pin-down]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}