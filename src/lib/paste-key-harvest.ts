// src/lib/paste-key-harvest.ts
//
// The paste-a-key equivalent of account-harvest.ts — the trigger point
// for every provider that isn't in composio-providers.ts's
// PROVIDER_TOOLKIT_MAP (Calendly, HubSpot, Klaviyo, Mailchimp, GHL are the
// only 5 with real OAuth in this app). Everything else — Cal.com,
// OnceHub, ActiveCampaign, ConvertKit, SMTP, Twilio, Hyros, Apollo, PDL,
// Recall, Slack, Webflow, WordPress, Vercel, Whop, Instantly, SmartLead,
// Reply.io, Lemlist, Apify — is paste-a-key only, so there's no Composio
// callback to hook a harvest into. This hooks the OTHER real save point
// instead: /api/credentials' own storeCredential call, which every
// paste-a-key provider in this app actually goes through.
//
// HARVESTABLE_PROVIDERS grows one verified provider at a time — Twilio
// (A2P campaign status) is the first, built from its own official OpenAPI
// spec (twilio/twilio-oai on GitHub), cloned and read directly this
// session. Every other provider listed above still needs its own
// account-metadata endpoint confirmed the same way before a harvester for
// it belongs here — jev.ts's own recent rewrite is the concrete example
// of what guessing at an unconfirmed contract costs versus building from
// a real spec. Adding one: one function, one switch case, no change to
// callers — same shape account-harvest.ts grows by.

import { fetchWithTimeout } from "@/lib/http";
import { upsertClientFact } from "@/lib/client-facts";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";

const HARVESTABLE_PROVIDERS: ReadonlySet<string> = new Set<string>(["twilio", "cal_com", "cold_open_instantly", "cold_open_smartlead", "cold_open_lemlist", "cold_open_reply_io"]);

// Provider strings this app uses for credential storage/testing
// (credential-test-providers.ts) are namespaced per-product
// ("cold_open_instantly"), but the actual EngagementStack enum value
// stored in coldOpenConfig.sendPlatform.platform (schema.ts's
// ColdOpenSendPlatformId) is the bare name ("instantly") — this map is
// the one place that translation lives, checked directly against
// schema.ts, not guessed.
const COLD_OPEN_SEND_PLATFORM_IDS: Record<string, string> = {
  cold_open_instantly: "instantly",
  cold_open_smartlead: "smartlead",
  cold_open_lemlist: "lemlist",
  cold_open_reply_io: "reply_io",
};

