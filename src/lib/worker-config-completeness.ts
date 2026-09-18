// src/lib/worker-config-completeness.ts
//
// Phase 1 of the onboarding-gating plan (see the "Worker Onboarding &
// Gating: Plan" doc): closes the gap where a worker gets enabled with
// blank required fields and every downstream cron/webhook/chat-triggered
// run fires against it anyway, because inngest/skill.ts's own gate only
// ever checked the boolean `enabled` flag, never field completeness.
//
// Coverage, and what kind of gap each product actually had — traced
// directly, not assumed:
//   - Showtime (pin-down, pile-on, pre-call-read, win-back, leak-map):
//     pile-on/win-back/leak-map had NO self-guard in their own execute()
//     at all before this — a genuinely open hole. pre-call-read had one
//     cross-product check (booking_platform, belongs to pin-down) but
//     nothing on its own fields. pin-down goes through its own wizard,
//     which enforces most fields at submission time, so it's covered here
//     for defense-in-depth (a value edited away after setup, or a
//     manual re-trigger later), not because it was previously unguarded.
//   - Reputation Manager: rep-onboarding is the one worker checked here;
//     the other 6 need nothing beyond it (see worker-registry.ts).
//   - Cold Open (icp-lock, voice-capture, source-connect, send-connect,
//     daily-send): EVERY worker here already throws its own clear error
//     when its own config is missing (runIcpLock/runVoiceCapture/etc. —
//     see each service file), flowing through the same failRun() path.
//     This was not an open hole. What's added here is consistency (one
//     system, one MissingField shape, for every product) and catching it
//     before the worker's own step.run overhead, not closing a raw gap.
//   - Whop Agent: whop-connect, whop-cancellation-save-offer, and
//     whop-bridge-manager are covered; the other 12 need nothing (11
//     verified zero-config) or take per-invocation action inputs, not
//     persistent setup, per worker-registry.ts's own audit trail.
//
// Every field checked below is checked against its REAL stored default,
// not just "is this field in the registry as kind: ask." Tracing the
// actual EngagementStack type (schema.ts) turned up several fields that
// already have a documented, safe fallback (reschedule_mode ->
// "time_slots", recovery_window_days -> 30, daily_send_tolerance -> 2,
// sample_size_minimum -> 5, audit_output_format -> "dashboard_only",
// timezone -> "UTC", the two weekly/monthly schedule objects) — those
// don't block a run; blocking on a field the code already defaults
// safely would just be friction with no correctness payoff, the same
// "1999 form" problem this whole plan exists to remove. Same finding for
// pin-down's castingChoice and prospectMeets — script-builder.ts's own
// comment documents both falling back to "founder_on_camera" when unset,
// so neither blocks despite castingChoice being a consequential choice.
// heroVideoUrl and confirmationPageAnimationsEnabled are genuinely
// optional (the confirmation page ships a placeholder / animations off
// by default) — real fields, worth the Dossier UI eventually, but not
// gate-blocking. publishDomain is excluded entirely: audited and found
// functionally dead (nothing in the actual publish path reads it) — see
// the plan doc's discrepancy ledger; gating on a dead field would be
// exactly the friction this plan removes, not adds.
//
// Fields with genuinely no storage slot anywhere in the schema
// (leak-map's AGING_THRESHOLD_DAYS, whop-refund-dispute-velocity's 4
// thresholds, send-report's REPORT_WINDOW_DAYS) can't be checked here —
// there's nothing to check for presence/absence of. That's a schema-
// migration gap, not a completeness gap; tracked separately (Phase 6 /
// Open Risks in the plan doc), not silently treated as covered.

import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, whopAgentConnections, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { hasCredential } from "@/lib/credentials";
import { getColdOpenConfig } from "@/features/cold-open/server/config";
import type { WorkerId } from "@/lib/worker-registry";

export interface MissingField {
  key: string;
  label: string;
  reason: string;
}

type Checker = (engagementId: string) => Promise<MissingField[]>;

async function loadStack(engagementId: string): Promise<EngagementStack | null> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  return (row?.stack as EngagementStack | null) ?? null;
}

function missing(key: string, label: string, reason: string): MissingField {
  return { key, label, reason };
}

