import { NextResponse } from "next/server";
import { sanitizeVideoEmbedUrl } from "@/features/pin-down/server/templates/content-model";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { setSkillEnabledForEngagement, isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { getPrimaryDomainForEngagement, seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { confirmClientFact, editClientFact, getClientFact, getClientFacts, recordDossierDecisions } from "@/lib/client-facts";
import { splitFacts } from "@/lib/fact-suggestions";
import { showtimeConnectionSuggestions } from "@/lib/derived-suggestions";
import { normalizeVertical } from "@/lib/verticals";
import { syncMarkersForChosenPlatforms } from "@/lib/credentials";
import { applyResolvableFacts, type OfferDetails } from "@/lib/field-writeback";
import { PICK_FACT_PREFIX, PICK_SLOT_META, type PickSlot } from "@/lib/showtime-setup/types";
import { SKILL_IDS, type SkillId } from "@/lib/skill-manifest";

export const runtime = "nodejs";
export const revalidate = 0;

const PIN_DOWN_FACT_KEYS = [
  "offerName",
  "offerPrice",
  "offerVertical",
  "offerIcp",
  "trafficTemperature",
  "castingChoice",
  "bookingPlatform",
  "hostingPlatform",
  "emailPlatform",
  "heroVideoUrl",
] as const;

const TRAFFIC_TEMPERATURES = ["cold", "warm", "hot"] as const;
const DELIVERABLE_BRIEF_DESTINATIONS = ["slack", "crm_note"] as const;
type TrafficTemperature = (typeof TRAFFIC_TEMPERATURES)[number];

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
  const ownedByThisTenant = and(
    eq(engagements.engagementId, id),
    eq(engagements.whopUserId, session.whopUserId),
    eq(engagements.workspaceId, activeWorkspace.workspaceId)
  );

  // Ownership first: applyResolvableFacts writes config, so it must never
  // run for an engagement id this tenant doesn't own.
  const [owned] = await db.select({ id: engagements.id }).from(engagements).where(ownedByThisTenant).limit(1);
  if (!owned) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

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
    .where(ownedByThisTenant)
    .limit(1);

  if (!engagementRow) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const facts = await getClientFacts(id);
  const enabled = await isSkillEnabledForEngagement(id, "pin-down");
  const primaryDomain = await getPrimaryDomainForEngagement(id);

  const stack = (engagementRow.stack as Partial<EngagementStack> | null) ?? {};
  const offer = (engagementRow.offerDetails as Partial<OfferDetails> | null) ?? {};

  // A saved value wins; otherwise only a trusted fact pre-fills a field.
  // Anything else goes back as a suggestion, shown beside the field with
  // its source and score — never pre-filled as if it were the answer.
  const { trusted, suggestions } = splitFacts(facts, PIN_DOWN_FACT_KEYS);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const savedOr = (saved: string | null | undefined, key: string) => saved || str(trusted[key]);
  // Once a field is saved, a suggestion for it is noise — drop it.
  const dropIfSaved = (saved: unknown, key: string) => {
    if (saved) delete suggestions[key];
  };
  dropIfSaved(offer.name, "offerName");
  dropIfSaved(offer.price, "offerPrice");
  dropIfSaved(offer.vertical, "offerVertical");
  dropIfSaved(offer.icp, "offerIcp");
  dropIfSaved(offer.traffic_temperature, "trafficTemperature");
  dropIfSaved(engagementRow.castingChoice, "castingChoice");
  dropIfSaved(stack.booking_platform, "bookingPlatform");
  dropIfSaved(stack.hosting_platform, "hostingPlatform");
  dropIfSaved(stack.email_platform, "emailPlatform");
  dropIfSaved(stack.hero_video_id, "heroVideoUrl");

  // Several Whop plans: offer them as a pick for the price rather than
  // filling one in (the app can't know which plan this offer is).
  const planOptions = facts.whopPlanOptions;
  if (!offer.price && planOptions && planOptions.status !== "rejected" && Array.isArray(planOptions.value)) {
    suggestions.whopPlanOptions = {
      value: planOptions.value,
      source: planOptions.source,
      sourceDetail: "whop",
      confidence: null,
      evidence: planOptions.evidence,
      derived: true,
    };
  }

  // Rule-based suggestions from what's connected (SMS, ad data, brief
  // destination) for fields that are still unset.
  Object.assign(suggestions, await showtimeConnectionSuggestions(id, stack));

  const buyerDomain = primaryDomain || stack.buyer_domain || "";

  return NextResponse.json({
    buyer: engagementRow.buyer,
    primaryDomain: buyerDomain,
    enabled,
    hasVoiceCorpus: Boolean(engagementRow.rawVoiceCorpus),
    confirmationPageUrl: engagementRow.confirmationPageUrl ?? null,
    config: {
      buyerDomain,
      bookingPlatform: stack.booking_platform ?? (str(trusted.bookingPlatform) || null),
      hostingPlatform: stack.hosting_platform ?? (str(trusted.hostingPlatform) || null),
      emailPlatform: stack.email_platform ?? (str(trusted.emailPlatform) || null),
      // Unset stays unset (null) — "none" is a real choice the user makes.
      smsPlatform: stack.sms_platform ?? null,
      adDataPlatform: stack.ad_data_platform ?? null,
      offerName: savedOr(offer.name, "offerName"),
      offerPrice: savedOr(offer.price, "offerPrice"),
      offerVertical: savedOr(offer.vertical, "offerVertical"),
      offerIcp: savedOr(offer.icp, "offerIcp"),
      trafficTemperature: savedOr(offer.traffic_temperature, "trafficTemperature"),
      // visible-default in the registry: a safe default the user can see.
      castingChoice: engagementRow.castingChoice || str(trusted.castingChoice) || "founder_on_camera",
      heroVideoUrl: stack.hero_video_id ?? str(trusted.heroVideoUrl),
      briefLandingDestination: stack.brief_landing_destination ?? null,
      slackWebhookUrl: stack.slack_webhook_url ?? "",
    },
    suggestions,
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
      .select({
        engagementId: engagements.engagementId,
        buyer: engagements.buyer,
        stack: engagements.stack,
        offerDetails: engagements.offerDetails,
        castingChoice: engagements.castingChoice,
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

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const currentStack = (engagementRow.stack as Partial<EngagementStack> | null) ?? {};
    const currentOffer = (engagementRow.offerDetails as Partial<OfferDetails> | null) ?? {};

    // A non-empty string replaces the saved value; anything else keeps it.
    // Nothing is filled with a default the user didn't choose — SMS, ad
    // data and brief delivery stay unset until picked ("none" is a real
    // choice, not a default), and the offer name no longer falls back to
    // the client's name.
    const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

    // The setup screen sends which Showtime skills this client wants
    // (someone may only want the Funnel Audit). Without it (older callers)
    // this saves Pin-Down's setup exactly as before.
    const chosenSkills = Array.isArray(body.skills) ? (body.skills as unknown[]).filter((s): s is SkillId => typeof s === "string" && (SKILL_IDS as string[]).includes(s)) : null;
    const pinDownOn = chosenSkills ? chosenSkills.includes("pin-down") : true;

    // Pin-Down crawls the client's site for brand voice and pre-fill; it
    // can't run without one. (This check existed before the dossier rewrite
    // and was dropped with it.)
    if (pinDownOn && !text(body.buyerDomain) && !currentStack.buyer_domain) {
      return NextResponse.json({ error: "Enter the client's website before saving." }, { status: 400 });
    }

    const trafficTemperature: TrafficTemperature | undefined = TRAFFIC_TEMPERATURES.includes(body.trafficTemperature)
      ? body.trafficTemperature
      : currentOffer.traffic_temperature;
    if (pinDownOn && !trafficTemperature) {
      return NextResponse.json({ error: "Pick how leads usually arrive (cold, warm or hot) before saving." }, { status: 400 });
    }

    // Only destinations deliverBrief can actually deliver to. "email" was
    // offered by the dossier but isn't a destination at all, and briefs
    // sent there silently went nowhere.
    const brief = text(body.briefLandingDestination);
    if (brief && !DELIVERABLE_BRIEF_DESTINATIONS.includes(brief as (typeof DELIVERABLE_BRIEF_DESTINATIONS)[number])) {
      return NextResponse.json({ error: `Briefs can't be delivered to "${brief}". Pick Slack or a CRM note.` }, { status: 400 });
    }

    // A video link the confirmation page can't embed used to be saved and
    // then silently replaced by the placeholder. (A bare id without a
    // scheme is left alone — Pre-Call Read stores a Vidalytics video id in
    // this same field.)
    if (typeof body.heroVideoUrl === "string" && /^https?:\/\//i.test(body.heroVideoUrl.trim()) && !sanitizeVideoEmbedUrl(body.heroVideoUrl)) {
      return NextResponse.json(
        { error: "That video link can't be embedded on the confirmation page. Use a YouTube, Vimeo or Loom share link." },
        { status: 400 }
      );
    }

    const updatedStack: Partial<EngagementStack> = {
      ...currentStack,
      buyer_domain: text(body.buyerDomain) ?? currentStack.buyer_domain,
      booking_platform: (text(body.bookingPlatform) as EngagementStack["booking_platform"] | undefined) ?? currentStack.booking_platform,
      hosting_platform: (text(body.hostingPlatform) as EngagementStack["hosting_platform"] | undefined) ?? currentStack.hosting_platform,
      email_platform: (text(body.emailPlatform) as EngagementStack["email_platform"] | undefined) ?? currentStack.email_platform,
      sms_platform: (text(body.smsPlatform) as EngagementStack["sms_platform"] | undefined) ?? currentStack.sms_platform,
      ad_data_platform: (text(body.adDataPlatform) as EngagementStack["ad_data_platform"] | undefined) ?? currentStack.ad_data_platform,
      hero_video_id: typeof body.heroVideoUrl === "string" ? body.heroVideoUrl.trim() : currentStack.hero_video_id,
      brief_landing_destination:
        (text(body.briefLandingDestination) as EngagementStack["brief_landing_destination"] | undefined) ?? currentStack.brief_landing_destination,
      slack_webhook_url: typeof body.slackWebhookUrl === "string" ? body.slackWebhookUrl.trim() : currentStack.slack_webhook_url,
      ...(chosenSkills ? { showtime_setup_saved_at: new Date().toISOString() } : {}),
    };

    // Keep the client's own confirmation page instead of building one:
    // Pin-Down then only audits it and publishes nothing (onboarding-service).
    if (typeof body.existingConfirmationPageReuse === "boolean") {
      const existingUrl = text(body.existingConfirmationPageUrl) ?? currentStack.existing_confirmation_page_url;
      if (body.existingConfirmationPageReuse && !existingUrl) {
        return NextResponse.json({ error: "There's no existing confirmation page on file to keep." }, { status: 400 });
      }
      updatedStack.existing_confirmation_page_reuse = body.existingConfirmationPageReuse;
      if (existingUrl) updatedStack.existing_confirmation_page_url = existingUrl;
    }

    // Account-specific ids the setup screen had Jev pick (or the person
    // changed): which list/workflow Pile-On and Win-Back use, which site or
    // project Pin-Down publishes to. Only ids this screen offers are read.
    const autoPicks = readAutoPicks(body.autoPicks);
    if (autoPicks.target_list_id) updatedStack.target_list_id = autoPicks.target_list_id.id;
    if (autoPicks.recovery_list_id) updatedStack.recovery_list_id = autoPicks.recovery_list_id.id;
    if (autoPicks.recovery_workflow_id) updatedStack.recovery_workflow_id = autoPicks.recovery_workflow_id.id;
    if (autoPicks.webflow_site_id || autoPicks.vercel_project_name) {
      updatedStack.hosting_platform_meta = {
        ...(currentStack.hosting_platform_meta ?? {}),
        ...(autoPicks.webflow_site_id ? { webflow_site_id: autoPicks.webflow_site_id.id } : {}),
        ...(autoPicks.vercel_project_name ? { vercel_project_name: autoPicks.vercel_project_name.id } : {}),
      };
    }

    const typedVertical = text(body.offerVertical);
    const offerDetails: OfferDetails = {
      name: text(body.offerName) ?? currentOffer.name ?? "",
      price: text(body.offerPrice) ?? currentOffer.price ?? "",
      // Stored as the fixed list's id so benchmarks group correctly; an
      // unlisted legacy value is kept as typed.
      vertical: typedVertical ? normalizeVertical(typedVertical) ?? typedVertical : currentOffer.vertical ?? "",
      icp: text(body.offerIcp) ?? currentOffer.icp ?? "",
      // Only unset when Pin-Down is off (checked above); the page is the one
      // thing that needs it.
      traffic_temperature: trafficTemperature as OfferDetails["traffic_temperature"],
      hybrid_mode_enabled: currentOffer.hybrid_mode_enabled ?? false,
    };

    // visible-default in the registry, so a missing value keeps the saved
    // one or the documented default.
    const castingChoice = text(body.castingChoice) ?? engagementRow.castingChoice ?? "founder_on_camera";

    await db
      .update(engagements)
      .set({
        stack: updatedStack as EngagementStack,
        offerDetails,
        castingChoice,
        updatedAt: new Date(),
      })
      .where(eq(engagements.engagementId, id));

    // Keys saved before their platform was picked (e.g. pasted into this
    // dossier's connect panel) are marked connected now that it is.
    await syncMarkersForChosenPlatforms(id, [
      updatedStack.booking_platform,
      updatedStack.email_platform,
      updatedStack.hosting_platform,
      updatedStack.sms_platform,
      updatedStack.ad_data_platform,
    ]);

    // Record what the user did with each suggestion (kept -> confirmed,
    // changed -> edited) so it isn't suggested again.
    await recordDossierDecisions(id, {
      offerName: offerDetails.name,
      offerPrice: offerDetails.price,
      offerVertical: offerDetails.vertical,
      offerIcp: offerDetails.icp,
      trafficTemperature: offerDetails.traffic_temperature,
      castingChoice,
      bookingPlatform: updatedStack.booking_platform,
      hostingPlatform: updatedStack.hosting_platform,
      emailPlatform: updatedStack.email_platform,
      heroVideoUrl: updatedStack.hero_video_id,
    }).catch((err) => console.error(`[bridges/pin-down] recording suggestion decisions failed for ${id}:`, err));

    await recordPickDecisions(id, autoPicks).catch((err) =>
      console.error(`[bridges/pin-down] recording pick decisions failed for ${id}:`, err)
    );

    // With a skill list, exactly those skills are on for this client and
    // the rest off (they're on by default, so "off" has to be written).
    // Without one, only Pin-Down is switched on, as before: re-enabling the
    // others on every save would undo a user switching one off elsewhere.
    if (chosenSkills) {
      for (const skillId of SKILL_IDS) await setSkillEnabledForEngagement(id, skillId, chosenSkills.includes(skillId));
    } else {
      await setSkillEnabledForEngagement(id, "pin-down", true);
    }

    if (body.buyerDomain) {
      seedPrimaryDomainFromUrl(id, body.buyerDomain).catch((err) =>
        console.error(`[bridges/pin-down] domain seed failed for ${id}:`, err)
      );
    }

    // Pin-Down builds the confirmation page; nothing to run when it's off.
    const runId = pinDownOn ? await dispatchSkillRun(id, "pin-down", engagementRow.buyer) : undefined;

    return NextResponse.json({ ok: true, runId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/pin-down]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
type AutoPick = { id: string; name: string };

function readAutoPicks(raw: unknown): Partial<Record<PickSlot, AutoPick>> {
  const out: Partial<Record<PickSlot, AutoPick>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const slot of Object.keys(PICK_SLOT_META) as PickSlot[]) {
    const v = (raw as Record<string, unknown>)[slot];
    if (v && typeof v === "object") {
      const { id, name } = v as { id?: unknown; name?: unknown };
      if (typeof id === "string" && id.trim()) out[slot] = { id: id.trim(), name: typeof name === "string" && name.trim() ? name.trim() : id.trim() };
    }
  }
  return out;
}

/** Kept Jev's pick -> confirmed; chose another -> edited, so a later
 * re-run never swaps it back. */
async function recordPickDecisions(engagementId: string, picks: Partial<Record<PickSlot, AutoPick>>): Promise<void> {
  for (const [slot, pick] of Object.entries(picks) as [PickSlot, AutoPick][]) {
    const key = `${PICK_FACT_PREFIX}${slot}`;
    const fact = await getClientFact(engagementId, key);
    const factValue = fact?.value as { id?: string | null; resource?: string } | undefined;
    if (fact && fact.status === "suggested" && factValue?.id === pick.id) {
      await confirmClientFact(engagementId, key);
    } else {
      await editClientFact(engagementId, key, { id: pick.id, name: pick.name, resource: factValue?.resource });
    }
  }
}