// ── Whop: Plans -> offerPrice ────────────────────────────────────────────
//
// NOT dispatched through harvestPasteKeyMetadata below — Whop's own
// connect flow (connect-service.ts's connectWhopAccount) doesn't go
// through /api/credentials at all (it has its own dedicated route,
// storeCredential called directly), and it already runs a 15-endpoint
// scope probe that both confirms whether /v1/plans is actually reachable
// on this key AND already resolved the account_id this endpoint requires
// as a query param. Forcing this through the generic provider-string
// dispatcher would mean re-probing something connect-service.ts already
// knows, and losing the probe's own gating (payments is documented there
// as "elevated-scope, failure expected on a standard key" — plans and
// disputes are on the standard probe, so a bot key can usually reach
// them). connectWhopAccount calls this directly instead, after its own
// probe succeeds.
//
// Endpoint and query shape (GET /v1/plans?account_id={id}&limit=1) are
// copied from this app's OWN probe.ts (PROBE_ENDPOINTS' "plans" entry),
// not from the Plans schema pasted into this session — that schema
// (renewal_price/initial_price/currency/formatted_price) was a relayed
// summary of Whop's docs, not verbatim page text, so it's treated at the
// same confidence tier as account-harvest.ts's original (pre-Mailchimp)
// providers: real enough to build against, not yet a "confirmed contract"
// the way jev.ts or the Mailchimp harvester are. Read defensively for
// exactly that reason.
//
// Deliberately NOT built here: calibrating whop_refund_dispute_rate_threshold/
// whop_dispute_alert_threshold/whop_min_payment_sample_size from Whop's
// Refunds/Disputes list endpoints. refund-dispute-velocity-service.ts
// already computes refund_rate/dispute_rate/payment counts for this exact
// purpose via a DIFFERENT Whop API surface — client.statsMetric's
// pre-aggregated receipts/refunds:refund_rate etc. — which is what the
// live monitor actually alerts against. Re-deriving the same numbers by
// paginating raw Refunds/Disputes lists risks a rate that quietly
// disagrees with Whop's own aggregation and with what the monitor already
// trusts. If threshold calibration gets built, it should read from
// statsMetric (the same source the monitor uses), not from these list
// endpoints — a separate, more careful piece than this harvest.
export async function harvestWhopPlans(engagementId: string, apiKey: string, accountId: string): Promise<string[]> {
  // One page of up to 50 plans. UNVERIFIED against Whop's docs: this app's
  // probe only ever sends limit=1, so the page-size ceiling and Whop's
  // pagination scheme haven't been confirmed — a creator with more than 50
  // plans may not see them all here. Confirm both before relying on it.
  const res = await fetchWithTimeout(`https://api.whop.com/v1/plans?account_id=${encodeURIComponent(accountId)}&limit=50`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Whop plans fetch failed [${res.status}]`);
  const data = await res.json();
  // Envelope shape (data.data vs a bare array vs data.plans) wasn't
  // pinned down in what was relayed — read defensively across the
  // plausible shapes rather than assume one.
  type RawPlan = {
    id?: string;
    title?: string;
    name?: string;
    formatted_price?: string;
    renewal_price?: number | string | null;
    currency?: string;
    product?: { title?: string; name?: string };
  };
  const list: RawPlan[] = Array.isArray(data) ? data : (data?.data ?? data?.plans ?? []);

  const plans = list
    .map((plan) => {
      const price: string | undefined =
        plan.formatted_price || (plan.renewal_price != null && plan.currency ? `${plan.renewal_price} ${plan.currency}` : undefined);
      const name: string = String(plan.title ?? plan.name ?? plan.product?.title ?? plan.product?.name ?? plan.id ?? "").trim();
      return price ? { name, price } : null;
    })
    .filter((p): p is { name: string; price: string } => p !== null);

  if (plans.length === 0) return [];

  if (plans.length === 1) {
    await upsertClientFact(engagementId, "offerPrice", plans[0].price, {
      source: "account",
      sourceDetail: "whop_bot_api_key",
      evidence: "The Whop account's only plan (renewal_price, or formatted_price when present).",
    });
    return ["offerPrice"];
  }

  // Several plans: the app can't know which one this offer is, so nothing
  // is filled in. The list is kept for the dossier to offer as a pick.
  await upsertClientFact(engagementId, "whopPlanOptions", plans, {
    source: "account",
    sourceDetail: "whop_bot_api_key",
    evidence: `${plans.length} plans on the Whop account, which one is this offer?`,
  });
  return ["whopPlanOptions"];
}

// ── Twilio: US A2P 10DLC campaign status -> smsA2p10dlcStatus ───────────
//
// Endpoint, base URL, auth scheme, and campaign_status field are copied
// from Twilio's own official OpenAPI spec (github.com/twilio/twilio-oai,
// spec/json/twilio_messaging_v1.json), cloned and read directly in this
// session — same confidence tier as Mailchimp/GHL, not a relayed summary.
//
// GET https://messaging.twilio.com/v1/Services/{MessagingServiceSid}/
// Compliance/Usa2p (the LIST variant — no specific registration Sid
// needed, only the messagingServiceSid this app already stores) returns
// { compliance: [...], meta: {...} }, each entry carrying campaign_status
// ("IN_PROGRESS" | "VERIFIED" | "FAILED" per the spec's own description).
// Auth is HTTP Basic, accountSid:authToken (the spec's own
// accountSid_authToken security scheme) — accountSid comes from this
// engagement's own stored sms_platform_meta, authToken is the pasted
// credential value.
//
// Twilio's raw campaign_status does NOT map 1:1 onto this app's own
// sms_a2p_10dlc_status enum (schema.ts: "not_started" | "brand_registered"
// | "campaign_approved") — that's a 3-state lifecycle spanning BOTH brand
// registration and campaign approval, this endpoint only covers the
// campaign half. Only the two states resolvable WITHOUT also calling
// Twilio's separate BrandRegistrations resource are written:
//   - campaign_status "VERIFIED" -> "campaign_approved" (Twilio's own
//     semantics: this is exactly the gate sendSmsForTenant checks for).
//   - A campaign exists but isn't VERIFIED -> "brand_registered". Not a
//     guess: Twilio requires an approved brand before a campaign can be
//     created at all, so a campaign existing here logically implies that
//     step already passed, regardless of this campaign's own outcome.
//   - No campaign in the list at all -> genuinely ambiguous between
//     "not_started" and "brand_registered" (a approved brand with no
//     campaign submitted yet looks identical to no brand at all from this
//     one endpoint) — writes nothing rather than guess between them.
export async function harvestTwilioA2PStatus(engagementId: string, authToken: string): Promise<string[]> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = (row?.stack as EngagementStack | null) ?? null;
  const accountSid = stack?.sms_platform_meta?.twilio_account_sid;
  const messagingServiceSid = stack?.sms_platform_meta?.twilio_messaging_service_sid;
  if (!accountSid || !messagingServiceSid) return [];

  const res = await fetchWithTimeout(`https://messaging.twilio.com/v1/Services/${encodeURIComponent(messagingServiceSid)}/Compliance/Usa2p`, {
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
  });
  if (!res.ok) throw new Error(`Twilio A2P compliance fetch failed [${res.status}]`);
  const data = (await res.json()) as { compliance?: Array<{ campaign_status?: string | null }> };
  const campaign = data.compliance?.[0];
  if (!campaign) return [];

  const status = campaign.campaign_status === "VERIFIED" ? "campaign_approved" : "brand_registered";
  await upsertClientFact(engagementId, "smsA2p10dlcStatus", status, {
    source: "account",
    sourceDetail: "twilio",
    evidence: `Twilio's own Usa2p campaign_status: ${campaign.campaign_status ?? "null"}.`,
  });
  // "brand_registered" is also what a FAILED campaign maps to (the brand
  // must be approved for a campaign to exist at all), which reads like
  // progress. Keep Twilio's raw status too so the app can say the campaign
  // was rejected and needs resubmitting.
  if (campaign.campaign_status) {
    await upsertClientFact(engagementId, "smsA2pCampaignStatus", campaign.campaign_status, {
      source: "account",
      sourceDetail: "twilio",
      evidence: "Twilio's own Usa2p campaign_status.",
    });
  }
  return campaign.campaign_status ? ["smsA2p10dlcStatus", "smsA2pCampaignStatus"] : ["smsA2p10dlcStatus"];
}

