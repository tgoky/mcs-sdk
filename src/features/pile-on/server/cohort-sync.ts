import { resolveCredential } from "@/lib/credentials";
import { addToAdDataCohort, removeFromAdDataCohort } from "@/lib/platforms/ad-data";
import { KlaviyoClient, HubSpotClient, GHLCRMClient } from "@/lib/platforms/email";
import type { EngagementStack } from "@/models/schema";

/**
 * Pile-On recovery gap 2 — ad-data cohort sync.
 *
 * Add on booking.created, remove on a terminal disposition. The OG
 * SKILL.md's exact trigger list was: add on booking, remove on
 * call-completed OR cancelled. This app currently only has reliable
 * signal for "cancelled" (a real booking-platform webhook/poll event) —
 * there's no "call completed" webhook anywhere in this codebase (no
 * booking platform this app integrates with fires a distinct
 * post-call-completion event), so that specific removal trigger is a
 * real, documented gap rather than something faked here. Wiring it in
 * once a completion signal exists (e.g. via a conversation-intelligence
 * integration — see the transfer analysis's Tier 4 roadmap item 24) is a
 * natural follow-up, not a rewrite of this module.
 *
 * Called directly from enrollment-service.ts rather than through a
 * separate Inngest event dispatch — cohort sync is a single external API
 * call, same cost profile as the exitWinBackSequence call it sits right
 * next to, so there's no fan-out/retry-storm risk that would justify the
 * extra indirection the booking-poller or leak-map crons need. It's
 * wrapped in try/catch by the caller the same way exitWinBackSequence is,
 * so a cohort-sync failure is never allowed to fail the enrollment itself.
 */

function resolveCohortId(stack: EngagementStack): string {
  return stack.ad_data_cohort_id ?? "showtime_pile_on_cohort";
}

export async function addProspectToAdDataCohort(
  engagementId: string,
  stack: EngagementStack,
  email: string
): Promise<void> {
  if (!stack.ad_data_platform || stack.ad_data_platform === "none") return;

  const cohortId = resolveCohortId(stack);

  if (stack.ad_data_platform === "native_crm") {
    // Tag on whatever email/CRM platform is already connected — no
    // separate credential needed, matches the buyer's-platform-owns-the-
    // data principle used throughout this codebase.
    if (!stack.email_platform) return;
    const apiKey = await resolveCredential(engagementId, stack.email_platform);
    await tagNativeCrm(stack.email_platform, apiKey, stack.booking_platform_meta?.location_id, email, {
      showtime_ad_cohort: cohortId,
      showtime_ad_cohort_status: "active",
    });
    return;
  }

  const apiKey = await resolveCredential(engagementId, stack.ad_data_platform);
  await addToAdDataCohort(stack.ad_data_platform, apiKey, stack.ad_data_platform_meta, cohortId, email);
}

export async function removeProspectFromAdDataCohort(
  engagementId: string,
  stack: EngagementStack,
  email: string
): Promise<void> {
  if (!stack.ad_data_platform || stack.ad_data_platform === "none") return;

  const cohortId = resolveCohortId(stack);

  if (stack.ad_data_platform === "native_crm") {
    if (!stack.email_platform) return;
    const apiKey = await resolveCredential(engagementId, stack.email_platform);
    await tagNativeCrm(stack.email_platform, apiKey, stack.booking_platform_meta?.location_id, email, {
      showtime_ad_cohort_status: "removed",
    });
    return;
  }

  const apiKey = await resolveCredential(engagementId, stack.ad_data_platform);
  await removeFromAdDataCohort(stack.ad_data_platform, apiKey, stack.ad_data_platform_meta, cohortId, email);
}

async function tagNativeCrm(
  emailPlatform: string,
  apiKey: string,
  ghlLocationId: string | undefined,
  email: string,
  properties: Record<string, string>
): Promise<void> {
  switch (emailPlatform) {
    case "klaviyo":
      return new KlaviyoClient(apiKey).setProfileProperty(email, properties);
    case "hubspot":
      return new HubSpotClient(apiKey).setCustomProperty(email, properties);
    case "ghl":
      if (!ghlLocationId) return;
      return new GHLCRMClient(apiKey, ghlLocationId).setCustomFields(email, properties);
    default:
      // ActiveCampaign/ConvertKit/Mailchimp: no generic custom-property
      // setter exists in email.ts for these yet (same gap
      // deliverPersonalizedIntro already documents for ActiveCampaign) —
      // silently skip rather than throw, since this is best-effort
      // tagging, not a required side effect of enrollment.
      return;
  }
}
