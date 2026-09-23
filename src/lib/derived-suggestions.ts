// src/lib/derived-suggestions.ts
//
// Suggestions that follow from what a client already has connected, as
// plain rules — not guesses and not scored. Each one only suggests an
// option the code can actually deliver on with that setup (checked against
// deliverBrief, tagNativeCrm and the SMS senders), and only while the field
// is still unset. They're shown like any other suggestion: the user picks
// them; nothing here writes config.

import type { EngagementStack } from "@/models/schema";
import { hasCredential } from "@/lib/credentials";
import type { FactSuggestion } from "@/lib/fact-suggestions";

// CRMs that both deliverBrief's "crm_note" and cohort-sync's native CRM
// tagging support.
const CRM_NOTE_PLATFORMS = new Set(["hubspot", "klaviyo", "ghl"]);

function fromConnection(value: string, provider: string, why: string): FactSuggestion {
  return { value, source: "account", sourceDetail: provider, confidence: null, evidence: why, derived: true };
}

export async function showtimeConnectionSuggestions(
  engagementId: string,
  stack: Partial<EngagementStack>
): Promise<Record<string, FactSuggestion>> {
  const out: Record<string, FactSuggestion> = {};
  const crm = stack.email_platform && CRM_NOTE_PLATFORMS.has(stack.email_platform) ? stack.email_platform : null;

  if (stack.sms_platform === undefined) {
    if (await hasCredential(engagementId, "twilio")) {
      out.smsPlatform = fromConnection("twilio", "twilio", "A Twilio key is connected for this client.");
    } else if (stack.email_platform === "ghl" || stack.booking_platform === "ghl_calendar") {
      out.smsPlatform = fromConnection("ghl_sms", "ghl", "GoHighLevel is connected, and it can send the SMS sequence.");
    } else if (stack.email_platform === "hubspot") {
      out.smsPlatform = fromConnection("hubspot_sms", "hubspot", "HubSpot is connected; its SMS runs through a HubSpot workflow.");
    }
  }

  if (stack.ad_data_platform === undefined) {
    if (await hasCredential(engagementId, "hyros")) {
      out.adDataPlatform = fromConnection("hyros", "hyros", "A Hyros key is connected for this client.");
    } else if (crm) {
      out.adDataPlatform = fromConnection("native_crm", crm, `Booked leads can be tagged in ${crm} — no separate ad-data platform needed.`);
    }
  }

  if (stack.brief_landing_destination === undefined && crm) {
    out.briefLandingDestination = fromConnection("crm_note", crm, `Briefs can land as a note on the contact in ${crm}, with no Slack setup.`);
  }

  if (stack.video_engagement_platform === undefined && stack.hero_video_id) {
    const url = stack.hero_video_id.toLowerCase();
    const platform = url.includes("wistia")
      ? "wistia"
      : url.includes("youtube.com") || url.includes("youtu.be")
      ? "youtube_analytics"
      : url.includes("loom.com")
      ? "loom"
      : url.includes("vidalytics")
      ? "vidalytics"
      : null;
    if (platform) {
      out.videoEngagementPlatform = {
        value: platform,
        source: "website",
        sourceDetail: null,
        confidence: null,
        evidence: "The hero video is hosted on this platform.",
        derived: true,
        label: "where your hero video is hosted",
      };
    }
  }

  return out;
}