// ── Cal.com: /v2/me -> bookingPlatform, timezone ─────────────────────────
//
// Base URL, header shape (cal-api-v2-key, not Bearer — PATs use a
// different header than OAuth tokens per this app's own existing
// CalComClient comment), and the /v2/me endpoint are already live,
// trusted code in this app (platforms/booking.ts's CalComClient,
// used for checkCredentialHealth). The response SHAPE
// ({status, data: {...}}) and exact field names (username, email, name,
// timeZone) are confirmed from Cal.com's own official OpenAPI spec
// (github.com/calcom/cal.com, docs/api-reference/v2/openapi.json),
// fetched directly in this session — CalComClient's own
// checkCredentialHealth never parses the body, only checks res.ok, so
// this is the first place in this app that actually reads it.
export async function harvestCalCom(engagementId: string, apiKey: string): Promise<string[]> {
  const res = await fetchWithTimeout("https://api.cal.com/v2/me", {
    headers: { "cal-api-v2-key": apiKey, "cal-api-version": "2024-08-13" },
  });
  if (!res.ok) throw new Error(`Cal.com /v2/me fetch failed [${res.status}]`);
  const payload = (await res.json()) as { status?: string; data?: { name?: string; timeZone?: string } };
  if (payload.status !== "success" || !payload.data) return [];

  const written: (string | null)[] = [];
  // Connecting Cal.com at all IS choosing it as the booking platform —
  // same definitional pattern as Calendly in account-harvest.ts.
  if (await writePasteKeyFact(engagementId, "bookingPlatform", "cal_com", "cal_com", "Connected via Cal.com PAT.")) written.push("bookingPlatform");
  if (await writePasteKeyFact(engagementId, "timezone", payload.data.timeZone, "cal_com", "Cal.com account's own timeZone.")) written.push("timezone");
  return written.filter((k): k is string => k !== null);
}

