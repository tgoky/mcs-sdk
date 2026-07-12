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
  // Leak-Map sample-size floor (LEAK-002). Below this, a metric's delta is
  // suppressed rather than reported, regardless of how large it looks.
  sample_size_minimum?: number; // default 5
  // Brief delivery
  brief_landing_destination?: "slack" | "crm_note" | "calendar_event";
  slack_webhook_url?: string;       // per-engagement, never global
  brief_lead_time_hours?: number;   // default 12, range 1-48
  person_match_confidence_threshold?: number; // default 99
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
  // "active" | "rebooked" | "lost"
  status: text("status").notNull().default("active"),
  lostAt: timestamp("lost_at"),
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

// ── Platform Docs Links (HEAD-validated, global) ──────────────────────────
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