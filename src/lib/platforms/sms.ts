/**
 * SMS Platform Clients — Pile-On recovery gap 1.
 *
 * Unlike email.ts's ESP clients, this file is NOT uniformly "tag the
 * buyer's platform and let their own automation send" — that pattern only
 * holds for hubspot_sms, because HubSpot has no native SMS send API.
 * Twilio and GHL SMS are direct-send: this app calls their messaging API
 * itself and owns the send schedule (see
 * src/features/pile-on/server/sms-sequence-builder.ts for content and
 * src/inngest/pile-on-sms.ts for the durable multi-message scheduler).
 * That split is a real architectural difference, not an inconsistency —
 * Twilio is a raw messaging API with no concept of a "workflow" to enroll
 * into, and while GHL's Conversations API can send SMS directly, there's
 * no GHL-side SMS *sequence* object equivalent to their email workflows to
 * hand this off to either.
 */

import { fetchWithTimeout } from "@/lib/http";

// ── Twilio ────────────────────────────────────────────────────────────────

export class TwilioClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(
    private accountSid: string,
    authToken: string,
    private messagingServiceSid?: string,
    private fromNumber?: string
  ) {
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
    this.authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
  }

  /**
   * Sends one SMS. Requires either a Messaging Service SID (preferred —
   * Twilio handles number pooling/failover) or a specific From number.
   * Throws on non-2xx rather than swallowing, since a failed SMS send in
   * a scheduled sequence needs the caller (pile-on-sms.ts) to know so it
   * can log the failure rather than silently skip a message.
   */
  async sendSms(to: string, body: string): Promise<{ sid: string }> {
    if (!this.messagingServiceSid && !this.fromNumber) {
      throw new Error("Twilio send requires either twilio_messaging_service_sid or twilio_from_number in sms_platform_meta");
    }

    const params = new URLSearchParams({ To: to, Body: body });
    if (this.messagingServiceSid) {
      params.set("MessagingServiceSid", this.messagingServiceSid);
    } else {
      params.set("From", this.fromNumber!);
    }

    const res = await fetchWithTimeout(`${this.baseUrl}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Twilio send failed [${res.status}]: ${errBody.slice(0, 300)}`);
    }

    const data = await res.json();
    return { sid: data.sid };
  }

  /** Lightweight liveness check — GET the account resource. */
  async checkCredentialHealth(): Promise<void> {
    const res = await fetchWithTimeout(`${this.baseUrl}.json`, { headers: { Authorization: this.authHeader } });
    if (!res.ok) throw new Error(`Twilio credential check failed [${res.status}]`);
  }
}

// ── GHL SMS (Conversations API) ─────────────────────────────────────────────

export class GHLSmsClient {
  private baseUrl = "https://services.leadconnectorhq.com";
  private headers: HeadersInit;

  constructor(apiKey: string, private locationId: string) {
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    };
  }

  private async findContactId(email: string): Promise<string | null> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/contacts/?email=${encodeURIComponent(email)}&locationId=${this.locationId}`,
      { headers: this.headers }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.contacts?.[0]?.id ?? null;
  }

  /**
   * Sends one SMS via GHL's Conversations API (type: "SMS"). Looks the
   * contact up by email first — GHL's messaging endpoint is
   * contact-scoped, not phone-number-scoped, same lookup-by-email pattern
   * GHLCRMClient uses in email.ts.
   */
  async sendSms(email: string, body: string): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) {
      throw new Error(`No GHL contact found for ${email} — can't send SMS to a contact that doesn't exist yet.`);
    }

    const res = await fetchWithTimeout(`${this.baseUrl}/conversations/messages`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        type: "SMS",
        contactId,
        message: body,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`GHL SMS send failed [${res.status}]: ${errBody.slice(0, 300)}`);
    }
  }
}

// ── HubSpot SMS (tag-based, buyer's own automation sends) ──────────────────

export class HubSpotSmsClient {
  private baseUrl = "https://api.hubapi.com";
  private headers: HeadersInit;

  constructor(apiKey: string) {
    this.headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  }

  /**
   * HubSpot has no native SMS send API — the standard HubSpot integration
   * pattern for SMS is a marketplace app (e.g. a Twilio/HubSpot connector)
   * whose workflow trigger watches a contact property. This sets that
   * property; it does NOT send anything itself. Documented honestly here
   * rather than silently no-op'd, same as deliverPersonalizedIntro's
   * ActiveCampaign caveat in email.ts.
   */
  async enrollSmsSequence(email: string, statusPropertyName: string): Promise<void> {
    await fetchWithTimeout(`${this.baseUrl}/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({ properties: { [statusPropertyName]: "sms_sequence_enrolled" } }),
    }).catch(() => {});
  }
}