// ── Cold Open send platforms: connecting IS choosing ─────────────────────
//
// No account-metadata endpoint needed for this fact — the same
// definitional pattern account-harvest.ts already uses for
// bookingPlatform/emailPlatform. sendPlatform is a JSONB object
// ({platform, baseUrl?}, schema.ts), not a bare string, so the fact value
// mirrors that shape rather than writing a string a future resolver would
// have to re-wrap.
async function harvestColdOpenSendPlatformChoice(engagementId: string, provider: string): Promise<string[]> {
  const platform = COLD_OPEN_SEND_PLATFORM_IDS[provider];
  if (!platform) return [];
  await upsertClientFact(engagementId, "sendPlatform", { platform }, {
    source: "account",
    sourceDetail: provider,
    evidence: `Connected ${platform} via a paste-a-key credential.`,
  });
  return ["sendPlatform"];
}

async function writePasteKeyFact(engagementId: string, key: string, value: unknown, provider: string, evidence?: string): Promise<string | null> {
  if (value === undefined || value === null || value === "") return null;
  await upsertClientFact(engagementId, key, value, { source: "account", sourceDetail: provider, evidence });
  return key;
}

export function isHarvestablePasteKeyProvider(provider: string): boolean {
  return HARVESTABLE_PROVIDERS.has(provider);
}

/**
 * Mirrors harvestAccountMetadata's contract exactly — never throws past
 * this point, degrades to "nothing harvested" on any failure, and must
 * never be able to turn a successful credential save into an error for
 * the person who just pasted a working key.
 *
 * Adding a provider: verify its account-metadata endpoint against that
 * vendor's own docs first (see this file's header), then add one case
 * here and one entry to HARVESTABLE_PROVIDERS, importing upsertClientFact
 * from "@/lib/client-facts" the same way account-harvest.ts does.
 */
export async function harvestPasteKeyMetadata(
  engagementId: string,
  provider: string,
  credentialValue: string
): Promise<{ factsWritten: string[] } | { error: string }> {
  if (!isHarvestablePasteKeyProvider(provider)) {
    return { factsWritten: [] };
  }
  try {
    let factsWritten: string[];
    switch (provider) {
      case "twilio":
        factsWritten = await harvestTwilioA2PStatus(engagementId, credentialValue);
        break;
      case "cal_com":
        factsWritten = await harvestCalCom(engagementId, credentialValue);
        break;
      case "cold_open_instantly":
      case "cold_open_smartlead":
      case "cold_open_lemlist":
      case "cold_open_reply_io":
        factsWritten = await harvestColdOpenSendPlatformChoice(engagementId, provider);
        break;
      default:
        factsWritten = [];
    }
    // Connecting any account is a chance to do the website work too — crawl
    // if a domain is on file and the site hasn't been crawled yet.
    import("@/lib/discover-client")
      .then(({ discoverClientIfNotYetCrawled }) => discoverClientIfNotYetCrawled(engagementId))
      .catch((err) => console.warn(`[paste-key-harvest] post-harvest crawl failed for ${engagementId}:`, err));
    return { factsWritten };
  } catch (err: any) {
    console.error(`[paste-key-harvest] ${provider} harvest failed for engagement ${engagementId}:`, err);
    return { error: err?.message ?? "Unknown harvest error" };
  }
}
