import { KlaviyoClient, HubSpotClient, GHLCRMClient, MailchimpClient, ConvertKitClient } from "@/lib/platforms/email";

/**
 * Win-Back recovery gap 4 — recovered-from-no-show tagger.
 *
 * When a prospect rebooks while they have an active win-back enrollment,
 * this pushes a tag/custom-field update to the buyer's own CRM so their
 * team sees "recovered from no-show" on the contact record — not just a
 * number in this app's dashboard. This is the one piece of "the buyer's
 * CRM should know the story" that survives the shift to a continuously-
 * running server-side runtime (see the transfer analysis's gap 1
 * discussion): the runtime itself lives on this app's infra, but the
 * fact of the recovery is still written back to infra the buyer actually
 * looks at day to day.
 *
 * Reuses the exact same per-platform property-setting methods already
 * used for cohort tagging and personalized-intro delivery elsewhere in
 * this codebase — this is not a new integration surface, just a new tag
 * value on an existing one.
 */
export async function tagRecoveredFromNoShow(
  emailPlatform: string,
  apiKey: string,
  email: string,
  meta: Record<string, any> = {}
): Promise<void> {
  const properties = {
    showtime_recovered_from_no_show: "true",
    showtime_recovered_at: new Date().toISOString(),
  };

  switch (emailPlatform) {
    case "klaviyo":
      return new KlaviyoClient(apiKey).setProfileProperty(email, properties);

    case "hubspot":
      return new HubSpotClient(apiKey).setCustomProperty(email, properties);

    case "ghl":
      if (!meta.location_id) throw new Error("GHL recovered-from-no-show tagging requires location_id in stack");
      return new GHLCRMClient(apiKey, meta.location_id).setCustomFields(email, properties);

    case "mailchimp":
      if (!meta.target_list_id && !meta.recovery_list_id) {
        throw new Error("Mailchimp recovered-from-no-show tagging requires target_list_id or recovery_list_id in stack");
      }
      return new MailchimpClient(apiKey).setMergeField(
        meta.target_list_id ?? meta.recovery_list_id,
        email,
        "SHOWRECOV",
        "true"
      );

    case "convertkit":
      return new ConvertKitClient(apiKey).setCustomFields(email, properties);

    default:
      // ActiveCampaign: same custom-field-ID limitation documented on
      // deliverPersonalizedIntro/deliverRescheduleLink in email.ts.
      // SMTP: no CRM/profile layer at all to tag.
      // Best-effort tagging, not a required side effect of a rebook — the
      // caller logs this as an open item, not a hard failure.
      throw new Error(`Recovered-from-no-show tagging isn't supported for ${emailPlatform} yet.`);
  }
}