const checkPileOn: Checker = async (engagementId) => {
  const stack = await loadStack(engagementId);
  if (!stack) return [missing("stack", "Client setup", "No stack configuration found for this client at all.")];
  const out: MissingField[] = [];

  // smsPlatform: "none" is a legitimate explicit choice (SMS off) — only
  // truly-unset (never chosen) blocks. Nobody having decided yet is
  // different from having decided against it.
  if (stack.sms_platform === undefined) {
    out.push(missing("smsPlatform", "SMS follow-ups", "Never set — pick a platform or explicitly choose none."));
  } else if (stack.sms_platform !== "none") {
    if (!stack.sms_platform_credentials_ref) {
      out.push(missing("smsPlatformCredential", "SMS platform credential", `${stack.sms_platform} is selected but has no connected credential.`));
    }
    if (stack.sms_platform === "twilio" && !stack.sms_a2p_10dlc_status) {
      out.push(missing("smsA2p10dlcStatus", "A2P 10DLC registration status", "Twilio requires this before it will send US marketing SMS."));
    }
    if (!stack.sms_compliance_footer_variant) {
      out.push(missing("smsComplianceFooterVariant", "SMS compliance footer", "An SMS platform is selected but no compliance footer choice was made."));
    }
  }

  if (stack.ad_data_platform === undefined) {
    out.push(missing("adDataPlatform", "Ad-data cohort platform", "Never set — pick a platform or explicitly choose none."));
  } else if (stack.ad_data_platform !== "none" && stack.ad_data_platform !== "native_crm" && !stack.ad_data_platform_credentials_ref) {
    out.push(missing("adDataPlatformCredential", "Ad-data platform credential", `${stack.ad_data_platform} is selected but has no connected credential.`));
  }

  return out;
};

const checkWinBack: Checker = async (engagementId) => {
  const stack = await loadStack(engagementId);
  if (!stack) return [missing("stack", "Client setup", "No stack configuration found for this client at all.")];
  const out: MissingField[] = [];

  // rescheduleMode, recoveredFromNoShowTaggingEnabled, recoveryWindowDays,
  // dailySendTolerance all have real, documented defaults in the schema
  // itself (time_slots / true / 30 / 2) — none of them block.
  if (stack.inbound_reply_mode === "native" && stack.email_platform === "hubspot" && !stack.hubspot_portal_id) {
    out.push(missing("hubspotPortalId", "HubSpot portal ID", "Native inbound-reply mode on HubSpot is selected but no portal ID is set — inbound replies can't be routed."));
  }

  return out;
};

const checkLeakMap: Checker = async (engagementId) => {
  const stack = await loadStack(engagementId);
  if (!stack) return [missing("stack", "Client setup", "No stack configuration found for this client at all.")];
  const out: MissingField[] = [];

  // auditOutputFormat, weeklySummarySchedule, monthlyDeepDiveSchedule,
  // timezone, sampleSizeMinimum all have real, documented defaults
  // (dashboard_only / Monday 09:00 UTC / 1st-of-month 09:00 UTC / UTC / 5)
  // — none of them block. Note: AGING_THRESHOLD_DAYS (audit-engine.ts) has
  // no storage slot anywhere in the schema, so it genuinely can't be
  // checked here — that's a schema-migration gap, not a completeness gap,
  // and is tracked separately (see Open Risks / Phase 6 in the plan doc).
  if (stack.audit_output_format === "email" && !stack.leak_map_report_email) {
    out.push(missing("leakMapReportEmail", "Report email address", "Email delivery is selected but no address is set."));
  }

  return out;
};

const checkPreCallRead: Checker = async (engagementId) => {
  const stack = await loadStack(engagementId);
  if (!stack) return [missing("stack", "Client setup", "No stack configuration found for this client at all.")];
  const out: MissingField[] = [];

  if (stack.brief_landing_destination === undefined) {
    out.push(missing("briefLandingDestination", "Where briefs land", "Never set — briefs have nowhere to go."));
  } else if (stack.brief_landing_destination === "slack" && !stack.slack_webhook_url) {
    out.push(missing("slackWebhookUrl", "Slack webhook URL", "Slack delivery is selected but no webhook URL is set."));
  }

  // videoEngagementPlatform, conversationIntelligenceProvider,
  // prospectResearchSourcesUsed are all real opt-in features — undefined
  // means "not using this," a legitimate state, not a gap. Their
  // credentials are only checked when the corresponding platform is
  // actually selected.
  if (stack.video_engagement_platform && stack.video_engagement_platform !== "none" && !stack.video_engagement_credentials_ref) {
    out.push(missing("videoEngagementCredential", "Video engagement credential", `${stack.video_engagement_platform} is selected but has no connected credential.`));
  }
  if (stack.prospect_research_sources_used?.includes("apollo") && !(await hasCredential(engagementId, "apollo"))) {
    out.push(missing("apolloCredential", "Apollo credential", "Apollo is selected as a research source but has no connected credential."));
  }
  if (stack.prospect_research_sources_used?.includes("pdl") && !(await hasCredential(engagementId, "pdl"))) {
    out.push(missing("pdlCredential", "People Data Labs credential", "PDL is selected as a research source but has no connected credential."));
  }
  if (stack.conversation_intelligence_provider === "recall_ai" && !stack.conversation_intelligence_credentials_ref) {
    out.push(missing("conversationIntelligenceCredential", "Call intelligence credential", "Recall.ai is selected but has no connected credential."));
  }

  return out;
};

