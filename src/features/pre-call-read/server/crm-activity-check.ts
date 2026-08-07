// src/features/pre-call-read/server/crm-activity-check.ts
//
// Assumed-no-show sweep false-positive fix — passive CRM-activity signal.
//
// The sweep (crons.ts) infers a no-show from *absence*: no outcome
// logged, no Recall session. That inference is weakest exactly when a
// rep did their post-call admin somewhere this app doesn't watch — their
// CRM — and just never came back to click a Slack/dashboard button.
// This gives the sweep one more real signal to check before it commits
// to that inference: did anything change on this contact's CRM record
// after the call was supposed to happen? A note, a logged call/email/
// meeting/task is direct evidence someone on the sales side interacted
// with this prospect post-call — evidence the call happened, not a
// guess.
//
// Deliberately narrow in scope: only hasActivitySince, a boolean signal,
// not a general CRM-reading feature. A true positive here short-circuits
// the sweep straight to a "showed" resolution (see crons.ts); a false
// negative (CRM has activity this check doesn't happen to catch) just
// means the call falls through to the existing forced-gate review step
// instead of being silently confirmed — never the reverse.
import type { EngagementStack } from "@/models/schema";
import { resolveCredential } from "@/lib/credentials";
import { HubSpotClient, GHLCRMClient } from "@/lib/platforms/email";

/**
 * Returns true only when a positive signal was actually found. Any
 * failure mode — no CRM configured, credential missing, the platform
 * isn't one of the two with a verified read endpoint, the API call
 * itself errors — resolves to false, i.e. "no evidence found," which is
 * the same as today's behavior before this check existed. This function
 * only ever makes the sweep more conservative, never less: a false here
 * can't cause a wrongful enrollment on its own, it just means this
 * particular safeguard didn't catch anything and the forced-gate review
 * step (see outcome-resolution.ts's triggerNoShowWinBack) is still the
 * backstop.
 */
export async function hasPostCallCrmActivity(
  engagementId: string,
  stack: EngagementStack | null | undefined,
  prospectEmail: string,
  since: Date
): Promise<boolean> {
  if (!stack?.email_platform || !prospectEmail) return false;

  try {
    switch (stack.email_platform) {
      case "hubspot": {
        const apiKey = await resolveCredential(engagementId, "hubspot");
        return await new HubSpotClient(apiKey).hasActivitySince(prospectEmail, since);
      }
      case "ghl": {
        const locationId = stack.booking_platform_meta?.location_id;
        if (!locationId) return false;
        const apiKey = await resolveCredential(engagementId, "ghl");
        return await new GHLCRMClient(apiKey, locationId).hasActivitySince(prospectEmail, since);
      }
      default:
        // Klaviyo/Mailchimp/ConvertKit/ActiveCampaign/SMTP: no
        // documented-and-verified "read recent contact activity" surface
        // the way HubSpot's Engagements API and GHL's notes GET are —
        // same rationale crm-tagger.ts's default branch already
        // documents for why those platforms don't get a supported path
        // here either, rather than a best-guess one.
        return false;
    }
  } catch (e) {
    // Best-effort, same isolation as every other CRM read/write call
    // site in this codebase — a failed lookup must never be the reason a
    // real no-show goes unenrolled, it just means this one extra signal
    // didn't get checked this time.
    console.error("[crm-activity-check] hasPostCallCrmActivity failed:", e);
    return false;
  }
}
