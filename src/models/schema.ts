import {
  pgTable,
  text,
  jsonb,
  timestamp,
  uuid,
  integer,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Run instrumentation types ───────────────────────────────────────────────
// Mirrors the five-field phase-log format from the OG skill pack
// (skcs/skills/*/SKILL.md, config_schema.md "Five-field summary format"):
// What was attempted / What worked / What failed / Open items / Decisions made.
// Pin-Down etc. write this to /memories/{engagement_id}/phase_logs/*.md today;
// `summary` below is the Postgres-side mirror so the dashboard can render it
// without reading the agent's filesystem.
export type RunSummary = {
  whatWasAttempted: string[];
  whatWorked: string[];
  whatFailed: string[];
  openItems: string[];
  decisionsMade: string[];
};

// One entry per phase *transition* or per discrete unit of work inside a
// phase (e.g. one entry per prospect processed in a pre-call-read run that
// loops over many calls under a single runId). Append-only — never edit an
// existing entry, only push new ones. This is what lets the dashboard show
// the actual sequence of what happened instead of only the latest phase.
export type RunStep = {
  phase: string;            // internal phase key, e.g. "voice_extraction" — pass through phaseLabel() to render
  label?: string;           // optional human-readable detail beyond the phase name, e.g. "Sarah Jenkins (sarah@acme.com)"
   status: "running" | "success" | "failed" | "skipped" | "cancelled";
  detail?: string;          // free-text outcome for this specific step, e.g. "Identity confidence 98/100 — brief sent via Slack"
  startedAt: string;        // ISO timestamp
  completedAt?: string;     // ISO timestamp, set when the step finishes
};

// ── Typed stack shape — applied to the jsonb column so TS catches misuse ──
export type EngagementStack = {
  // "discover_from_docs" recovers the OG SKILL.md's "unlisted platform ->
  // search the web for developer docs and integrate anyway" behavior (Pin-
  // Down recovery gap 6). Selecting it routes onboarding through
  // src/features/pin-down/server/doc-research.ts instead of a fixed
  // adapter — see discovered_platform_name/discovered_platform_website
  // below for the inputs that drive that research pass.
  booking_platform: "calendly" | "cal_com" | "ghl_calendar" | "oncehub" | "discover_from_docs" | "unsupported";
  booking_platform_credentials_ref: string;
  // The buyer's standard, always-open booking page URL — used as the
  // reschedule fallback when live slot pre-fetch returns zero results.
  booking_standing_link?: string;
  booking_platform_meta?: {
    // Calendly
    organization_uri?: string;
    event_type_uuid?: string;
    // Cal.com
    username?: string;
    cal_event_type_id?: string;
    // GHL
    location_id?: string;
    calendar_id?: string;
    // OnceHub
    account_id?: string;
  };
  // "webhook" (default when the platform supports it), "polling" (Pin-Down
  // recovery gap 5 — periodic "list bookings since timestamp" instead of a
  // push subscription, for platforms with no reliable webhook support), or
  // "none" (booking events must be entered manually / not tracked). See
  // src/lib/platforms/booking.ts#listBookingsSinceForTenant and
  // src/inngest/crons.ts#bookingPollCron.
  webhook_receiver_mode?: "webhook" | "polling" | "none";
  webhook_poll_interval_minutes?: number; // default 5
  // ISO timestamp of the last successful poll — the watermark the next
  // poll cycle reads forward from. Only meaningful when
  // webhook_receiver_mode === "polling".
  webhook_receiver_last_polled_at?: string;
  hosting_platform: "webflow" | "lovable" | "ghl" | "wordpress" | "nextjs_vercel" | "plain_html" | "discover_from_docs";
  hosting_platform_credentials_ref: string;
  hosting_site_id?: string;
  publish_domain?: string;
  hosting_platform_meta?: {
    // Webflow
    webflow_site_id?: string;
    webflow_collection_id?: string;
    webflow_page_id?: string;
    // WordPress
    wordpress_site_url?: string;
    wordpress_page_id?: number;
    // Vercel
    vercel_project_name?: string;
    vercel_team_id?: string;
  };
  // ── "discover_from_docs" inputs (Pin-Down recovery gap 6) ─────────────
  // Populated when either booking_platform or hosting_platform is
  // "discover_from_docs". An admin-triggered research pass
  // (doc-research.ts) turns these into a platform_adapter_drafts row for
  // review before anything runs against the tenant's account.
  discovered_platform_name?: string;
  discovered_platform_website?: string;
  // ── Smart pre-fill (Pin-Down recovery gap 1) ───────────────────────────
  // When true, the onboarding form calls
  // POST /api/pin-down/discovery-prefill with the buyer's domain before
  // the operator fills the rest of the form by hand — see
  // src/features/pin-down/server/discovery-prefill.ts.
  discovery_prefill_enabled?: boolean;
  // Buyer's domain, used both by the voice scraper (gap 2) and the
  // discovery pre-fill / existing-page audit (gaps 1 and 7).
  buyer_domain?: string;
  // Set when Discovery (or the operator, manually) finds a confirmation
  // page already live at this URL — triggers the existing-page audit
  // (Pin-Down recovery gap 7) during the confirmation-deploy phase.
  existing_confirmation_page_url?: string;
  email_platform?: "klaviyo" | "hubspot" | "activecampaign" | "convertkit" | "mailchimp";
  email_platform_credentials_ref?: string;
  // ── SMS as a native channel (Pile-On recovery gap 1) ────────────────────
  // "twilio" and "ghl_sms" are direct-send platforms — this app calls their
  // messaging API itself and owns the send schedule via
  // src/inngest/pile-on-sms.ts (durable step.sleep between messages,
  // since neither is a workflow/automation platform the way the ESPs
  // are). "hubspot_sms" follows the same tag-and-let-the-buyer's-own-
  // automation-send pattern as deliverPersonalizedIntro elsewhere in this
  // codebase, since HubSpot has no native SMS send API. See
  // src/lib/platforms/sms.ts.
  sms_platform?: "twilio" | "ghl_sms" | "hubspot_sms" | "none";
  sms_platform_credentials_ref?: string;
  sms_platform_meta?: {
    twilio_account_sid?: string;
    twilio_messaging_service_sid?: string;
    twilio_from_number?: string;
    ghl_location_id?: string;
    hubspot_sms_status_property?: string;
  };
  // Twilio requires a registered A2P 10DLC brand + campaign before it will
  // send marketing SMS to US numbers without heavy carrier filtering/
  // blocking. sendSmsForTenant (sms.ts) refuses to send for Twilio unless
  // this is "campaign_approved" — see the compliance gate there.
  sms_a2p_10dlc_status?: "not_started" | "brand_registered" | "campaign_approved";
  sms_compliance_footer_variant?: "standard" | "custom";
  sms_compliance_footer_custom?: string; // used when variant === "custom"
  // ── Ad-data cohort sync (Pile-On recovery gap 2) ────────────────────────
  // "native_crm" means "no separate ad-data platform — tag the prospect on
  // the email/CRM platform already connected" (the same buyer's-platform-
  // owns-the-data principle used throughout this app), so it has no
  // separate credentials_ref of its own. See src/lib/platforms/ad-data.ts.
  ad_data_platform?: "hyros" | "native_crm" | "google_sheets" | "none";
  ad_data_platform_credentials_ref?: string;
  ad_data_cohort_id?: string;
  ad_data_platform_meta?: {
    hyros_account_id?: string;
    google_sheets_spreadsheet_id?: string;
    google_sheets_cohort_sheet_name?: string;
  };
  // ── Existing-sequence audit (Pile-On recovery gap 4) ────────────────────
  // Operator-flagged during onboarding, same pattern as Pin-Down's
  // existing_confirmation_page_url. Only Klaviyo and HubSpot expose a
  // flows/workflows read API usable for this — see
  // src/features/pile-on/server/existing-sequence-builder.ts.
  existing_pile_on_sequence_flagged?: boolean;
  // Klaviyo list IDs for pile-on and win-back
  target_list_id?: string;
  recovery_list_id?: string;
  // HubSpot/GHL workflow + ActiveCampaign automation IDs for win-back,
  // used both to enroll and (on rebook) to fire the exit signal.
  recovery_workflow_id?: string;
  recovery_automation_id?: string;
  target_workflow_id?: string; // pile-on equivalent (GHL)
  activecampaign_base_url?: string;
  // Win-back cadence config (see recovery_sequence.md). Defaults to a
  // 30-day window if unset.
  recovery_window_days?: 14 | 21 | 30 | 45 | 60;
  daily_send_tolerance?: number; // max touches/day; default 2 (email+SMS same day allowed)
  // Optional: list/workflow to auto-enroll a prospect into once they're
  // declared "lost" (recovery window elapsed with no rebook) — see
  // src/features/win-back/server/lost-deal-sweep.ts. If unset, the sweep
  // still generates the long-term nurture content and marks the prospect
  // lost, it just can't auto-enroll them and says so.
  long_term_nurture_list_id?: string;
  // ── Win-Back recovery gap 3: reschedule mode split ─────────────────────
  // "fresh_link": use the per-prospect single-use reschedule link/UID
  // captured off the original cancellation webhook payload (Calendly's
  // reschedule_url, Cal.com's rescheduleUid) when the platform provides
  // one — see src/lib/platforms/reschedule.ts and
  // winBackEnrollments.freshRescheduleLink. "time_slots" (default): the
  // existing /reschedule/[engagementId] page that live-fetches open
  // slots. Falls back to time_slots automatically when fresh_link is
  // selected but the platform/payload didn't provide a link for this
  // specific prospect.
  reschedule_mode?: "fresh_link" | "time_slots";
  // ── Win-Back recovery gap 4: recovered-from-no-show tagger ─────────────
  // When true, a rebook-during-active-recovery-window event pushes a tag/
  // custom-field update to the buyer's CRM — see
  // src/lib/platforms/crm-tagger.ts. Defaults to true; the buyer's CRM
  // should know this story even though the runtime lives on this app's
  // infra (see the artifact-ownership fields below).
  recovered_from_no_show_tagging_enabled?: boolean;
  // ── Win-Back recovery gap 6: reply detection as exit signal ────────────
  // "native": subscribe to the platform's own inbound-reply webhook where
  // one genuinely exists (HubSpot Conversations today — see
  // inbound-reply.ts's module comment for why Klaviyo/ActiveCampaign fall
  // back to forwarding instead of a fabricated "native" path).
  // "forwarding": the buyer forwards replies (via their inbox's own rule,
  // through an inbound-email-to-webhook bridge like Postmark Inbound or
  // SendGrid Inbound Parse) to inbound_reply_catcher_address.
  // "none" (default): no reply-based exit — the cadence only stops on
  // rebook or window elapse, same as before this recovery existed.
  inbound_reply_mode?: "native" | "forwarding" | "none";
  inbound_reply_catcher_address?: string;
  inbound_reply_webhook_subscription_id?: string;
  // HubSpot's Conversations webhook target URL is configured once per
  // developer app, not per subscription — so a single receiving endpoint
  // gets inbound events for every buyer portal using that app, and needs
  // this field to know which engagement a given payload's `portalId`
  // belongs to. Only relevant when inbound_reply_mode === "native" and
  // email_platform === "hubspot". The operator finds this in their
  // HubSpot account under Settings > Account Setup > Account Defaults.
  hubspot_portal_id?: string;
  // ── Win-Back recovery gap 7: artifact ownership ─────────────────────────
  // Surfaced in the dashboard so operators can see what runs on this
  // app's infra (owner: "mudd_ventures" — the default for every
  // server-side-generated artifact today) vs. what would run on the
  // buyer's own infra under a future "provisioned handoff" export (owner:
  // "buyer"). See the artifacts table and gap 1's two-options note in
  // recovery-service.ts — no export capability exists yet, this field
  // just makes the eventual choice visible rather than deciding it.
  runtime_ownership_model?: "mudd_ventures" | "buyer_exported";
  // Leak-Map sample-size floor (LEAK-002). Below this, a metric's delta is
  // suppressed rather than reported, regardless of how large it looks.
  sample_size_minimum?: number; // default 5
  // ── Leak Map recovery gap 1: buyer-configurable, timezone-aware cadence ──
  // Both default to Monday/1st-of-month, 09:00, UTC (matching the OG
  // SKILL.md's stated defaults) when unset. Checked hourly by
  // leakMapScheduleCron rather than driving a static per-tenant Inngest
  // cron expression — Inngest cron triggers are fixed at deploy time, not
  // dynamic per-row, so "buyer-configurable local time" has to be a tight
  // poll against each engagement's stored schedule instead of a literal
  // per-tenant subscription. Same pattern as the dynamic brief trigger and
  // Pin-Down's polling fallback.
  weekly_summary_schedule?: { dayOfWeek: number; hourLocal: number; timezone: string }; // dayOfWeek: 0=Sun..6=Sat
  monthly_deep_dive_schedule?: { dayOfMonth: number; hourLocal: number; timezone: string };
  // ── Leak Map recovery gap 2: report delivery format ─────────────────────
  // "dashboard_only" (default) — report lands in auditRunsLog, viewable in
  // the dashboard, nothing pushed anywhere. "slack" — Block Kit message to
  // slack_webhook_url. "email" — sent via this app's own outbound email
  // (Resend), not the buyer's ESP — a one-off operational report isn't
  // something the buyer has (or should need) a pre-built flow for, unlike
  // Pile-On/Win-Back's sequences.
  audit_output_format?: "email" | "slack" | "dashboard_only";
  leak_map_report_email?: string;
  // ── Leak Map recovery gap 4: existing-audit audit ───────────────────────
  // Operator-flagged during onboarding, same pattern as Pile-On's
  // existing_pile_on_sequence_flagged. Free-text description since (unlike
  // an ESP flow) there's no API to read an arbitrary external dashboard
  // from — the audit is scored against what the operator describes, not
  // something this app can independently verify.
  existing_audit_flagged?: boolean;
  existing_audit_description?: string;
  // Leak Map recovery gap 3 — which notification-pack alert IDs (see
  // NOTIFICATION_PACK in notification-pack.ts) the operator opted into
  // during onboarding. Activation itself (writing to activeAlerts)
  // happens once, in onboarding-service.ts — this field is the record of
  // the operator's selection, not the live activation state (that's
  // activeAlerts.source === "pack").
  notification_pack_selections?: string[];
  // Brief delivery
  brief_landing_destination?: "slack" | "crm_note" | "calendar_event";
  slack_webhook_url?: string;       // per-engagement, never global
  brief_lead_time_hours?: number;   // default 12, range 1-48
  person_match_confidence_threshold?: number; // default 99
  // ── Pre-Call Read recovery gap 1: dynamic trigger ──────────────────────
  // "nightly" (default): one batch run against tomorrow's roster, same as
  // today. "dynamic_webhook": briefs go out as soon as a call falls inside
  // brief_lead_time_hours of "now", checked on a tight rolling cadence
  // (see src/inngest/crons.ts#dynamicBriefCron) rather than waiting for
  // the nightly batch — see that cron's module comment for why this is a
  // tight-poll implementation rather than a literal webhook subscription
  // (most booking platforms don't expose a distinct "N hours before call"
  // event to subscribe to).
  brief_trigger_type?: "nightly" | "dynamic_webhook";
  // ── Pre-Call Read recovery gap 3: video engagement ─────────────────────
  video_engagement_platform?: "vidalytics" | "wistia" | "youtube_analytics" | "loom" | "none";
  video_engagement_credentials_ref?: string;
  // The confirmation-page hero video's ID/slug on whichever platform hosts
  // it. This app doesn't automate video upload/hosting (Pin-Down generates
  // the SCRIPT, not the video itself — a human records and uploads it) —
  // the operator supplies this once the video is live, same manual
  // hand-off point as the recording itself. video_engagement_meta's
  // per-platform IDs (wistia_video_id etc.) take precedence over this
  // generic field when both are set.
  hero_video_id?: string;
  video_engagement_meta?: {
    wistia_video_id?: string;
    youtube_channel_id?: string;
    loom_folder_id?: string;
  };
  // ── Pre-Call Read recovery gap 5: Apollo/paid-data-provider BYOK ───────
  // Layers on top of, never replaces, whatever platform-level enrichment
  // this app may add later (see the AI Architect Review's recommendation
  // in the transfer analysis) — this is specifically for an operator whose
  // buyer already has their own Apollo/PDL account and wants it used.
  prospect_research_sources_used?: Array<"apollo" | "pdl">;
  apollo_credentials_ref?: string;
  pdl_credentials_ref?: string;
  // Webhook tracking
  webhook_subscription_id?: string; // Calendly/Cal.com subscription URI
  webhook_signing_secret?: string;
};

// ── Users ─────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  whopUserId: text("whop_user_id").notNull().unique(),
  email: text("email"),
  subscriptionStatus: text("subscription_status").notNull().default("inactive"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Engagements ───────────────────────────────────────────────────────────
export const engagements = pgTable("engagements", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id").notNull().unique(),
  whopUserId: text("whop_user_id").notNull(),
  buyer: text("buyer").notNull(),
  schemaVersion: text("schema_version").notNull().default("1.0"),

  // pin-down writes these once — .$type<T>() gives us TS safety on the jsonb
  stack: jsonb("stack").$type<EngagementStack>(),
  offerDetails: jsonb("offer_details").$type<{
    name: string;
    price: string;
    icp: string;
    traffic_temperature: "cold" | "warm" | "hot";
    hybrid_mode_enabled: boolean;
    // Leak Map recovery gap 7 — cross-client benchmarks bucket on
    // traffic_temperature + price_bucket + vertical. Free-text,
    // operator-supplied (not a fixed taxonomy) — bucketing is exact-string
    // match on whatever's entered here, so "Coaching" and "coaching"
    // would bucket separately today. Good enough for the first version;
    // normalizing casing/synonyms is a reasonable follow-up once there's
    // enough real data to see whether it matters.
    vertical?: string;
  }>(),
  brandVoiceProfile: jsonb("brand_voice_profile"),
  // Live URL on the buyer's own domain when the hosting adapter deploy
  // succeeds; falls back to our internal /confirm/[id] preview page when
  // the buyer's platform has no publish API (ghl, lovable, plain_html) or
  // the deploy attempt failed. Never the buyer's ONLY confirmation surface
  // when a live deploy succeeded — that would violate "buyer owns the
  // asset."
  confirmationPageUrl: text("confirmation_page_url"),
  confirmationPageDeployment: jsonb("confirmation_page_deployment").$type<{
    mode: "live" | "paste_ready" | "not_deployed";
    deployedVia?: string;
    reason?: string;
    lastAttemptedAt: string;
  }>(),
  topCallQuestions: jsonb("top_call_questions").$type<string[]>(),
  topObjections: jsonb("top_objections").$type<string[]>(),
  prospectMeets: text("prospect_meets"),
  // The buyer-supplied corpus used for brand-voice extraction. Persisted
  // (rather than shipped through the Inngest event payload) so the
  // pin-down onboarding worker can read it back after the setup route
  // hands off — see src/features/pin-down/server/onboarding-service.ts.
  // Not a secret like the platform credentials, just not small enough to
  // want duplicated in Inngest Cloud's event log on every setup.
  rawVoiceCorpus: text("raw_voice_corpus"),
  // Only populated when confirmationPageDeployment.mode === "paste_ready".
  // Previously this HTML only ever existed in the synchronous HTTP
  // response body from /api/engagements/setup — now that setup finishes
  // asynchronously via Inngest, the buyer needs to be able to come back
  // and fetch it after the fact (see GET /api/engagements/[id]).
  pasteReadyHtml: text("paste_ready_html"),
  pasteReadyInstructions: text("paste_ready_instructions"),
  // Ships the proof block on the confirmation page only when at least one
  // entry has name, role, and quote populated (OG SKILL.md Phase 2 rule).
  existingProof: jsonb("existing_proof").$type<{
    testimonials: Array<{
      name: string;
      role: string;
      company?: string;
      quote: string;
      sourceUrl?: string;
    }>;
  }>(),

  // each skill writes only its own section
  pileOnSequenceAssetMap: jsonb("pile_on_sequence_asset_map"),
  // 3-5 structured ad creative script briefs (not finished ad copy — a
  // brief a copywriter/editor works from), one per content pillar. See
  // src/features/pile-on/server/ad-creative-briefs.ts. Generated once
  // during pin-down onboarding, engagement-level like the recovery
  // cadence and long-term nurture content.
  adCreativeBriefs: jsonb("ad_creative_briefs").$type<{
    generatedAt: string;
    briefs: Array<{
      id: string;
      pillar: "common_questions" | "deeper_questions" | "success_proof" | "objections";
      hook: string;
      angle: string;
      talkingPoints: string[];
      suggestedFormat: string;
      cta: string;
    }>;
  }>(),
  winBackSequenceAssetMap: jsonb("win_back_sequence_asset_map").$type<{
    windowDays: number;
    generatedAt: string;
    emails: Array<{ id: string; offsetDays: number; subject?: string; body: string }>;
    sms: Array<{ id: string; offsetDays: number; body: string }>;
  }>(),
  winBackCounts: jsonb("win_back_counts").$type<{
    recovery_count: number;
    lost_count: number;
  }>(),
  // Generated once a prospect is swept into "lost" status (see
  // lost-deal-sweep.ts) — same shape/philosophy as winBackSequenceAssetMap:
  // content generation only, the buyer's own platform runs the send
  // schedule. Engagement-level (not per-prospect) since the copy itself
  // doesn't need to vary per lost prospect, same as the recovery cadence.
  longTermNurtureAssetMap: jsonb("long_term_nurture_asset_map").$type<{
    generatedAt: string;
    emails: Array<{ id: string; offsetDays: number; subject?: string; body: string }>;
  }>(),

  // ── Pin-Down recovery gap 3: hero + breakout video scripts ────────────
  // Restores the OG SKILL.md deliverable set that page-builder.ts's
  // placeholder video slots never actually produced — see
  // src/features/pin-down/server/script-builder.ts.
  pinDownScriptPack: jsonb("pin_down_script_pack").$type<{
    generatedAt: string;
    heroScript: {
      title: string;
      targetLengthSeconds: number;
      chapters: Array<{ timestampLabel: string; beat: string; script: string }>;
      recordingPrompt: string;
    };
    breakoutScripts: Array<{
      id: string;
      title: string;
      targetLengthSeconds: number;
      script: string;
      recordingPrompt: string;
      sourceQuestion?: string;
    }>;
  }>(),

  // ── Pin-Down recovery gap 7: existing-confirmation-page audit ─────────
  // Populated when discovery (or the operator) finds a confirmation page
  // already live at stack.existing_confirmation_page_url. See
  // src/features/pin-down/server/discovery-prefill.ts.
  pinDownPageAudit: jsonb("pin_down_page_audit").$type<{
    auditedUrl: string;
    auditedAt: string;
    existingPageStrengths: string[];
    existingPageWeaknesses: string[];
    v1Improvements: string[];
  }>(),

  // ── Pin-Down recovery gap 2: site + brand-resource crawl for voice ────
  // Auditable record of what the crawler actually pulled in, alongside
  // (not instead of) rawVoiceCorpus — see
  // src/features/pin-down/server/voice-scraper.ts.
  voiceScrapeArtifacts: jsonb("voice_scrape_artifacts").$type<{
    scrapedAt: string;
    sources: Array<{ kind: "marketing_site" | "sales_page" | "pricing_page" | "esp_broadcast"; url?: string; wordCount: number }>;
    totalWordCount: number;
  }>(),

  // ── Pin-Down recovery gap 1: smart pre-fill result ─────────────────────
  // What the domain crawl found before the operator filled in the rest of
  // the onboarding form by hand — surfaced in the UI so the operator can
  // see/accept/override each field. See discovery-prefill.ts.
  discoveryPrefill: jsonb("discovery_prefill").$type<{
    domain: string;
    crawledAt: string;
    suggestedBuyerName?: string;
    suggestedOfferName?: string;
    suggestedIcp?: string;
    existingConfirmationPageUrl?: string;
    detectedBookingPlatform?: string;
    notes: string[];
  }>(),

  // ── Pile-On recovery gap 1: SMS sequence content ───────────────────────
  // Generated once during Pin-Down onboarding, same lifecycle as
  // adCreativeBriefs and pinDownScriptPack. See
  // src/features/pile-on/server/sms-sequence-builder.ts.
  pileOnSmsAssetMap: jsonb("pile_on_sms_asset_map").$type<{
    generatedAt: string;
    messages: Array<{ id: string; offsetMinutes: number; body: string }>;
  }>(),

  // ── Pile-On recovery gap 4: existing-sequence audit ────────────────────
  // Populated when stack.existing_pile_on_sequence_flagged is true and the
  // buyer's email_platform supports reading flows/workflows (Klaviyo,
  // HubSpot today). See
  // src/features/pile-on/server/existing-sequence-builder.ts.
  pileOnExistingSequenceAudit: jsonb("pile_on_existing_sequence_audit").$type<{
    auditedAt: string;
    platform: string;
    supported: boolean;
    unsupportedReason?: string;
    emails: Array<{
      subject: string;
      sendDelayDays: number | null;
      openRate: number | null;
      clickRate: number | null;
      pillarScores: Record<string, number>;
      recommendation: "keep" | "replace" | "merge" | "drop" | "investigate_before_changing";
      reasoning: string;
    }>;
    recommendedWorkflowLabel: string; // e.g. "showtime_pile_on_v1" — the parallel workflow name to build in the ESP UI
  }>(),

  // ── Leak Map recovery gap 4: existing-audit audit ───────────────────────
  // Populated when stack.existing_audit_flagged is true. Same
  // "audit runs in parallel, never modifies what's there" principle as
  // Pin-Down's page audit and Pile-On's sequence audit.
  existingAuditAuditResult: jsonb("existing_audit_audit_result").$type<{
    auditedAt: string;
    describedCoverage: string[]; // what the operator said the existing report/dashboard covers
    leakMapCoverage: string[]; // what Leak Map's own audit covers
    overlapping: string[];
    gapsLeakMapCloses: string[]; // Leak Map covers, existing report doesn't
    gapsExistingCovers: string[]; // existing report covers, Leak Map doesn't (yet)
    recommendation: string;
  }>(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Skill Runs ────────────────────────────────────────────────────────────
export const skillRuns = pgTable("skill_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  skillName: text("skill_name").notNull(),
  // Scalar "current phase" — kept for backward compat with existing UI
  // (phaseLabel() lookups, module status cards). Treat `steps` below as the
  // source of truth for anything that needs the full history.
  phase: text("phase"),
  status: text("status").notNull().default("running"),
  // Append-only log of every phase transition / unit of work this run did.
  // Never overwritten — always pushed to. This is what the run-detail page
  // renders as a timeline.
  steps: jsonb("steps").$type<RunStep[]>().default([]),
  // Five-field structured breakdown, written when the run reaches a terminal
  // state (or progressively at phase boundaries for long-running skills).
  summary: jsonb("summary").$type<RunSummary>(),
  // The actual error, when status = "failed". Previously discarded after
  // console.error — never written to the DB anywhere in this codebase.
  errorMessage: text("error_message"),
  tokenUsage: jsonb("token_usage").$type<{
    input_tokens: number;
    output_tokens: number;
  }>(),
  costInCents: integer("cost_in_cents"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ── Briefed Calls Log ─────────────────────────────────────────────────────
export const briefedCallsLog = pgTable("briefed_calls_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  callId: text("call_id").notNull().unique(), // idempotency key
  callTime: timestamp("call_time").notNull(),
  prospectName: text("prospect_name"),
  briefDeliveredAt: timestamp("brief_delivered_at"),
  destinationDelivered: text("destination_delivered"),
  personMatchScore: integer("person_match_score"),
  // Pre-Call Read recovery gap 6 — the two fields the transfer analysis
  // flagged as missing from this log's schema, cross-consumed by Win-Back
  // (was the brief delivered before the call was missed, i.e. did the rep
  // actually have context going in?) and Leak Map (delivery-rate audit
  // across the roster). "skipped" for researchStatus means the Rule 14
  // gate didn't pass, not that research was attempted and failed.
  researchStatus: text("research_status"), // "completed" | "skipped_low_confidence" | "failed"
  aiSynthesisStatus: text("ai_synthesis_status"), // "completed" | "failed"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Win-Back Enrollments ────────────────────────────────────────────────
// Individual per-prospect enrollment tracking. Nothing previously recorded
// *who* got enrolled in win-back or *when* — enrollInWinBackSequence just
// called out to the buyer's ESP and returned. That made "has this prospect
// gone past the recovery window without rebooking" an unanswerable
// question, which is exactly why winBackCounts.lost_count sat unused in
// the schema. See src/features/win-back/server/lost-deal-sweep.ts.
export const winBackEnrollments = pgTable("win_back_enrollments", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  prospectEmail: text("prospect_email").notNull(),
  prospectName: text("prospect_name"),
  enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
  // Frozen at enrollment time from the engagement's recovery_window_days —
  // if the buyer changes that setting later, prospects already in-flight
  // should still be judged against the window they were actually enrolled
  // under, not retroactively against a new one.
  recoveryWindowDays: integer("recovery_window_days").notNull(),
  // "active" | "rebooked" | "lost" | "reply_exited"
  status: text("status").notNull().default("active"),
  lostAt: timestamp("lost_at"),
  // Win-Back recovery gap 3 — the per-prospect single-use reschedule
  // link/UID captured off the cancellation webhook payload, when the
  // booking platform provides one. Null whenever the platform doesn't
  // expose this (GHL, OnceHub) or the payload didn't carry it — see
  // src/lib/platforms/reschedule.ts.
  freshRescheduleLink: text("fresh_reschedule_link"),
  // Win-Back recovery gap 6 — why this enrollment stopped, distinct from
  // `status` because "rebooked" is itself a kind of exit but the two
  // questions (what state is this row in vs. why did it leave "active")
  // are useful to query separately once reply-detection is live.
  // "rebooked" | "reply_detected" | "window_elapsed" | null (still active)
  exitReason: text("exit_reason"),
  exitedAt: timestamp("exited_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Audit Runs Log ────────────────────────────────────────────────────────
export const auditRunsLog = pgTable("audit_runs_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  runType: text("run_type").notNull(),
  topIssues: jsonb("top_issues"),
  alertsFired: jsonb("alerts_fired"),
  gaps: jsonb("gaps"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Active Alerts ─────────────────────────────────────────────────────────
export const activeAlerts = pgTable("active_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  metricName: text("metric_name").notNull(),
  threshold: text("threshold").notNull(),
  comparison: text("comparison").notNull(),
  evaluationPeriod: text("evaluation_period").notNull(),
  severity: text("severity").notNull(),
  source: text("source").notNull(),
  // last_fired_at for cooldown — cleaner than abusing skillRuns
  lastFiredAt: timestamp("last_fired_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Credentials Refs (encrypted value, not raw) ───────────────────────────
export const credentialsRefs = pgTable("credentials_refs", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  provider: text("provider").notNull(),
  refKey: text("ref_key").notNull(),       // secrets://acme/calendly_pat
  encryptedValue: text("encrypted_value").notNull(), // AES-256-GCM encrypted
  iv: text("iv").notNull(),                // initialization vector
  // ── Credential health (see src/features/notifications/server/credential-health.ts) ──
  // "ok" | "invalid" | "unknown". "unknown" is the default until the daily
  // health-check cron has run at least once for this row, or if this
  // provider has no verified validation endpoint wired up yet — it does
  // NOT mean "broken", just "not checked."
  healthStatus: text("health_status").notNull().default("unknown"),
  lastCheckedAt: timestamp("last_checked_at"),
  // Raw error from the last failed validation call, surfaced in the
  // credentials dashboard so a buyer sees *why* it's flagged, not just that
  // it is.
  lastCheckError: text("last_check_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Notifications (multi-channel fan-out log + in-app inbox) ─────────────
// Written by src/lib/notify.ts. This table IS the in-app channel — the
// dashboard bell reads directly from it. Slack/email are additional,
// best-effort channels fired alongside the same insert; this row is the
// one channel guaranteed to exist regardless of whether the tenant has
// Slack or email configured.
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  whopUserId: text("whop_user_id").notNull(),
  engagementId: text("engagement_id").references(() => engagements.engagementId),
  runId: uuid("run_id"),
  // "run_failed" | "run_timed_out" | "credential_invalid" | "credential_check_error"
  type: text("type").notNull(),
  severity: text("severity").notNull().default("info"), // "info" | "warning" | "critical"
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Artifacts ─────────────────────────────────────────────────────────────
export const artifacts = pgTable("artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  skillName: text("skill_name").notNull(),
  artifactType: text("artifact_type").notNull(),
  storagePath: text("storage_path").notNull(),
  // Win-Back recovery gap 7 — "mudd_ventures" (default, and the only value
  // in practice today) for anything generated/executed on this app's own
  // infra. "buyer" is reserved for a future exported artifact (see gap 1's
  // "provisioned handoff" option) — nothing writes that value yet, but the
  // column exists so the dashboard has something to surface the moment it
  // does, without a schema change blocking that later feature.
  owner: text("owner").notNull().default("mudd_ventures"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Win-Back Send Log (hybrid personalization outcomes) ───────────────────
// Win-Back recovery gap 5 — "same recipe as Pile-On gap 3, applied to
// Win-Back's message-1 slot" per the transfer analysis. Kept as its own
// table rather than reusing pileOnSendLog, matching this schema's existing
// convention of one log table per skill (briefedCallsLog vs
// auditRunsLog) rather than a single polymorphic log — a shared table
// would need a skill-discriminator column and would mix two skills' rows
// under queries that only ever want one or the other.
export const winBackSendLog = pgTable("win_back_send_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  enrollmentId: text("enrollment_id").notNull(), // winBackEnrollments.id
  prospectEmail: text("prospect_email").notNull(),
  // "hybrid" | "fallback"
  sentVia: text("sent_via").notNull(),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Webhook Events (idempotency) ──────────────────────────────────────────
// Pin-Down recovery gap 8 / AI Architect Review's #1 webhook fix. Every
// inbound booking-platform webhook derives an idempotency key from the
// payload (Calendly's invitee URI, Cal.com's booking UID, etc.) and inserts
// here BEFORE any enrollment side effect runs. The unique constraint on
// (event_source, idempotency_key) is what actually prevents a retried
// delivery from double-enrolling a prospect — see
// src/app/api/webhooks/booking-event/route.ts.
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.engagementId),
    eventSource: text("event_source").notNull(), // e.g. "calendly", "cal_com", "ghl_calendar", "oncehub", "poll:<platform>"
    idempotencyKey: text("idempotency_key").notNull(),
    eventKind: text("event_kind"), // "created" | "cancelled" | "unknown" — informational, not part of the uniqueness key
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
  },
  (table) => [
    // The actual dedup mechanism: a retried delivery (or, for polling
    // mode, a booking seen again because the watermark didn't advance)
    // hits this constraint and the insert fails — the route/poller
    // treats that as "already processed" and returns early instead of
    // re-enrolling the prospect. See booking-event/route.ts.
    uniqueIndex("webhook_events_source_key_uidx").on(table.eventSource, table.idempotencyKey),
  ]
);

// ── Platform Adapter Drafts (auto-doc-research) ───────────────────────────
// Pin-Down recovery gap 6 — the highest-leverage recovery in the Pin-Down
// bucket. When a buyer's hosting or booking platform isn't in the
// supported enum, the operator selects "discover_from_docs" and supplies a
// platform name + website. An admin-triggered research pass
// (src/features/pin-down/server/doc-research.ts) searches the web for
// developer docs, summarizes the integration surface, and writes a draft
// here for a human to review before it's ever registered as a live
// adapter for that one engagement.
export const platformAdapterDrafts = pgTable("platform_adapter_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  platformKind: text("platform_kind").notNull(), // "hosting" | "booking"
  platformName: text("platform_name").notNull(),
  websiteUrl: text("website_url"),
  docsUrl: text("docs_url"),
  // Claude's structured research summary: what the docs said about auth,
  // the relevant endpoints, and a starter adapter sketch. Reviewed by a
  // human before status flips to "approved".
  researchSummary: jsonb("research_summary").$type<{
    authMethod?: string;
    relevantEndpoints?: Array<{ method: string; path: string; purpose: string }>;
    integrationNotes?: string;
    confidence?: "high" | "medium" | "low";
    caveats?: string[];
  }>(),
  // "pending_review" | "approved" | "rejected"
  status: text("status").notNull().default("pending_review"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Pile-On Send Log (hybrid personalization outcomes) ───────────────────
// Pile-On recovery gap 3. The OG SKILL.md called for "per-booking outcome
// logs (hybrid sent vs. fallback fired) to a pile_on_send_log Sheet or CRM
// custom object the buyer can review." Implemented as a real table rather
// than a jsonb column on engagements — this is an append-only, per-booking
// event log (one row per booking, growing indefinitely), which is exactly
// the shape webhookEvents and winBackEnrollments already use elsewhere in
// this schema; mutating a jsonb array on every send would mean a
// read-modify-write race under concurrent bookings for the same
// engagement, which a table with one INSERT per row avoids entirely.
export const pileOnSendLog = pgTable("pile_on_send_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  bookingId: text("booking_id").notNull(),
  prospectEmail: text("prospect_email").notNull(),
  // "hybrid" | "fallback" — which path actually produced the Email 1 the
  // prospect received. See hybrid-personalizer.ts.
  sentVia: text("sent_via").notNull(),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
// Pin-Down recovery gap 9. A single global table (not per-engagement — the
// canonical docs URL for "webflow" is the same regardless of which buyer
// is asking) that a nightly cron HEAD-checks so stale/broken doc links
// surface in the dashboard instead of silently 404ing whenever an operator
// clicks through from a troubleshooting screen.
export const platformDocsLinks = pgTable("platform_docs_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  platform: text("platform").notNull().unique(),
  docsUrl: text("docs_url").notNull(),
  // "ok" | "broken" | "unknown"
  status: text("status").notNull().default("unknown"),
  lastCheckedAt: timestamp("last_checked_at"),
  lastCheckStatusCode: integer("last_check_status_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Metrics Benchmark (cross-client anonymized) ───────────────────────────
// Leak Map recovery gap 7 — "not a recovery, but the highest-leverage new
// capability... the single feature category where being multi-tenant is
// itself the moat." One row per (metric_name, bucket) pair, recomputed
// nightly from every completed audit run across every tenant.
//
// `bucket` is the compound key traffic_temperature + price_bucket +
// vertical, pre-joined into one string (e.g. "warm|2k_5k|coaching") rather
// than three separate columns — every consumer of this table (the lookup
// in audit-engine.ts's report synthesis, the nightly aggregation job)
// wants the whole bucket as a unit, never a partial match on just one
// dimension, so a single indexed string column is both simpler and faster
// than a three-column composite key here.
//
// sampleSize enforces k-anonymity: the aggregation job only ever writes a
// row when sample_size >= 20, specifically so a benchmark can never be
// reverse-engineered to reveal one specific tenant's numbers in a
// small bucket. See leak-map-benchmarks.ts.
export const metricsBenchmark = pgTable("metrics_benchmark", {
  id: uuid("id").defaultRandom().primaryKey(),
  metricName: text("metric_name").notNull(),
  bucket: text("bucket").notNull(),
  sampleSize: integer("sample_size").notNull(),
  p25: text("p25").notNull(), // stored as text — these are display values (e.g. "62"), not used in further arithmetic
  p50: text("p50").notNull(),
  p75: text("p75").notNull(),
  p90: text("p90").notNull(),
  lastComputedAt: timestamp("last_computed_at").defaultNow().notNull(),
});