const checkPinDown: Checker = async (engagementId) => {
  const [row] = await db
    .select({ stack: engagements.stack, offerDetails: engagements.offerDetails, rawVoiceCorpus: engagements.rawVoiceCorpus })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  if (!row) return [missing("engagement", "Client", "This engagement doesn't exist.")];
  const stack = (row.stack as EngagementStack | null) ?? null;
  const offer = row.offerDetails;
  const out: MissingField[] = [];

  if (!stack?.buyer_domain) out.push(missing("buyerDomain", "Client domain", "No domain on file — voice extraction and smart pre-fill both need it."));
  if (!row.rawVoiceCorpus) out.push(missing("rawVoiceCorpus", "Brand voice", "No voice corpus captured yet — the domain crawl may not have run or completed."));

  if (!offer?.name) out.push(missing("offerName", "What they're selling", "Not set."));
  if (!offer?.price) out.push(missing("offerPrice", "Price", "Not set."));
  if (!offer?.vertical) out.push(missing("offerVertical", "Industry / vertical", "Not set — also feeds Leak Map's cross-client benchmarks."));
  if (!offer?.icp) out.push(missing("offerIcp", "Ideal customer", "Not set."));
  if (!offer?.traffic_temperature) out.push(missing("trafficTemperature", "Lead source temperature", "Not set."));

  if (stack?.booking_platform === undefined) {
    out.push(missing("bookingPlatform", "Booking platform", "Never set."));
  } else if (!stack.booking_platform_credentials_ref) {
    out.push(missing("bookingPlatformCredential", "Booking platform credential", `${stack.booking_platform} is selected but has no connected credential.`));
  }

  if (stack?.email_platform === undefined) {
    out.push(missing("emailPlatform", "Email platform", "Never set."));
  } else if (!stack.email_platform_credentials_ref) {
    out.push(missing("emailPlatformCredential", "Email platform credential", `${stack.email_platform} is selected but has no connected credential.`));
  }

  if (stack?.hosting_platform === undefined) {
    out.push(missing("hostingPlatform", "Confirmation page hosting", "Never set."));
  } else if (["webflow", "wordpress", "nextjs_vercel"].includes(stack.hosting_platform) && !stack.hosting_platform_credentials_ref) {
    // ghl/lovable/plain_html/discover_from_docs have no publish API to
    // authenticate against (see schema.ts's own confirmationPageUrl
    // comment) — a credential is only meaningful for the three that do.
    out.push(missing("hostingPlatformCredential", "Hosting platform credential", `${stack.hosting_platform} is selected but has no connected credential.`));
  }

  return out;
};

const checkRepOnboarding: Checker = async (engagementId) => {
  const [row] = await db.select({ id: repIdentityGraphs.id }).from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
  // soleAuthorityName is DB-level NOT NULL (schema.ts:2149) and enforced
  // at onboarding-service.ts's own validation before a row can exist at
  // all — so "does a row exist" already implies it's set. Everything
  // else in repIdentityGraphs defaults to an empty array/object, which is
  // a legitimate "nothing captured yet" state, not a block.
  if (!row) return [missing("repIdentityGraph", "Reputation Manager identity", "No identity graph on file for this client — rep-onboarding hasn't actually completed.")];
  return [];
};

const checkIcpLock: Checker = async (engagementId) => {
  const config = await getColdOpenConfig(engagementId);
  if (!config || config.icps.length === 0) return [missing("icps", "ICPs", "No ICP Lock config found — mirrors runIcpLock's own guard.")];
  if (!config.productIdentity) return [missing("productIdentity", "Product identity", "No product name/URL/price/value-prop on file.")];
  return [];
};

