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
//     Cold Open's other 2 workers (reply-sort, send-report) deliberately
//     have NO entry here — found by this session's own Cold Open audit to
//     be genuinely, if separately, guarded: both are gated at enable-time
//     by isProductOnboarded("cold-open", ...) (requires icp-lock to have
//     already run) AND at run-time by their own preconditionCheck (a
//     second, pre-existing gate ported from the Cold Open skill pack's
//     config.py — see src/features/cold-open/server/config.ts), which
//     soft-skips (status: "skipped") rather than hard-failing. Not the
//     same MissingField shape as this file's, but a real, functioning
//     gate — not silently unguarded.
//   - Whop Agent: whop-connect and whop-cancellation-save-offer have
//     entries below, but this session's own Whop Agent audit traced every
//     skillRunExecute.create call site in the repo and confirmed neither
//     of these two workers ever dispatches through executeSkillRun
//     (src/inngest/skill.ts) at all — both run entirely off their own
//     route/webhook path (bridges/whop-connect/route.ts;
//     src/inngest/whop-agent.ts's cancellation-intent handler). Their
//     entries below are dead code at runtime, kept only for documentation
//     and in case a future dispatch path is added, NOT the thing actually
//     gating either worker today. Both are still genuinely protected —
//     whop-connect's own route validates the key before writing anything;
//     whop-cancellation-save-offer's real dispatch site (whop-agent.ts) has
//     its own inline guard, byte-for-byte equivalent to the checker below,
//     plus every actual Whop write goes through a human-approval queue
//     regardless. whop-bridge-manager's entry is ALSO dead code at runtime
//     for the same reason (confirmed by this session's audit part 2) —
//     it's dispatched only from its own webhook handler in
//     src/inngest/whop-agent.ts, never through executeSkillRun. Its
//     checker logic was verified correct with no regression, but the real
//     protection is getBridgeConfig's own null-return when
//     whop_bridge_destination_url is unset, checked at both real call
//     sites in whop-agent.ts. The other 12 Whop Agent workers need
//     nothing beyond isProductOnboarded("whop-agent", ...) at the
//     enable-toggle route plus WhopAgentClient.forEngagement's own hard
//     throw on a missing connection — confirmed per-worker, not assumed —
//     and none of them can take a real write action against a client's
//     Whop account with missing config (read-only, dry-run-by-default, or
//     approval-queued, verified per worker). A SEPARATE, real bug this
//     same audit found and fixed: several of these workers (whop-ads-
//     draft-approve, whop-bulk-promo-codes, whop-dispute-response's manual
//     path) could take a real action even with the skill explicitly
//     TOGGLED OFF, since only the webhook-auto-trigger paths checked
//     isSkillEnabledForEngagement — see chat-whop-agent.ts's
//     requireSkillEnabled for the fix. That's a disabled-skill gap, not a
//     missing-config gap, so it lives outside this file's own system.
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
// leak-map's AGING_THRESHOLD_DAYS (EngagementStack.aging_threshold_days),
// whop-refund-dispute-velocity's 3 thresholds (refund_dispute_rate_threshold
// / dispute_alert_threshold / min_payment_sample_size, also on
// EngagementStack), and send-report's REPORT_WINDOW_DAYS
// (coldOpenConfig.reportWindowDays, a real notNull().default(7) column) all
// got real storage slots in Phase 6 — this comment previously said none of
// them had one at all, which stopped being true then. All 4 still don't
// block here, same as before, but now for the correct reason: each has a
// real, safe default (30 / 0.08 / 3 / 10 / 7 respectively) applied wherever
// it's actually read, not because there's nothing to check.

import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, whopAgentConnections, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { hasCredential } from "@/lib/credentials";
import { getColdOpenConfig } from "@/features/cold-open/server/config";
import type { WorkerId } from "@/lib/worker-registry";
import { CONFIG_CHECKED_WORKER_IDS, type MissingField } from "@/lib/worker-config-completeness-shared";
import { applyResolvableFacts } from "@/lib/field-writeback";

