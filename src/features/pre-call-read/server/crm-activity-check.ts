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

export type CrmActivityCheckResult = {
  hasActivity: boolean;
  /**
   * Which platform actually got queried — hubspot/ghl only, since those
   * are the only two with a verified read endpoint (see the default
   * branch below). Null means no real check happened, for any of several
   * different reasons distinguished by `skippedReason` — a caller that
   * only looked at `hasActivity` couldn't tell "we checked and found
   * nothing" apart from "we never actually checked," which is exactly
   * the gap that made the sweep's old fixed message ("no recent CRM
   * activity was found") misleading whenever nothing was really checked
   * at all.
   */
  checkedPlatform: "hubspot" | "ghl" | null;
  skippedReason: "no_email_platform" | "unsupported_platform" | "missing_location_id" | "check_failed" | null;
};

/**
 * hasActivity is true only when a positive signal was actually found.
 * Any failure mode — no CRM configured, credential missing, the platform
 * isn't one of the two with a verified read endpoint, the API call
 * itself errors — resolves hasActivity to false, i.e. "no evidence
 * found," which is the same as today's behavior before this check
 * existed. This function only ever makes the sweep more conservative,
 * never less: a false here can't cause a wrongful enrollment on its own,
 * it just means this particular safeguard didn't catch anything and the
 * forced-gate review step (see outcome-resolution.ts's
 * triggerNoShowWinBack) is still the backstop.
 */
export async function hasPostCallCrmActivity(
  engagementId: string,
  stack: EngagementStack | null | undefined,
  prospectEmail: string,
  since: Date
): Promise<CrmActivityCheckResult> {
  if (!stack?.email_platform || !prospectEmail) {
    return { hasActivity: false, checkedPlatform: null, skippedReason: "no_email_platform" };
  }

  try {
    switch (stack.email_platform) {
      case "hubspot": {
        const apiKey = await resolveCredential(engagementId, "hubspot");
        const hasActivity = await new HubSpotClient(apiKey).hasActivitySince(prospectEmail, since);
        return { hasActivity, checkedPlatform: "hubspot", skippedReason: null };
      }
      case "ghl": {
        const locationId = stack.booking_platform_meta?.location_id;
        if (!locationId) return { hasActivity: false, checkedPlatform: null, skippedReason: "missing_location_id" };
        const apiKey = await resolveCredential(engagementId, "ghl");
        const hasActivity = await new GHLCRMClient(apiKey, locationId).hasActivitySince(prospectEmail, since);
        return { hasActivity, checkedPlatform: "ghl", skippedReason: null };
      }
      default:
        // Klaviyo/Mailchimp/ConvertKit/ActiveCampaign/SMTP: no
        // documented-and-verified "read recent contact activity" surface
        // the way HubSpot's Engagements API and GHL's notes GET are —
        // same rationale crm-tagger.ts's default branch already
        // documents for why those platforms don't get a supported path
        // here either, rather than a best-guess one.
        return { hasActivity: false, checkedPlatform: null, skippedReason: "unsupported_platform" };
    }
  } catch (e) {
    // Best-effort, same isolation as every other CRM read/write call
    // site in this codebase — a failed lookup must never be the reason a
    // real no-show goes unenrolled, it just means this one extra signal
    // didn't get checked this time.
    console.error("[crm-activity-check] hasPostCallCrmActivity failed:", e);
    return { hasActivity: false, checkedPlatform: null, skippedReason: "check_failed" };
  }
}

/**
 * Plain-English account of what the CRM check actually did, for the
 * sweep's reasoning message (crons.ts) — the honest replacement for the
 * old fixed "no recent CRM activity was found" line, which claimed a
 * check happened and came back negative even in the common cases where
 * no real check occurred at all (no CRM connected, an unsupported
 * platform, or the lookup itself failing).
 */
export function describeCrmCheck(result: CrmActivityCheckResult): string {
  if (result.checkedPlatform) {
    // hasActivity is always false here — this helper is only ever called
    // on the no-show path, where a true would have short-circuited the
    // sweep to "showed" before this message gets built.
    return `checked ${result.checkedPlatform === "hubspot" ? "HubSpot" : "GoHighLevel"} for any note, call, email, or task logged on this contact since the call — found nothing`;
  }
  switch (result.skippedReason) {
    case "no_email_platform":
      return "no CRM is connected on this engagement, so this couldn't be checked";
    case "unsupported_platform":
      return "the connected email platform doesn't support reading contact activity yet, so this couldn't be checked";
    case "missing_location_id":
      return "the GoHighLevel connection is missing a location ID, so this couldn't be checked";
    case "check_failed":
      return "the CRM lookup itself failed, so this couldn't be checked this time";
    default:
      return "this couldn't be checked";
  }
}