const checkVoiceCapture: Checker = async (engagementId) => {
  const config = await getColdOpenConfig(engagementId);
  if (!config?.voiceProfile) return [missing("voiceProfile", "Greeting, sign-off, and tone", "No voice profile found — mirrors runVoiceCapture's own guard.")];
  return [];
};

const checkSourceConnect: Checker = async (engagementId) => {
  const config = await getColdOpenConfig(engagementId);
  if (!config || config.leadSources.length === 0) return [missing("leadSources", "Lead sources", "No lead sources configured — mirrors runSourceConnect's own guard.")];
  return [];
};

const checkSendConnect: Checker = async (engagementId) => {
  const config = await getColdOpenConfig(engagementId);
  if (!config?.sendPlatform) return [missing("sendPlatform", "Sending platform", "No sending platform configured — mirrors runSendConnect's own guard.")];
  return [];
};

const checkDailySend: Checker = async (engagementId) => {
  const config = await getColdOpenConfig(engagementId);
  const out: MissingField[] = [];
  if (!config?.sendPlatform) out.push(missing("sendPlatform", "Sending platform", "Run Send Connect first."));
  if (!config?.dailySendSettings) out.push(missing("dailySendSettings", "Daily send volume/hour/copy mode", "No Daily Send settings on file — mirrors runDailySend's own guard."));
  return out;
};

const checkWhopConnect: Checker = async (engagementId) => {
  if (!(await hasCredential(engagementId, "whop_bot_api_key"))) {
    return [missing("whopBotApiKeyCredential", "Whop Bot API key", "No Whop connection on file for this engagement.")];
  }
  return [];
};

const checkWhopCancellationSaveOffer: Checker = async (engagementId) => {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = (row?.stack as EngagementStack | null) ?? null;
  const out: MissingField[] = [];
  // minTenureDays/cooldownDays (whop_save_offer_min_tenure_days /
  // whop_save_offer_cooldown_days) have real, documented defaults (30/90)
  // already in the schema — they don't block. discount/duration/message
  // explicitly have "no sane default... unset means nothing to propose
  // yet, not propose with a guessed discount" per schema.ts's own comment
  // — these are the ones that actually block.
  if (stack?.whop_save_offer_discount_percentage === undefined) out.push(missing("whop_save_offer_discount_percentage", "Discount percentage", "Not set."));
  if (stack?.whop_save_offer_duration_months === undefined) out.push(missing("whop_save_offer_duration_months", "Duration (months)", "Not set."));
  if (!stack?.whop_save_offer_message) out.push(missing("whop_save_offer_message", "Offer message", "Not set."));
  return out;
};

const checkWhopBridgeManager: Checker = async (engagementId) => {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = (row?.stack as EngagementStack | null) ?? null;
  // fieldMapping (whop_bridge_field_mapping) defaults to an identity
  // mapping when unset per schema.ts's own comment — doesn't block.
  if (!stack?.whop_bridge_destination_url) {
    return [missing("whop_bridge_destination_url", "Destination URL", "No sane default — unset means the bridge is configured to do nothing.")];
  }
  return [];
};

// Fails safe: any workerId not listed here returns "complete" (no
// blocking) rather than guessing at a check that hasn't been verified
// against real storage. See this module's own header for exactly which
// workers that covers today, and what kind of gap (open hole vs.
// consistency improvement) each one actually closes.
const CHECKERS: Partial<Record<WorkerId, Checker>> = {
  "pin-down": checkPinDown,
  "pile-on": checkPileOn,
  "win-back": checkWinBack,
  "leak-map": checkLeakMap,
  "pre-call-read": checkPreCallRead,
  "rep-onboarding": checkRepOnboarding,
  "icp-lock": checkIcpLock,
  "voice-capture": checkVoiceCapture,
  "source-connect": checkSourceConnect,
  "send-connect": checkSendConnect,
  "daily-send": checkDailySend,
  "whop-connect": checkWhopConnect,
  "whop-cancellation-save-offer": checkWhopCancellationSaveOffer,
  "whop-bridge-manager": checkWhopBridgeManager,
};

export async function getMissingRequiredFields(workerId: WorkerId, engagementId: string): Promise<MissingField[]> {
  const checker = CHECKERS[workerId];
  if (!checker) return [];
  return checker(engagementId);
}