export type { MissingField };

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
    // smsA2p10dlcStatus and smsComplianceFooterVariant are deliberately NOT
    // included here, despite being real requirements once Twilio SMS
    // actually sends — found by this session's own Showtime audit:
    // skill.ts's completeness gate (the only thing that calls this
    // checker) has no tier distinction and blocks the ENTIRE Pile-On run
    // — including its unrelated ad-data cohort sync — on any non-empty
    // result, which contradicts both fields' own "deferrable" tier
    // ("becomes blocking only once a run actually needs it," not the
    // moment an operator picks Twilio). Both already have a real,
    // independent safety net exactly where they're actually needed:
    // sendSmsForTenant (sms.ts) refuses per-send unless a2p status is
    // "campaign_approved", and appendComplianceFooter (sms.ts) safely
    // defaults an unset variant to "standard" rather than erroring. So an
    // incomplete SMS compliance setup correctly blocks SMS sends
    // specifically, without holding the whole worker hostage.
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
  // — none of them block. Note: AGING_THRESHOLD_DAYS (audit-engine.ts) now
  // reads a real schema slot (EngagementStack.aging_threshold_days,
  // added Phase 6, defaulting to 30 — audit-engine.ts:581) — it still
  // doesn't block, but now for the correct reason — it has a real safe
  // default, same as the other fields in this comment — not because
  // there's nothing to check.
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
  } else if (
    stack.brief_landing_destination === "slack" &&
    !stack.slack_webhook_url &&
    !(stack.slack_channel_id && (await hasCredential(engagementId, "slack")))
  ) {
    out.push(missing("slackWebhookUrl", "Slack webhook or channel", "Slack delivery is selected but there's no webhook URL or connected Slack channel."));
  }

  // videoEngagementPlatform, conversationIntelligenceProvider,
  // prospectResearchSourcesUsed are all real opt-in features — undefined
  // means "not using this," a legitimate state, not a gap.
  //
  // Their credentials are deliberately NOT included here as missing-field
  // blockers, despite each being a real requirement to actually use that
  // opt-in signal — found by this session's own Showtime audit: skill.ts's
  // completeness gate has no tier distinction and blocks the ENTIRE
  // nightly brief run, for every prospect, on any non-empty result, which
  // contradicts all four fields' own "deferrable" tier ("becomes blocking
  // only once a run actually needs it," not the moment an operator opts
  // in). All four already have a real, independent soft-fail at the one
  // place they're actually used, confirmed in brief-service.ts: video
  // engagement lookup failures are caught and folded into the brief as a
  // "couldn't be retrieved" note (line ~132); apollo/pdl resolution uses
  // .catch(() => undefined) so a missing credential just skips that source
  // (line ~266-270); Recall dispatch is wrapped in its own try/catch with
  // the explicit comment "never let a Recall dispatch failure block the
  // brief itself" (line ~370). So an incomplete opt-in correctly degrades
  // that one signal, without holding the whole brief run hostage.

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
  // Phase 2: promote any trusted, applicable client_facts suggestion into
  // its real column BEFORE checking — see field-writeback.ts's own
  // header for exactly which fields qualify and why. The checker below
  // is completely unchanged; it just reads storage that may now be a
  // moment fresher than it was a line ago. Failure here degrades to "the
  // checker sees storage exactly as it already was" — never blocks or
  // throws past this point.
  await applyResolvableFacts(engagementId).catch((err) => console.error(`[worker-config-completeness] field-writeback failed for ${engagementId}:`, err));
  return checker(engagementId);
}

// worker-config-completeness-shared.ts's CONFIG_CHECKED_WORKER_IDS is a
// hand-written mirror of this file's own CHECKERS keys — kept as a
// separate literal, not a re-export, specifically so a client component
// (workers-panel.tsx's setup rollup) can import it without pulling in
// this file's server-only db/credentials imports (see that file's own
// header). A hand-written mirror can drift silently, which would be
// exactly the mislabeling it exists to prevent — a plain on/off worker
// miscounted as an incomplete setup step, or a real one dropped from the
// rollup — so this checks it out loud, once, at module load, in every
// environment except production (a drift is a code review to catch, not
// something to blow up a live request over).
if (process.env.NODE_ENV !== "production") {
  const declared = new Set(CONFIG_CHECKED_WORKER_IDS);
  const actual = new Set(Object.keys(CHECKERS));
  const inSync = declared.size === actual.size && [...declared].every((id) => actual.has(id));
  if (!inSync) {
    throw new Error(
      "worker-config-completeness-shared.ts's CONFIG_CHECKED_WORKER_IDS and worker-config-completeness.ts's own CHECKERS have drifted apart — update both."
    );
  }
}
