// src/lib/win-back-platform-readiness.ts
//
// Pure, client-safe (no db import) — extracted out of chat-winback.ts so
// the same "is this platform actually ready to enroll someone" check has
// one definition, not two that can drift. chat-winback.ts (server) and
// win-back-view.tsx (client, the run-detail page's delivery-status
// banner) both need this exact answer: a connected email_platform isn't
// enough on its own for most platforms — each needs its own per-platform
// meta field(s) set before enrollment can actually succeed. HubSpot and
// SMTP are the two real exceptions: HubSpot's enrollInRecoveryWorkflow
// (email.ts) needs nothing beyond the API key (it just sets contact
// properties, no separate list/workflow id to enroll into); SMTP has no
// ESP-side list/workflow at all, so its own readiness question is "is
// there content to send," checked separately against
// winBackSequenceAssetMap, not here.
//
// Every branch below is checked directly against enrollInWinBackSequence's
// own thrown errors (email.ts) — not re-derived independently, so this
// can't drift from what actually determines whether that call succeeds or
// throws. Mailchimp and ConvertKit were missing here despite both being
// real, switch-cased platforms in enrollInWinBackSequence that throw on a
// missing recovery_list_id exactly like Klaviyo does — an engagement
// misconfigured for either would have skipped this check entirely and
// hit that raw thrown error instead of a clean, actionable one.
import type { EngagementStack } from "@/models/schema";

export function missingWinBackMetaFor(platform: string, stack: Partial<EngagementStack>): string | null {
  if ((platform === "klaviyo" || platform === "mailchimp") && !stack.recovery_list_id) {
    return `recovery_list_id (${platform === "mailchimp" ? "Mailchimp audience ID" : "Klaviyo list ID"}) isn't configured yet. Set that up on the client's page first.`;
  }
  if (platform === "convertkit" && !stack.recovery_list_id) {
    return "recovery_list_id (ConvertKit tag ID) isn't configured yet. Set that up on the client's page first.";
  }
  if (platform === "activecampaign" && (!stack.recovery_list_id || !stack.activecampaign_base_url)) {
    return "ActiveCampaign win-back needs recovery_list_id and activecampaign_base_url configured on the client's page first.";
  }
  if (platform === "ghl" && (!stack.booking_platform_meta?.location_id || !stack.recovery_workflow_id)) {
    return "GoHighLevel win-back needs a location id and recovery_workflow_id configured on the client's page first.";
  }
  return null;
}
