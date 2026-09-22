import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { setSkillEnabledForEngagement, isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { getPrimaryDomainForEngagement, seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { getClientFacts } from "@/lib/client-facts";
import { applyResolvableFacts, type OfferDetails } from "@/lib/field-writeback";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * pin-down bridge route — Showtime Single Dossier API handler.
 * Runs applyResolvableFacts on GET to promote harvested facts and returns
 * a pre-filled payload supporting 1-click Show Rate engine arming.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  // Promote trusted client_facts before loading row configuration
  await applyResolvableFacts(id).catch((err) =>
    console.error(`[bridges/pin-down] applyResolvableFacts error for ${id}:`, err)
  );

  const [engagementRow] = await db
    .select({
      buyer: engagements.buyer,
      stack: engagements.stack,
      offerDetails: engagements.offerDetails,
      castingChoice: engagements.castingChoice,
      confirmationPageUrl: engagements.confirmationPageUrl,
      rawVoiceCorpus: engagements.rawVoiceCorpus,
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

  if (!engagementRow) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const facts = await getClientFacts(id);
  const enabled = await isSkillEnabledForEngagement(id, "pin-down");
  const primaryDomain = await getPrimaryDomainForEngagement(id);

  const factList = Array.isArray(facts) ? facts : Object.values(facts);
  const factMap = Object.fromEntries(factList.map((f) => [f.key, f.value]));

  const stack = (engagementRow.stack as Partial<EngagementStack> | null) ?? {};
  const offer = (engagementRow.offerDetails as Partial<OfferDetails> | null) ?? {};

  const buyerDomain =
    primaryDomain ||
    stack.buyer_domain ||
    (typeof factMap.buyerDomain === "string" ? factMap.buyerDomain : "");

  return NextResponse.json({
    buyer: engagementRow.buyer,
    primaryDomain: buyerDomain,
    enabled,
    hasVoiceCorpus: Boolean(engagementRow.rawVoiceCorpus),
    confirmationPageUrl: engagementRow.confirmationPageUrl ?? null,
    config: {
      buyerDomain,
      bookingPlatform: stack.booking_platform ?? factMap.bookingPlatform ?? null,
      hostingPlatform: stack.hosting_platform ?? factMap.hostingPlatform ?? null,
      emailPlatform: stack.email_platform ?? factMap.emailPlatform ?? null,
      smsPlatform: stack.sms_platform ?? "none",
      adDataPlatform: stack.ad_data_platform ?? "none",
      offerName: offer.name || factMap.offerName || engagementRow.buyer || "",
      offerPrice: offer.price || factMap.offerPrice || "",
      offerVertical: offer.vertical || factMap.offerVertical || "",
      offerIcp: offer.icp || factMap.offerIcp || "",
      trafficTemperature: offer.traffic_temperature || factMap.trafficTemperature || "warm",
      castingChoice: engagementRow.castingChoice || factMap.castingChoice || "founder_on_camera",
      heroVideoUrl: stack.hero_video_id ?? (typeof factMap.heroVideoUrl === "string" ? factMap.heroVideoUrl : ""),
      briefLandingDestination: stack.brief_landing_destination ?? "slack",
      slackWebhookUrl: stack.slack_webhook_url ?? "",
    },
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
    if (!(await isPackageInstalledInWorkspace(activeWorkspace.workspaceId, "showtime"))) {
      return NextResponse.json({ error: "Install Showtime before configuring it for a client." }, { status: 403 });
    }

    const [engagementRow] = await db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack, offerDetails: engagements.offerDetails })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!engagementRow) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const currentStack = (engagementRow.stack as Partial<EngagementStack> | null) ?? {};
    const currentOffer = (engagementRow.offerDetails as Partial<OfferDetails> | null) ?? {};

    const updatedStack: Partial<EngagementStack> = {
      ...currentStack,
      buyer_domain: typeof body.buyerDomain === "string" ? body.buyerDomain.trim() : currentStack.buyer_domain,
      booking_platform: typeof body.bookingPlatform === "string" ? body.bookingPlatform : currentStack.booking_platform,
      hosting_platform: typeof body.hostingPlatform === "string" ? body.hostingPlatform : currentStack.hosting_platform,
      email_platform: typeof body.emailPlatform === "string" ? body.emailPlatform : currentStack.email_platform,
      sms_platform: typeof body.smsPlatform === "string" ? body.smsPlatform : currentStack.sms_platform ?? "none",
      ad_data_platform: typeof body.adDataPlatform === "string" ? body.adDataPlatform : currentStack.ad_data_platform ?? "none",
      hero_video_id: typeof body.heroVideoUrl === "string" ? body.heroVideoUrl.trim() : currentStack.hero_video_id,
      brief_landing_destination: typeof body.briefLandingDestination === "string" ? body.briefLandingDestination : currentStack.brief_landing_destination ?? "slack",
      slack_webhook_url: typeof body.slackWebhookUrl === "string" ? body.slackWebhookUrl.trim() : currentStack.slack_webhook_url,
    };

    const offerDetails: OfferDetails = {
      name: typeof body.offerName === "string" ? body.offerName.trim() : currentOffer.name || engagementRow.buyer,
      price: typeof body.offerPrice === "string" ? body.offerPrice.trim() : currentOffer.price || "",
      vertical: typeof body.offerVertical === "string" ? body.offerVertical.trim() : currentOffer.vertical || "",
      icp: typeof body.offerIcp === "string" ? body.offerIcp.trim() : currentOffer.icp || "",
      traffic_temperature: (typeof body.trafficTemperature === "string" ? body.trafficTemperature : currentOffer.traffic_temperature || "warm") as "cold" | "warm" | "hot",
      hybrid_mode_enabled: currentOffer.hybrid_mode_enabled ?? false,
    };

    const castingChoice = typeof body.castingChoice === "string" ? body.castingChoice : "founder_on_camera";

    await db
      .update(engagements)
      .set({
        stack: updatedStack as EngagementStack,
        offerDetails,
        castingChoice,
        updatedAt: new Date(),
      })
      .where(eq(engagements.engagementId, id));

    // Enable all 5 Showtime sub-workers simultaneously upon arming
    await Promise.all([
      setSkillEnabledForEngagement(id, "pin-down", true),
      setSkillEnabledForEngagement(id, "pile-on", true),
      setSkillEnabledForEngagement(id, "pre-call-read", true),
      setSkillEnabledForEngagement(id, "win-back", true),
      setSkillEnabledForEngagement(id, "leak-map", true),
    ]);

    if (body.buyerDomain) {
      seedPrimaryDomainFromUrl(id, body.buyerDomain).catch((err) =>
        console.error(`[bridges/pin-down] domain seed failed for ${id}:`, err)
      );
    }

    const runId = await dispatchSkillRun(id, "pin-down", engagementRow.buyer);

    return NextResponse.json({ ok: true, runId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/pin-down]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}