// ── Compliance ───────────────────────────────────────────────────────────

/**
 * STOP/HELP footer, appended to every generated SMS body regardless of
 * platform — not just Twilio. Carriers filter unsubscribe-less marketing
 * SMS on GHL-originated traffic too; this isn't a Twilio-specific
 * requirement even though Twilio's A2P 10DLC gate below is.
 */
export function appendComplianceFooter(body: string, variant: "standard" | "custom" = "standard", customFooter?: string): string {
  const footer = variant === "custom" && customFooter ? customFooter : "Reply STOP to unsubscribe, HELP for help.";
  if (body.toLowerCase().includes("stop") && body.toLowerCase().includes("help")) return body; // already has one
  return `${body}\n\n${footer}`;
}

// ── Router ────────────────────────────────────────────────────────────────

export interface SmsTenantMeta {
  twilio_account_sid?: string;
  twilio_messaging_service_sid?: string;
  twilio_from_number?: string;
  ghl_location_id?: string;
  hubspot_sms_status_property?: string;
  sms_compliance_footer_variant?: "standard" | "custom";
  sms_compliance_footer_custom?: string;
}

/**
 * Direct-send path — Twilio and GHL SMS only. hubspot_sms and "none"
 * intentionally aren't handled here; callers (pile-on-sms.ts,
 * enrollment-service.ts) branch on sms_platform before calling this and
 * route hubspot_sms through enrollSmsSequenceForTenant below instead,
 * since sending and tagging are genuinely different operations with
 * different failure semantics.
 *
 * The A2P 10DLC gate lives here, not in TwilioClient itself, so it's
 * enforced at the one call site that matters regardless of which future
 * caller reaches for sendSmsForTenant — a Twilio send with an
 * unregistered brand/campaign will be aggressively filtered or blocked by
 * US carriers, so refusing before attempting is more honest than sending
 * into a silent black hole and reporting false success.
 */
export async function sendSmsForTenant(
  smsPlatform: string,
  apiKey: string,
  meta: SmsTenantMeta | undefined,
  to: { email: string; phone?: string },
  body: string,
  a2p10dlcStatus?: "not_started" | "brand_registered" | "campaign_approved"
): Promise<void> {
  // Centralized compliance parsing runs before hitting provider network switch boundaries
  const complianceBody = appendComplianceFooter(
    body,
    meta?.sms_compliance_footer_variant,
    meta?.sms_compliance_footer_custom
  );

  switch (smsPlatform) {
    case "twilio": {
      if (a2p10dlcStatus !== "campaign_approved") {
        throw new Error(
          `Twilio A2P 10DLC status is "${a2p10dlcStatus ?? "not_started"}", not "campaign_approved" — refusing to send. ` +
          "Unregistered marketing SMS to US numbers gets carrier-filtered or blocked outright; complete brand + campaign registration first."
        );
      }
      if (!to.phone) throw new Error("Twilio send requires a phone number — none was captured for this prospect.");
      if (!meta?.twilio_account_sid) throw new Error("Missing twilio_account_sid in sms_platform_meta");
      await new TwilioClient(meta.twilio_account_sid, apiKey, meta.twilio_messaging_service_sid, meta.twilio_from_number).sendSms(
        to.phone,
        complianceBody
      );
      return;
    }

    case "ghl_sms": {
      if (!meta?.ghl_location_id) throw new Error("Missing ghl_location_id in sms_platform_meta");
      await new GHLSmsClient(apiKey, meta.ghl_location_id).sendSms(to.email, complianceBody);
      return;
    }

    default:
      throw new Error(`sendSmsForTenant does not support direct sends for platform "${smsPlatform}"`);
  }
}

/** Tag-based path — hubspot_sms only today. */
export async function enrollSmsSequenceForTenant(
  smsPlatform: string,
  apiKey: string,
  meta: SmsTenantMeta | undefined,
  email: string
): Promise<void> {
  switch (smsPlatform) {
    case "hubspot_sms":
      await new HubSpotSmsClient(apiKey).enrollSmsSequence(email, meta?.hubspot_sms_status_property ?? "showtime_sms_status");
      return;
    default:
      throw new Error(`enrollSmsSequenceForTenant does not support tag-based enrollment for platform "${smsPlatform}"`);
  }
}