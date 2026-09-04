import {
  pgTable,
  text,
  jsonb,
  timestamp,
  uuid,
  integer,
  boolean,
  uniqueIndex,
  index,
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
   status: "running" | "success" | "failed" | "skipped" | "cancelled" | "pending_review";
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
  webhook_poll_interval_minutes?: number; // default 25
  // ISO timestamp of the last successful poll — the watermark the next
  // poll cycle reads forward from. Only meaningful when
  // webhook_receiver_mode === "polling".
  webhook_receiver_last_polled_at?: string;
  // ── Booking sync observability (Settings → Booking Sync card) ─────────
  // ISO timestamp of the last inbound webhook delivery this engagement
  // accepted (signature verified, whether or not it turned out to be a
  // duplicate). Written by src/app/api/webhooks/booking-event/route.ts.
  // This is the one field that answers "is the webhook actually firing?"
  // independent of webhook_receiver_mode — a tenant can be in "polling"
  // mode and still have a webhook mid-setup delivering test events, and
  // this is how the status card shows that instead of only ever showing
  // the poll watermark.
  webhook_last_received_at?: string;
  // Human-readable reason for the most recent REJECTED delivery (bad/
  // missing signature, missing secret, etc.) — cleared on the next
  // successful delivery. Surfaced directly in the sync status card so a
  // buyer sees *why* their webhook isn't registering instead of silence.
  webhook_last_error?: string;
  // Set true when a buyer on ghl_calendar/oncehub (platforms with no
  // programmatic webhook registration — see registerWebhookForTenant in
  // booking.ts) explicitly dismisses the "add your webhook" setup nudge,
  // choosing to stay on polling. Respected by needsWebhookSetupNudge() in
  // booking-sync-status.ts so the nudge doesn't keep reappearing for a
  // buyer who made an informed choice — mirrors the two-tier "auto-sync
  // vs instant webhook" choice these buyers are explicitly offered.
  webhook_receiver_setup_dismissed?: boolean;

  // ── Failed-run fix-it queue items (error-classification.ts) ────────────
  // Keyed by skillName. A buyer dismissing "GHL rejected the request" for
  // pre-call-read shouldn't also hide a completely unrelated pile-on
  // failure, hence per-skill rather than one flag. Self-heals the same way
  // webhook_receiver_setup_dismissed does: queue.ts's
  // failedRunQueueItems only suppresses an item when this timestamp is
  // >= the failed run's completedAt, so the *next* failure for that skill
  // (a newer completedAt) shows up again automatically — no cleanup step,
  // no new table.
  failed_run_dismissals?: Record<string, string>;

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
  // Operator opt-out: buyer already has a confirmation page and doesn't
  // want Pin-Down to build/deploy a new one. Requires
  // existing_confirmation_page_url to be set. When true, the
  // confirmation_page_deploy phase is skipped entirely (mode
  // "not_deployed") — the existing-page audit still runs since it's
  // read-only and non-destructive, but nothing gets published or
  // overwritten on the buyer's stack.
  existing_confirmation_page_reuse?: boolean;
  // "smtp" is not a workflow/automation platform like the other five — it's
  // a raw mail transport with no list/flow concept to enroll into. It's
  // wired as a direct-send channel (this app owns the schedule), mirroring
  // how sms_platform's twilio/ghl_sms differ from hubspot_sms below. See
  // the module comment at the top of src/lib/platforms/email.ts's SMTPClient
  // section and src/inngest/win-back-email-smtp.ts.
  email_platform?: "klaviyo" | "hubspot" | "activecampaign" | "ghl" | "convertkit" | "mailchimp" | "smtp";
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
  // Verified-defect fix (2026-08-08 handoff, defect #2) — engagement-level
  // IANA timezone (e.g. "America/New_York"), consumed by nightlyBriefsCron
  // via matchesDailyLocalHour (schedule-matcher.ts) so nightly briefs land
  // at 20:00 in the buyer's own time instead of a fixed 20:00 UTC.
  // Undefined defaults to "UTC" — identical behavior to today until an
  // engagement actually sets one. credentialHealthCron, lostDealSweepCron,
  // and weeklyMetricsCron already consume this too (via
  // matchesDailyLocalHour / matchesWeeklyLocalHour in their own service
  // functions — credential-health.ts, lost-deal-sweep.ts,
  // weekly-metrics.ts), not just nightlyBriefsCron. The Settings UI that
  // writes this now exists: per-engagement, under Edit stack settings >
  // Scheduling (edit-stack-settings.tsx); a workspace-level default that
  // seeds new engagements lives at Settings > Timezones & Region
  // (workspaces.timezone, applied in engagements/new's submit flow).
  timezone?: string;
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
  person_match_confidence_threshold?: number; // default 70
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

  // ── Cross-cutting recovery gap 22: explicit human-approval gates ───────
  // Per the transfer analysis section 8.2: "Every hard change or actual
  // execution requires explicit human confirmation" was a Skill Pack
  // principle UTP's webhook-driven auto-fire model dropped. This is a
  // per-engagement gate — see src/lib/approval-gate.ts. New engagements
  // created via the setup wizard opt into this by default, scoped to
  // confirmation_page_deploy (see submit-payload.ts); engagements from
  // before that default still read as off unless set explicitly, same as
  // any other column that gained a new default after rows already existed.
  // When on, the actions listed in require_approval_action_types (or every
  // gateable action type, if that array is omitted) are queued to
  // pendingActions instead of executing immediately, and only run once an
  // admin approves them via POST /api/actions/[id]/review.
  require_approval_for_side_effects?: boolean;
  // Scoped to the action types with real, wired executors — see
  // approval-gate.ts's module comment for why SMS dispatch isn't a
  // gateable type yet (its timing math is booking-relative and
  // re-deriving it correctly from a deferred payload is real work, not
  // a mechanical extension of this gate).
  require_approval_action_types?: Array<
    "webhook_enrollment" | "cohort_membership_add" | "cohort_membership_remove" | "confirmation_page_deploy"
  >;

  // ── Cross-cutting recovery gap 17: human-only-blocker resume ───────────
  // See src/lib/human-blockers.ts. Doesn't gate anything by itself — this
  // is just the per-engagement notification target for open blockers
  // (falls back to slack_webhook_url / in-app notifications when unset).
  human_blocker_notify_email?: string;

  // ── Leak Map / Pre-Call Read recovery gap 24: conversation intelligence ─
  // Recall.ai meeting-bot integration (see
  // src/lib/platforms/conversation-intelligence.ts). "none" (default)
  // preserves today's behavior — no bot is scheduled and topObjections
  // stays whatever pre_call_read or the operator populated it with
  // manually. Scoped to Recall.ai specifically (not a generic multi-
  // provider adapter) because that's the one integration this pass
  // actually verified against live docs; see that file's header comment.
  conversation_intelligence_provider?: "recall_ai" | "none";
  conversation_intelligence_credentials_ref?: string;
  // Recall.ai bot config knobs an operator might reasonably want to
  // override per engagement — everything else uses safe defaults inside
  // the adapter.
  conversation_intelligence_meta?: {
    recall_bot_name?: string;
    recall_webhook_signing_secret?: string; // Svix signing secret, see the adapter
    // Recall.ai's API is region-hosted (https://{region}.recall.ai/...) —
    // one of "us-east-1" | "us-west-2" | "eu-central-1" | "ap-northeast-1",
    // matching whichever region the operator's Recall workspace was
    // created in (shown in their Recall dashboard). Defaults to
    // "us-east-1" in the adapter when unset, since that's the region
    // every Recall quickstart example uses — but this MUST match the
    // operator's actual workspace region or every call will 404.
    recall_region?: "us-east-1" | "us-west-2" | "eu-central-1" | "ap-northeast-1";
  };

  // ── Pre-Call Read recovery gap 25: predictive show-rate scoring ────────
  // Opt-in (default off) — the scorer is a documented, inspectable
  // weighted-heuristic model (NOT a trained classifier; see
  // src/features/pre-call-read/server/show-rate-scorer.ts for exactly why
  // and what a real trained model would need). Turning this on also
  // starts logging show_rate_features rows for every scored call, which
  // is the data a future trained model would train against.
  show_rate_scoring_enabled?: boolean;

  // ── Slack interactive brief buttons (Leak Map / Pre-Call Read Tier 4) ──
  // Needed only when brief_landing_destination is "slack" AND the operator
  // wants tappable Show/No-show/Rescheduled buttons on the brief message
  // (see src/lib/platforms/slack-interactions.ts). Distinct from
  // slack_webhook_url: the webhook URL is where messages get POSTed *to*;
  // this secret is how this app verifies that a button click POSTed *back*
  // from Slack is genuinely from Slack and not a forged request. Get it
  // from the Slack app's "Basic Information" > "Signing Secret", and the
  // app's "Interactivity & Shortcuts" Request URL must point at
  // POST /api/webhooks/slack/interactions.
  slack_signing_secret?: string;

  // ── Win-Back recovery gap 1 option 2 / Tier 4 #29: export path ─────────
  // runtime_ownership_model already exists above (Win-Back gap 1's owner
  // field). This is the export-specific companion: set by
  // src/features/win-back/server/export-to-skill-pack.ts alongside
  // flipping that field to "buyer_exported", so the dashboard can show
  // *when* an engagement was detached, not just its current owner.
  runtime_ownership_exported_at?: string; // ISO timestamp
  // Which platform(s) the export actually materialized a live flow on
  // (via a real flow-creation API) vs. only produced a paste-ready bundle
  // for. See export-to-skill-pack.ts's module comment for why this is a
  // per-platform capability, not a blanket "export always works" story.
  runtime_export_result?: {
    method: "live_api" | "paste_ready_bundle";
    platform: string;
    exportedFlowId?: string; // set only when method === "live_api"
  };
};

// ── Users ─────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  whopUserId: text("whop_user_id").notNull().unique(),
  email: text("email"),
  subscriptionStatus: text("subscription_status").notNull().default("inactive"),
  // Executions sidebar unread-count fix — a run that starts and finishes
  // between glances used to leave the nav badge back at 0 with no trace
  // anything happened (the badge only ever showed the *currently running*
  // count — see live-count-badge.tsx). NULL means "never visited /
  // pre-migration" and is deliberately treated as zero-unseen rather than
  // "everything since forever," so this doesn't dump a scary backlog
  // count on every existing user the moment this column exists. Set to
  // now() when the user actually visits /dashboard/runs — see
  // markExecutionsSeen in run-log.ts.
  executionsLastSeenAt: timestamp("executions_last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Workspaces ───────────────────────────────────────────────────────────
// A whopUserId can hold several of these; each is a fully independent
// container of its own clients (engagements) and installed skill packages.
// Every account that existed before this table shipped gets exactly one
// auto-created "legacy" workspace (see ensureLegacyWorkspace in
// lib/workspace.ts) with all of its existing engagements backfilled onto
// it, so nothing a user already built goes missing.
export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: text("workspace_id").notNull().unique(),
  whopUserId: text("whop_user_id").notNull(),
  name: text("name").notNull(),
  // True only for the one auto-created backfill workspace per account (see
  // ensureLegacyWorkspace). Its workspaceId is a deterministic
  // `ws_legacy_${whopUserId}` value rather than a random one specifically
  // so concurrent first-visit requests race on a Postgres unique-constraint
  // conflict instead of a check-then-insert read/write race — see that
  // function's comment for why.
  isLegacy: boolean("is_legacy").notNull().default(false),
  // ── Settings > Timezones & Region ───────────────────────────────────────
  // Workspace-level defaults, surfaced at /dashboard/settings/language.
  // `timezone` is an IANA zone (e.g. "America/New_York") applied as the
  // starting value for a new engagement's own stack.timezone at creation
  // (see engagements/new/submit-payload.ts) — the per-engagement value on
  // `engagements.stack.timezone` is what the crons actually read
  // (matchesDailyLocalHour / matchesWeeklyLocalHour in schedule-matcher.ts),
  // this is just the sane starting point for an operator whose buyers are
  // mostly in one region, editable per-client afterward. `locale` is a
  // BCP-47 tag (e.g. "en-US") used for date/number formatting in the
  // dashboard header and elsewhere — see lib/workspace-format.ts.
  timezone: text("timezone").notNull().default("UTC"),
  locale: text("locale").notNull().default("en-US"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Soft delete only — mirrors engagements.deletedAt (see that column's
  // comment in this file). A hard DELETE FROM here would hit the same
  // ON DELETE NO ACTION foreign-key wall the instant a workspace has so
  // much as one engagement, workspace_packages row, or credential_vault
  // entry, which is to say always in practice. Every workspace read
  // (listWorkspaces, getActiveWorkspace, getOwnedWorkspace) filters this
  // out; nothing else needs to know it exists.
  deletedAt: timestamp("deleted_at"),
});

// Which skill packages (see copy.ts's WORKSPACE_PRODUCTS) are installed in
// a given workspace — chosen from the library-kit step of workspace
// creation, or later from /dashboard/library. "showtime" and
// "reputation-manager" are the two real packages today; the table's
// free-text packageId means a third product slots in without another
// migration.
export const workspacePackages = pgTable(
  "workspace_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.workspaceId),
    packageId: text("package_id").notNull(),
    installedAt: timestamp("installed_at").defaultNow().notNull(),
  },
  (table) => ({
    workspacePackageUnique: uniqueIndex("workspace_package_unique").on(
      table.workspaceId,
      table.packageId
    ),
  })
);

// ── Engagements ───────────────────────────────────────────────────────────
export const engagements = pgTable("engagements", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id").notNull().unique(),
  whopUserId: text("whop_user_id").notNull(),
  // Nullable only for rows written before workspaces existed — every read
  // path that lists/creates engagements resolves the caller's active
  // workspace first (see lib/workspace.ts) and every such pre-existing row
  // gets backfilled onto that account's legacy workspace the first time
  // ensureLegacyWorkspace runs for it, so in practice this is only ever
  // NULL for a few moments post-migration, pre-first-visit.
  workspaceId: text("workspace_id").references(() => workspaces.workspaceId),
  buyer: text("buyer").notNull(),
  // Optional, freeform, buyer-set subtitle — never required, never
  // generated, purely a way to tell two same-named clients apart at a
  // glance ("Marvo — roofing arm" vs plain "Marvo"). Deliberately NOT
  // used anywhere `buyer` is — briefs, confirmation pages, AI-engine
  // prompts, anything that needs the client's actual name reads `buyer`,
  // never this. When this is null and the roster finds two rows sharing
  // the same buyer name, it falls back to a computed, never-stored
  // disambiguator (created date) rather than inventing a label on the
  // buyer's behalf — see ClientRosterTable's collision handling.
  label: text("label"),
  // Sidebar client-rail squircle color, set from the "..." row menu's
  // "Add tag color" submenu (src/app/dashboard/client-sidebar-list.tsx).
  // One of ENGAGEMENT_TAG_COLORS' ids (src/lib/engagement-tag-colors.ts),
  // NULL meaning "use the default teal" — never a raw hex value, so the
  // palette can be re-themed later without a data migration.
  tagColor: text("tag_color"),
  schemaVersion: text("schema_version").notNull().default("1.0"),

  // Set once, when the client is launched from the wizard's post-save
  // screen (POST /api/engagements/[id]/launch). Deliberately independent
  // of any bridge (skill/agent) running — "launched" means the client
  // account is configured and ready to have products enabled on it, not
  // that any specific bridge has fired. NULL until launch; a launched
  // engagement never reverts to NULL.
  launchedAt: timestamp("launched_at"),

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
  // Which of the Pin-Down confirmation page designs (see
  // src/features/pin-down/server/templates/) this engagement uses. Plain
  // text rather than a DB enum so adding a new template later is just a
  // new registry entry, no migration — validated against the registry's
  // TemplateId union at the application layer instead (buildConfirmationPageHtml
  // falls back to the default template for any unrecognized value).
  confirmationPageTemplate: text("confirmation_page_template").notNull().default("signal"),
  // Live URL on the buyer's own domain when the hosting adapter deploy
  // succeeds; falls back to our internal /confirm/[id] preview page when
  // the buyer's platform has no publish API (ghl, lovable, plain_html) or
  // the deploy attempt failed. Never the buyer's ONLY confirmation surface
  // when a live deploy succeeded — that would violate "buyer owns the
  // asset."
  confirmationPageUrl: text("confirmation_page_url"),
  confirmationPageDeployment: jsonb("confirmation_page_deployment").$type<{
    mode: "live" | "paste_ready" | "not_deployed" | "pending_review";
    deployedVia?: string;
    reason?: string;
    // Set only when mode === "pending_review" — the confirmation_page_deploy
    // pending_actions row a human needs to approve/reject before this page
    // is actually published. See src/lib/approval-gate.ts.
    pendingActionId?: string;
    lastAttemptedAt: string;
  }>(),
  topCallQuestions: jsonb("top_call_questions").$type<string[]>(),
  topObjections: jsonb("top_objections").$type<string[]>(),
  prospectMeets: text("prospect_meets"),
  // Pin-Down recovery gap 4 — drives buildRecordingChecklist in
  // script-builder.ts. "founder_on_camera" | "coach_on_camera" |
  // "animation" | "other". Nullable — script-builder.ts falls back to
  // "founder_on_camera" when unset, same default prospectMeets uses.
  castingChoice: text("casting_choice"),
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
  // src/features/pile-on/server/ad-creative-briefs.ts. The full set is
  // generated once during pin-down onboarding; the "objections" entry
  // alone can be regenerated later by src/inngest/conversation-intelligence.ts
  // when a live call surfaces a genuinely new objection — see
  // objectionsLastRegeneratedAt below, which is only set when that's
  // happened at least once.
  adCreativeBriefs: jsonb("ad_creative_briefs").$type<{
    generatedAt: string;
    objectionsLastRegeneratedAt?: string;
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
    // Pin-Down recovery gap 4 — recording checklist tuned to the casting
    // choice. See buildRecordingChecklist in script-builder.ts for why
    // this is deterministic logistics guidance (equipment/environment/
    // wardrobe), not LLM-generated creative content.
    recordingChecklist?: {
      castingChoice: "founder_on_camera" | "coach_on_camera" | "animation" | "other";
      equipment: string[];
      environment: string[];
      wardrobeAndFraming: string[];
      perScriptReminders: Array<{ scriptId: string; scriptTitle: string; reminder: string }>;
    };
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
    sources: Array<{
      kind: "marketing_site" | "about_page" | "sales_page" | "pricing_page" | "proof_page" | "supporting_page" | "esp_broadcast";
      url?: string;
      wordCount: number;
    }>;
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

  // Operator-facing off switch. NULL = active (default, no behavior change
  // for existing engagements). When set, every recurring cron
  // (nightlyBriefsCron, dynamicBriefCron, leak map, win-back sweep,
  // weekly metrics, booking poll) skips this engagement — see the shared
  // `isEngagementPaused` filter in src/lib/engagement-status.ts, which all
  // of them import so this can't drift between crons. Does not touch a run
  // already in flight; that's what POST /api/skill-runs/[id]/cancel is
  // for. This is "stop starting new ones," not "kill what's running."
  pausedAt: timestamp("paused_at"),
  pausedReason: text("paused_reason"),

  // ── Soft delete ─────────────────────────────────────────────────────
  // Deliberately not a hard DELETE. ~20 tables (skillRuns, artifacts,
  // credentialsRefs, notifications, activeAlerts, engagementSkills, etc.)
  // store engagementId as a plain text column with no FK/cascade — most
  // don't even have a formal foreign key constraint, just the same string.
  // A hard delete here would either leave orphaned rows scattered across
  // every one of those tables, or require a hand-maintained list of every
  // child table to wipe in a transaction, which silently drifts out of
  // date the next time someone adds a new engagement-scoped table. Setting
  // deletedAt instead: hides the engagement from every list (see the
  // `isNull(engagements.deletedAt)` filters at each read site) and — via
  // the DELETE handler also setting pausedAt — stops every cron from
  // picking it up, without needing to touch a single child table. Nothing
  // is destroyed, so a mis-click during onboarding is recoverable with a
  // restore action instead of a support ticket.
  deletedAt: timestamp("deleted_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
// Server-side backup of the "new engagement" wizard's in-progress state.
// The wizard's primary draft copy lives in the browser's sessionStorage
// (fast, no round trip, survives a same-tab refresh). sessionStorage is
// tied to that one browsing context though — closing the tab, closing the
// app, or the host environment tearing down and recreating the embedded
// frame all wipe it instantly with no warning. This table is the fallback
// that survives all of that: one row per whopUserId, upserted on a debounce
// while the operator fills the form, deleted on successful submit or an
// explicit "discard draft".
//
// formData never contains the wizard's API key fields (bookingApiKey,
// emailApiKey, hostingApiKey, smsApiKey, adDataApiKey,
// videoEngagementApiKey, apolloApiKey, pdlApiKey — see
// src/lib/draft-fields.ts) — same rule as the sessionStorage copy, and
// re-enforced server-side in src/app/api/engagements/draft/route.ts rather
// than trusted from the client.
export const engagementDrafts = pgTable("engagement_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  whopUserId: text("whop_user_id").notNull().unique(),
  step: text("step").notNull().default("offer"),
  formData: jsonb("form_data").notNull().default({}),
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
// ── Booking Roster ──────────────────────────────────────────────────────
// Ground-truth record of every booking, written the moment the webhook
// arrives (see src/lib/booking-roster.ts / src/inngest/booking-webhook.ts)
// — independent of Pile-On/Win-Back/Pre-Call Read being enabled, and
// independent of whether any run has processed the call yet.
//
// This exists because briefedCallsLog (below) is written at *brief-send
// time*, not booking time — a call booked today for two weeks from now had
// no row anywhere until the night Pre-Call Read actually ran for it. That
// made every calendar/list/board view that read briefedCallsLog a
// diagnostic log of past runs, not a roster of upcoming bookings — you
// couldn't see a booking existed until the night before the call. This
// table is the fix: one row per booking, from the moment it's made.
//
// externalCallId is deliberately the same id booking.ts's NormalizedCall.id
// resolves to for this same booking (Calendly event UUID, Cal.com uid, GHL
// event id — see booking-roster.ts's extraction, matched against
// booking.ts's own per-platform `id:` assignment) — the same value that
// ends up as briefedCallsLog.callId once/if Pre-Call Read processes this
// booking. That shared id is what lets a roster query LEFT JOIN
// briefedCallsLog to derive real status (Scheduled for Briefing → Brief
// Delivered / Failed) without this table ever being written to from the
// brief-service.ts path — two independent writers, one join at read time.
export const bookingRoster = pgTable(
  "booking_roster",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.engagementId),
    externalCallId: text("external_call_id").notNull(),
    prospectName: text("prospect_name"),
    prospectEmail: text("prospect_email"),
    prospectPhone: text("prospect_phone"),
    callTime: timestamp("call_time").notNull(),
    callEndTime: timestamp("call_end_time"),
    meetingUrl: text("meeting_url"),
    bookingPlatform: text("booking_platform"),
    // "scheduled" | "cancelled" — deliberately not "no_show"/"completed";
    // those are call *outcomes*, already tracked elsewhere (briefedCallsLog,
    // the outcome-resolution module) and read at query time, not duplicated
    // here. This column only answers "is the booking itself still on."
    status: text("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // One roster row per booking per engagement — a cancellation webhook
    // for a booking already on the roster updates this row in place
    // instead of inserting a second one.
    uniqueIndex("booking_roster_engagement_call_uidx").on(table.engagementId, table.externalCallId),
    // The roster view's primary query pattern: this engagement, this
    // month's date range.
    index("booking_roster_engagement_call_time_idx").on(table.engagementId, table.callTime),
  ]
);

export const briefedCallsLog = pgTable(
  "briefed_calls_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  callId: text("call_id").notNull().unique(), // idempotency key
  // Which skillRuns row processed this call. A single nightly/dynamic
  // Pre-Call Read run loops over every eligible call under one runId (see
  // RunStep's module comment) — this is what lets the run-detail page
  // pull back "every call this specific run briefed" instead of only the
  // generic phase timeline. Nullable because rows written before this
  // column existed have no run to backfill against.
  runId: uuid("run_id"),
  callTime: timestamp("call_time").notNull(),
  // Assumed-no-show sweep false-positive fix — previously the sweep
  // (crons.ts) treated every booking as over 20 minutes after callTime
  // regardless of how long the call was actually scheduled to run,
  // because nothing captured a call's end time. That meant a live
  // 30-60min call on an engagement without Recall.ai bot coverage could
  // get resolved as a no-show, and Win-Back enrolled, while the rep was
  // still on the phone. Populated at brief-send time from
  // NormalizedCall.callEndTime when the booking platform's own API
  // exposes it (currently Calendly, Cal.com, and GHL Calendar — confirmed
  // real end-time fields, not assumed; see booking.ts's module comment
  // for why OnceHub isn't populated yet). Null means "unknown
  // duration," not "call already over" — the sweep treats null
  // differently from a known end time, it does NOT default null to "safe
  // to resolve now."
  callEndTime: timestamp("call_end_time"),
  prospectName: text("prospect_name"),
  // No-show/win-back recovery gap — previously this row (the one thing
  // guaranteed to exist for every briefed call, regardless of whether
  // show_rate_scoring_enabled ever populated a showRateFeatures row) had
  // no way to identify the prospect by anything but name. Every outcome
  // consumer (outcome/route.ts, slack/interactions/route.ts, the Recall
  // bot webhook, and the assumed-no-show sweep in crons.ts) needs a
  // reliable prospectEmail to enroll into Win-Back or sync an ad cohort
  // by. Populated at brief-send time straight from NormalizedCall (see
  // brief-service.ts), the same source booking.ts already trusts for
  // this data — not a re-fetch or a guess.
  prospectEmail: text("prospect_email"),
  prospectPhone: text("prospect_phone"),
  briefDeliveredAt: timestamp("brief_delivered_at"),
  destinationDelivered: text("destination_delivered"),
  personMatchScore: integer("person_match_score"),
  // The actual synthesized 7-section brief text (llmResult.text in
  // brief-service.ts). Previously generated, delivered to Slack/CRM, and
  // then discarded — never queryable again once the delivery happened.
  // This is what the Executive Brief drawer on the run-detail page reads.
  briefText: text("brief_text"),
  // Pre-Call Read recovery gap 6 — the two fields the transfer analysis
  // flagged as missing from this log's schema, cross-consumed by Win-Back
  // (was the brief delivered before the call was missed, i.e. did the rep
  // actually have context going in?) and Leak Map (delivery-rate audit
  // across the roster). "skipped" for researchStatus means the Rule 14
  // gate didn't pass, not that research was attempted and failed.
  researchStatus: text("research_status"), // "completed" | "skipped_low_confidence" | "failed"
  aiSynthesisStatus: text("ai_synthesis_status"), // "completed" | "failed"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Assumed-no-show sweep fix (crons.ts) — the sweep's scan window was
    // widened from 4 hours to 30 days so a call that fell through the
    // cracks once (e.g. a Recall session stuck non-terminal) still gets
    // retried on every future 15-minute pass instead of aging out
    // unresolved forever. That only stays cheap with this index backing
    // the (engagementId, callTime range) filter the sweep queries on.
    index("briefed_calls_log_engagement_call_time_idx").on(table.engagementId, table.callTime),
  ]
);

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
  // The skillRuns row (cancellation/no-show webhook run) that created this
  // enrollment — one win-back run always corresponds to exactly one
  // prospect, so this is a straight 1:1 lookup for the run-detail page.
  // Nullable because rows written before this column existed have no run
  // to backfill against.
  runId: uuid("run_id"),
  enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
  // Frozen at enrollment time from the engagement's recovery_window_days —
  // if the buyer changes that setting later, prospects already in-flight
  // should still be judged against the window they were actually enrolled
  // under, not retroactively against a new one.
  recoveryWindowDays: integer("recovery_window_days").notNull(),
  // "active" | "rebooked" | "lost" | "reply_exited" | "corrected"
  // ("corrected" — a no-show-triggered enrollment that a rep later
  // reversed by logging "showed" for the same booking; see exitReason
  // "outcome_corrected_to_showed" below and resolveCallOutcome in
  // outcome-resolution.ts.)
  status: text("status").notNull().default("active"),
  lostAt: timestamp("lost_at"),
  // Win-Back no-show gap fix — the specific briefedCallsLog.callId this
  // enrollment was triggered from, when it came from a call-outcome
  // resolution (Slack/dashboard button, Recall bot telemetry, or the
  // assumed-no-show sweep) rather than a booking-platform cancellation
  // webhook. Null for the original cancellation-webhook path, which has
  // no single "booking" a cancellation is about in the same sense (the
  // booking itself is what got cancelled). This is the idempotency key
  // resolveCallOutcome checks before enrolling — the same booking can be
  // resolved to "no_show" more than once (a rep's late Slack click after
  // the auto-sweep already fired, for instance) without creating a
  // second active enrollment for the same missed call.
  sourceBookingId: text("source_booking_id"),
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
  // "rebooked" | "reply_detected" | "window_elapsed" | "outcome_corrected_to_showed" | null (still active)
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
  // The skillRuns row this audit came from — one Leak Map run produces
  // exactly one auditRunsLog row, so this is a straight 1:1 lookup.
  // Nullable because rows written before this column existed have no run
  // to backfill against.
  runId: uuid("run_id"),
  topIssues: jsonb("top_issues"),
  alertsFired: jsonb("alerts_fired"),
  gaps: jsonb("gaps"),
  // The full Claude-synthesized markdown report (stage-5 output in
  // audit-engine.ts). Previously generated, delivered via Resend/Slack,
  // and discarded — never queryable again once delivery happened. This is
  // what the Executive Report Reader on the run-detail page renders.
  reportMarkdown: text("report_markdown"),
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

// ── Credential Vault (whopUserId-scoped, reusable across engagements) ────
// Solves the "I manage 5 clients on the same GoHighLevel sub-account and
// have to paste the same API key 5 times" problem — the same one n8n's
// shared-credentials picker solves. A vault row belongs to the operator
// (whopUserId), not to any one engagement. credentialsRefs.vaultId (below)
// is how an engagement "uses" one: not a copy, a live reference — rotate
// the key here and every engagement pointing at it picks up the new value
// on its very next resolveCredential() call, no re-entry anywhere.
export const credentialVault = pgTable("credential_vault", {
  id: uuid("id").defaultRandom().primaryKey(),
  whopUserId: text("whop_user_id").notNull(),
  // Scopes a saved credential to one workspace — added after workspaces
  // shipped (see workspaces table above). Before this column existed, a
  // vault row was reusable across every workspace a whopUserId owned,
  // which leaks a credential from Workspace A into the reuse picker for
  // an unrelated Workspace B. Every vault query now filters on this
  // instead of (or in addition to) whopUserId — see the backfill in
  // drizzle/migrations for how pre-existing rows were assigned to that
  // account's legacy workspace. whopUserId is kept alongside for audit
  // trail ("who created this") only, never used alone for access control
  // anymore.
  workspaceId: text("workspace_id").notNull().references(() => workspaces.workspaceId),
  provider: text("provider").notNull(),
  // Operator-chosen nickname so a picker showing "GoHighLevel" three times
  // over is actually useful — e.g. "Acme's GHL sub-account" vs "Widget Co
  // GHL sub-account". Required, not inferred, since there's no reliable
  // way to derive a meaningful name from an opaque API key.
  label: text("label").notNull(),
  refKey: text("ref_key").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  iv: text("iv").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  // Same health-check contract as credentials_refs — "unknown" until the
  // daily cron (or a manual "Test connection") has actually checked it.
  healthStatus: text("health_status").notNull().default("unknown"),
  lastCheckedAt: timestamp("last_checked_at"),
  lastCheckError: text("last_check_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Credentials Refs (encrypted value, not raw) ───────────────────────────
export const credentialsRefs = pgTable("credentials_refs", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  provider: text("provider").notNull(),
  refKey: text("ref_key").notNull(),       // secrets://acme/calendly_pat
  // Nullable as of credential_vault: a row with vaultId set stores its
  // secret in credential_vault instead, and these two columns are left
  // null — see resolveCredential() in src/lib/credentials.ts for the
  // "check vaultId first" resolution order this depends on. A row NOT
  // linked to the vault (the original, still-default behavior) keeps
  // storing its own encrypted value here exactly as before.
  encryptedValue: text("encrypted_value"), // AES-256-GCM encrypted
  iv: text("iv"),                          // initialization vector
  // Points at a shared credential_vault row instead of storing a value
  // locally. Set by "link this engagement to a saved credential" (the
  // reuse picker); cleared back to null the moment this engagement's
  // provider gets a fresh value typed in directly (typing a new key is an
  // explicit "stop sharing, use my own value from here" action, not a
  // silent overwrite of the shared credential).
  vaultId: uuid("vault_id").references(() => credentialVault.id),
  // Which CREDENTIAL_ENCRYPTION_KEY (or CREDENTIAL_ENCRYPTION_KEY_V<n> for
  // an older, rotated-out key) this row was encrypted with. Defaults to 1
  // for every row written before this column existed, which is correct —
  // CREDENTIAL_ENCRYPTION_KEY was implicitly "version 1" the whole time.
  // Lets the encryption key be rotated (new writes move to a new version,
  // old rows keep decrypting against the old key referenced by this column)
  // instead of a leaked/rotated key requiring every customer to re-enter
  // every credential. See src/lib/credentials.ts. Meaningless (left at its
  // default) on a vault-linked row — the vault row has its own.
  keyVersion: integer("key_version").notNull().default(1),
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
  // "run_failed" | "run_timed_out" | "credential_invalid" | "credential_check_error" | "report_delivery_failed" | "sequence_message_failed"
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
  // The actual Claude-generated opening paragraph for the first recovery
  // email (only set when sentVia === "hybrid"). Same fix as
  // pile_on_send_log.personalized_intro — previously generated, delivered,
  // and discarded.
  personalizedOpening: text("personalized_opening"),
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
  // The skillRuns row this send came from — one Pile-On run always
  // corresponds to exactly one booking, so this is a straight 1:1 lookup
  // for the run-detail page. Nullable because rows written before this
  // column existed have no run to backfill against.
  runId: uuid("run_id"),
  // "hybrid" | "fallback" — which path actually produced the Email 1 the
  // prospect received. See hybrid-personalizer.ts.
  sentVia: text("sent_via").notNull(),
  // The actual Claude-generated intro paragraph delivered to the
  // prospect's CRM profile (only set when sentVia === "hybrid").
  // Previously generated, delivered, and discarded — never queryable
  // again once delivery happened. This is what the AI Personalization
  // Preview on the run-detail page renders.
  personalizedIntro: text("personalized_intro"),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Every message past the first in a Win-Back or Pile-On cadence sends from
// a separate durable Inngest function (win-back-sms.ts, win-back-email-
// smtp.ts, pile-on-sms.ts) that runs hours-to-days after the original run
// completed — none of them wrote anything anywhere on send. Once the
// initial run showed "success," there was no way to tell whether message
// 3 of 5 actually went out or silently failed. This table is that missing
// record — append-only (a step-level retry writes another row rather than
// overwriting, so a flaky-then-recovered send is visible in the history,
// not just its final state), one row per attempt, both those functions'
// UI (win-back-view.tsx's calendar/list, pile-on-view.tsx's channel
// cards) can now query it directly instead of inferring status from
// whether the scheduled date/config has merely passed.
export const sequenceMessageLog = pgTable("sequence_message_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  // The skillRuns row that originally dispatched this sequence — threaded
  // through the *SequenceStart event payload so this table's rows can be
  // queried straight off run_id, same as pileOnSendLog/briefedCallsLog,
  // instead of needing to reverse-derive it from bookingId/enrollmentId.
  runId: uuid("run_id"),
  // "win_back_sms" | "win_back_email_smtp" | "pile_on_sms"
  sequenceType: text("sequence_type").notNull(),
  // winBackEnrollments.id for the two win-back senders; null for pile-on,
  // which has no enrollment table and correlates via bookingId instead.
  enrollmentId: text("enrollment_id"),
  bookingId: text("booking_id"),
  // The asset-map entry id (e.g. "sms_2", or a win-back email/SMS id) —
  // this is what a run's UI correlates against to know which specific
  // scheduled touchpoint this row is reporting on.
  messageId: text("message_id").notNull(),
  channel: text("channel").notNull(), // "sms" | "email"
  prospectEmail: text("prospect_email"),
  prospectPhone: text("prospect_phone"),
  status: text("status").notNull(), // "sent" | "failed"
  error: text("error"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
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

// ── Human Blockers (cross-cutting recovery gap 17) ────────────────────────
// The OG SKILL.md's principle: certain steps genuinely can't proceed
// without a human doing something outside this app entirely — recording a
// video, getting an A2P 10DLC campaign approved by a carrier, hiring an
// editor, granting a credential. Rather than a run failing outright or
// silently stalling, it creates a row here and pauses (see
// src/lib/human-blockers.ts's waitForBlockerResolution, built on
// Inngest's step.waitForEvent) until a human resolves it — at which point
// the exact same run resumes from where it left off, with whatever data
// the human provided.
export const humanBlockers = pgTable("human_blockers", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  skillName: text("skill_name").notNull(),
  runId: uuid("run_id"), // best-effort link back to skillRuns.id; not a FK since a blocker can outlive the run that raised it
  // "video_recording" | "a2p_10dlc_approval" | "editor_hire" |
  // "credential_grant" | "buyer_content_approval" | "other"
  blockerType: text("blocker_type").notNull(),
  description: text("description").notNull(),
  // "open" | "resolved" | "abandoned" — abandoned is set by a human, same
  // as resolved; there's no automatic timeout-to-abandoned sweep in this
  // pass (see the module comment in human-blockers.ts for why that's a
  // deliberate scope cut, not an oversight).
  status: text("status").notNull().default("open"),
  // The Inngest event name a paused step.waitForEvent() call is listening
  // for. Always "human_blocker.resolved" today (one shared event, filtered
  // by blockerId in the `if` expression) — stored per-row rather than
  // hardcoded so a future blocker type can use a different event without
  // a schema change.
  resumeEventName: text("resume_event_name").notNull().default("human_blocker.resolved"),
  // Whatever the human supplies on resolution (e.g. { videoUrl: "..." } or
  // { campaignApprovedAt: "..." }) — passed straight back into the
  // resumed step as the waitForEvent() return value.
  resumePayload: jsonb("resume_payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
});

// ── Pending Actions (cross-cutting recovery gap 22) ────────────────────────
// The generic approval-gate queue. See src/lib/approval-gate.ts. A row
// here means "this side-effectful action was requested but not yet
// executed because the engagement has require_approval_for_side_effects
// on." Approving via POST /api/actions/[id]/review re-derives fresh state
// from `payload` and actually runs the action; rejecting is a pure no-op.
export const pendingActions = pgTable("pending_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  // "webhook_enrollment" | "cohort_membership_add" |
  // "cohort_membership_remove" — see approval-gate.ts's PendingActionType
  // for the authoritative list and its executor map.
  actionType: text("action_type").notNull(),
  // Everything the deferred executor needs to re-run the action later,
  // e.g. { prospectEmail, bookingPayload } for webhook_enrollment. Never
  // includes decrypted credentials — the executor re-resolves those via
  // resolveCredential(engagementId, ...) at execution time, same
  // re-fetch-don't-ship pattern the rest of this codebase uses for
  // Inngest event payloads.
  payload: jsonb("payload").notNull(),
  // "pending" | "approved" | "rejected" | "execution_failed"
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
  decidedBy: text("decided_by"),
  executionError: text("execution_error"), // set only if status is execution_failed
});


//look back a step back older commit this is just my own reference dont mind it
// ── Engagement Skills (per-engagement skill enablement) ────────────────────
// Decouples "this client bought an agent bundle" from "this specific skill
// is turned on for them" — the prerequisite for a Skill Library where a
// client can run e.g. just leak-map without the rest of Showtime, and for
// a future agent marketplace where a bundle is just a named list of skill
// ids rather than a hardcoded branch in the dispatcher. See
// src/lib/skill-registry.ts. No row for a given (engagementId, skillId)
// pair means enabled — this table only ever needs to hold explicit
// disables, so every existing engagement (all skills on) needs zero rows
// and nothing changes for them until someone actually flips a toggle.
// ── Projects (client groupings with a default skill policy) ───────────────
// New for the Work/Engagements/Projects nav restructure. A project is a
// named group of engagements (clients) that share which skills should run
// for them by default — e.g. "just Leak Map + Win-Back, no Pre-Call Read"
// for a batch of clients that only want funnel monitoring. `enabledSkills`
// is the policy; membership is `projectEngagements` below. Adding an
// engagement to a project doesn't touch its data — it just writes explicit
// disabled rows into `engagementSkills` for whichever of the five skills
// aren't in the project's enabledSkills list (see src/lib/projects.ts),
// reusing the per-engagement enable/disable mechanism that already existed
// rather than adding a second, competing one. Soft-deleted the same way
// engagements are (deletedAt), for the same reason: history/audit trail
// (past runs, artifacts) referencing a project's members shouldn't vanish
// just because the grouping itself was removed.
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  whopUserId: text("whop_user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  // Subset of SKILLS ("pin-down" | "pile-on" | "pre-call-read" | "win-back"
  // | "leak-map"). Empty array is valid — a project with no default skills
  // enabled yet, configured per-client instead.
  enabledSkills: jsonb("enabled_skills").$type<string[]>().notNull().default([]),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const projectEngagements = pgTable(
  "project_engagements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.engagementId),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => ({
    projectEngagementUnique: uniqueIndex("project_engagement_unique").on(table.projectId, table.engagementId),
  })
);

export const engagementSkills = pgTable(
  "engagement_skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.engagementId),
    // Matches a key in SKILL_REGISTRY (src/lib/skill-registry.ts), e.g.
    // "pin-down", "pile-on", "pre-call-read", "win-back", "leak-map".
    skillId: text("skill_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    // Per-skill overrides, if a skill ever needs config beyond what
    // already lives on the engagement's stack. Unused by every skill today.
    config: jsonb("config"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    engagementSkillUnique: uniqueIndex("engagement_skill_unique").on(table.engagementId, table.skillId),
  })
);

// ── Show-Rate Features (recovery gap 25: predictive show-rate scoring) ────
// One row per scored call. Two jobs at once: (1) the features actually
// used to compute the score that shipped on that call's brief, kept for
// audit/debugging, and (2) — once `actualOutcome` is backfilled after the
// call happens — exactly the (features, label) pairs a real trained model
// would need. See show-rate-scorer.ts's module comment for why this pass
// ships the interpretable heuristic and this logging table, not a trained
// classifier.
export const showRateFeatures = pgTable("show_rate_features", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  bookingId: text("booking_id").notNull(),
  prospectEmail: text("prospect_email").notNull(),
  features: jsonb("features").$type<{
    personMatchScore?: number;
    leadTimeHours?: number;
    bookingHourLocal?: number;
    bookingDayOfWeek?: number;
    isConsumerEmailDomain?: boolean;
    priorNoShowCount?: number;
    priorShowCount?: number;
    emailEngagementScore?: number; // 0-1, from getProfileEngagement when available
    applicationCompletenessRatio?: number; // answered / total questions
  }>().notNull(),
  predictedShowProbability: integer("predicted_show_probability").notNull(), // 0-100, integer percentage
  modelVersion: text("model_version").notNull().default("heuristic-v1"),
  // Backfilled later by whatever marks a call's outcome — "showed" |
  // "no_show" | "rescheduled" | "cancelled" | null while still unknown.
  actualOutcome: text("actual_outcome"),
  outcomeRecordedAt: timestamp("outcome_recorded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Brief Outcome Log (Slack interactive brief buttons, Tier 4 #27) ───────
// One row per rep tap on a brief's Show/No-show/Rescheduled buttons. Feeds
// showRateFeatures.actualOutcome (see slack-interactions.ts) and gives
// Leak Map a real, human-confirmed outcome signal instead of only
// inferring from booking-platform disposition tags.
export const briefOutcomeLog = pgTable("brief_outcome_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  bookingId: text("booking_id").notNull(),
  prospectEmail: text("prospect_email"),
  outcome: text("outcome").notNull(), // "showed" | "no_show" | "rescheduled"
  loggedBySlackUserId: text("logged_by_slack_user_id"),
  // Win-Back no-show gap fix — which of the four resolution paths logged
  // this row: "dashboard" | "slack" | "recall_bot" | "auto_sweep". Null on
  // rows written before this column existed. Distinct from
  // loggedBySlackUserId (which only ever tells you "was this a Slack
  // click" for the pre-existing two sources) now that Recall bot
  // telemetry and the assumed-no-show sweep can log a row with no human
  // involved at all.
  source: text("source"),
  loggedAt: timestamp("logged_at").defaultNow().notNull(),
});

// ── Client Report Notes (report feature) ────────────────────────────────
// One row per (engagement, period type, period start) — caches the
// LLM-generated qualitative note for a given week/month so the report
// page/card doesn't re-call the model on every view, and so the *next*
// period's generation can be shown its own recent notes and told
// explicitly not to repeat their phrasing. metricsSnapshot is the exact
// structured-metrics object the note was generated from, kept for
// display next to the note and so a later re-generation (if metrics
// were recomputed) can tell whether anything actually changed.
export const clientReportNotes = pgTable(
  "client_report_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.engagementId),
    period: text("period").notNull(), // "week" | "month"
    periodKey: text("period_key").notNull(), // ISO date of period start, e.g. "2026-08-18"
    notesText: text("notes_text").notNull(),
    metricsSnapshot: jsonb("metrics_snapshot").notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (table) => ({
    engagementPeriodUnique: uniqueIndex("client_report_notes_engagement_period_uidx").on(
      table.engagementId,
      table.period,
      table.periodKey
    ),
  })
);

// ── Conversation Intelligence Sessions (recovery gap 24) ───────────────────
// One row per Recall.ai bot dispatched to a call. See
// src/lib/platforms/conversation-intelligence.ts. Deliberately scoped to
// Recall.ai only — see that file's header for why a generic multi-provider
// abstraction isn't what this pass builds.
export const conversationIntelligenceSessions = pgTable("conversation_intelligence_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),
  bookingId: text("booking_id").notNull(),
  recallBotId: text("recall_bot_id").notNull(),
  meetingUrl: text("meeting_url").notNull(),
  // "scheduled" | "joining" | "in_call" | "call_ended" | "done" | "failed"
  // — mirrors Recall's own bot.status_change vocabulary loosely; see the
  // adapter for the exact mapping. "call_ended" was added for the
  // no-show detection fix — it's the status Recall's own bot.call_ended
  // event reports, checked against docs.recall.ai's Bot Webhooks
  // reference, and is when subCode below gets set.
  status: text("status").notNull().default("scheduled"),
  // Win-Back no-show gap fix — Recall's call_ended sub_code, verified
  // against docs.recall.ai/docs/sub-codes. "timeout_exceeded_noone_joined"
  // and "timeout_exceeded_waiting_room" mean nobody showed; anything else
  // (call_ended_by_host, bot_kicked_from_call, etc.) means the bot was in
  // a live call with people. Stored verbatim, not re-interpreted here, so
  // an operator can see exactly what Recall reported when debugging a
  // disputed outcome. Null until a call_ended/fatal event arrives.
  subCode: text("sub_code"),
  transcriptId: text("transcript_id"),
  // Claude's structured extraction from the finished transcript — this is
  // what feeds back into topObjections, not the raw transcript itself
  // (which this app never stores; see the adapter's data-retention note).
  extractedObjections: jsonb("extracted_objections").$type<string[]>(),
  extractionSummary: text("extraction_summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ── Canary Runs (Tier 4 #28: synthetic canary tenant) ──────────────────────
// A dedicated, non-buyer-facing synthetic engagement (see
// src/lib/platforms/canary.ts) that a weekly cron runs a set of read-only
// checks against for every platform adapter this app ships, so an
// upstream platform API change surfaces as a dashboard alert within a
// week instead of as a buyer-reported incident. One row per weekly run
// per platform checked.
export const canaryRuns = pgTable("canary_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  platform: text("platform").notNull(),
  adapterMethod: text("adapter_method").notNull(), // e.g. "CalendlyClient.checkCredentialHealth"
  status: text("status").notNull(), // "ok" | "drift_detected" | "error"
  detail: text("detail"),
  latencyMs: integer("latency_ms"),
  runAt: timestamp("run_at").defaultNow().notNull(),
});

// ── Reputation Manager: Identity Graph ──────────────────────────────────────
// Ported from the OG Claude Skill Pack's counterclaim-intake skill
// (mcs/cms/skills/counterclaim-intake), which wrote this to the buyer's own
// filesystem as identity-graph.md + config/your-identity.yml. Showtime is a
// hosted multi-tenant app, not a buyer-run local system, so this is the one
// Postgres row that replaces both files — the rep-onboarding hinges panel
// IS the human-readable view the .md file used to be, and every downstream
// Reputation Manager skill reads this row instead of re-parsing YAML.
//
// Scoped to one row per engagement (rep_identity_graph_engagement_unique),
// same cardinality as Pin-Down's setup — Reputation Manager monitors each
// of the buyer's own clients' reputations as its own surface, not the
// Showtime operator's own brand, consistent with how every other skill in
// this app treats an engagement as one served client.
//
// What's deliberately NOT here: the full severity-scoring rubric and
// routing matrix from thresholds.yml.template. Per that template's own
// comment, "most operators leave this file unchanged at setup" — it's a
// shared set of defaults, not per-client config, so it lives as an
// application-level constant (REP_THRESHOLD_DEFAULTS) rather than being
// duplicated into every row here. crisisThresholdOverride below is the one
// value from that file worth letting a buyer tune per client.

/** One social/professional handle to bind as part of an identity — open
 * platform key set (x, linkedin, youtube, reddit, whop, ...) rather than a
 * fixed column per platform, since the source template explicitly allows
 * "add more platforms as needed." */
export type RepHandleMap = Record<string, string>;

/** A company, brand, product, or organization the engagement's client owns
 * or is publicly associated with. One entity per distinct reputation
 * surface — a solo founder with one company has one entity; a holding
 * company with multiple brands has several. */
export type RepEntity = {
  name: string;
  aliases: string[];
  type: "company" | "brand" | "product" | "service" | "publication";
  domainsOwned: string[];
  handles: RepHandleMap;
  highPriority: boolean;
};

/** A specific product, course, or offer sold by one of the entities above —
 * monitored as its own identity string even when the parent entity isn't
 * named in the mention. */
export type RepOffering = {
  name: string;
  aliases: string[];
  surfaces: string[]; // sales pages, landing pages, checkout URLs
  parentEntityName: string; // matches an entities[].name above
};

/** A competitor whose category-adjacent mentions get watched alongside the
 * client's own — deliberately opt-in and short (the source template's own
 * guidance: "the right list is the 3 to 7 competitors your prospects
 * compare you against," not every company in the category. */
export type RepCompetitor = {
  name: string;
  monitorFor: string[]; // e.g. "price comparisons", "feature compares", "negative content"
  highPriority: boolean;
};

/** A same-name collision: another person or company AI engines confuse
 * with this client. Every entry needs a disambiguation note — an empty
 * note defeats the whole point of the disambiguation work the schema/
 * Wikidata skill does downstream. */
export type RepCollision = {
  name: string;
  whoTheyAre: string;
  disambiguationNote: string;
};

export const repIdentityGraphs = pgTable(
  "rep_identity_graphs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.engagementId),

    // ── Operator (intake questions 1, 5-7 partial) ──────────────────────
    operatorName: text("operator_name").notNull(),
    operatorAliases: jsonb("operator_aliases").$type<string[]>().notNull().default([]),
    operatorHandles: jsonb("operator_handles").$type<RepHandleMap>().notNull().default({}),
    operatorDomains: jsonb("operator_domains").$type<string[]>().notNull().default([]),
    operatorEmailContacts: jsonb("operator_email_contacts").$type<string[]>().notNull().default([]),

    // ── Entities / offerings / competitors (questions 2-3, 6) ───────────
    entities: jsonb("entities").$type<RepEntity[]>().notNull().default([]),
    offerings: jsonb("offerings").$type<RepOffering[]>().notNull().default([]),
    competitors: jsonb("competitors").$type<RepCompetitor[]>().notNull().default([]),

    // ── Same-name collisions (question 4) ───────────────────────────────
    // Buyer-entered collisions from the interview, PLUS anything
    // runRepOnboarding's one-time web-search pass finds that the buyer
    // missed (each tagged source: "buyer" | "collision_check" — see
    // onboarding-service.ts) — never silently merged into operator/entity
    // data, since a collision is explicitly a DIFFERENT party.
    collisions: jsonb("collisions").$type<(RepCollision & { source: "buyer" | "collision_check" })[]>().notNull().default([]),

    // ── Trusted / adversarial sources ───────────────────────────────────
    trustedSources: jsonb("trusted_sources").$type<string[]>().notNull().default([]),
    // Starts empty by design (source template: "the Step 1 state is
    // correctly empty; do not invent adversaries") — populated over time
    // from real incidents by the crisis-response skill, not at intake.
    adversarialSources: jsonb("adversarial_sources").$type<string[]>().notNull().default([]),

    // ── Seed AI-engine prompts (question 8) ─────────────────────────────
    // The buyer's 5-8 starting prompts. Expanded to the locked 20-50
    // prompt panel by the ai-engine-panel skill (not yet built) — this
    // row only holds the seed, matching the source pack's own skill
    // boundary (intake seeds, ai-engine-panel locks the full panel).
    seedPanelPrompts: jsonb("seed_panel_prompts").$type<string[]>().notNull().default([]),

    // Per-client restriction of which platform-configured AI engines
    // rep-engine-panel checks the seed prompts against. Null (every row
    // before this field existed, and every row saved with all 5 engines
    // checked in the form) means "no restriction — check every engine
    // that's platform-configured." Only ever narrows a client down from
    // that set; it can't add an engine nobody's configured a model for
    // in the first place. See engine-panel-service.ts's runRepEnginePanel
    // and identity-graph-form.tsx's toIntakePayload for the two ends of
    // this field's null-means-all convention.
    activeEngines: jsonb("active_engines").$type<RepEngineId[] | null>(),

    // ── Sole authority (question 10) ────────────────────────────────────
    // The one person who can declare a crisis, approve a public response,
    // or stand down. Recorded, never defaulted — every engagement using
    // Reputation Manager confirms this explicitly at intake, and nothing
    // in this app or the skills built on top of this row is ever allowed
    // to auto-publish on the client's behalf regardless of this value.
    soleAuthorityName: text("sole_authority_name").notNull(),

    // Per-engagement override of REP_THRESHOLD_DEFAULTS.crisisScoreFloor
    // (shared default: 80). Null means "inherit the default" — see that
    // constant's own comment for why this is the one threshold value
    // worth tuning per client instead of centralizing.
    crisisThresholdOverride: integer("crisis_threshold_override"),

    // Set the first time runRepOnboarding's collision-detection web-search
    // pass actually runs, so re-saving this form from the hinges panel
    // doesn't re-trigger it on every edit — matches the source skill's
    // "push once" failure-mode guidance, not "push on every save."
    collisionCheckRunAt: timestamp("collision_check_run_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    repIdentityGraphEngagementUnique: uniqueIndex("rep_identity_graph_engagement_unique").on(table.engagementId),
  })
);

// ── Reputation Manager: AI-Engine Findings ──────────────────────────────────
// rep-engine-panel's own output. Scoped-down v1, not the OG skill pack's
// full 46-prompt/5-engine/twice-daily design (460 calls/day/client) —
// runs only the tripwire prompts already captured at intake
// (repIdentityGraphs.seedPanelPrompts) on a slower cadence, to prove the
// pipeline before committing to that volume. See rep-engine-panel's own
// manifest entry and engine-panel-service.ts for the reasoning.
//
// One row per (prompt x engine) per run — fine-grained on purpose, not
// batched into a single JSON blob per run, so a later "has this specific
// question's answer changed on this specific engine" trend query doesn't
// need to unpack a blob to answer it.
export type RepEngineId = "chatgpt" | "claude" | "perplexity" | "grok" | "gemini";
export type RepFindingSentiment = "positive" | "neutral" | "negative";

export const repEngineFindings = pgTable(
  "rep_engine_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.engagementId),

    engineId: text("engine_id").$type<RepEngineId>().notNull(),
    promptText: text("prompt_text").notNull(),
    responseText: text("response_text").notNull(),

    // Set by the single batch-scoring pass over a run's whole response
    // set (see engine-panel-service.ts) — not a separate LLM call per
    // response, which would double the call count for no real benefit at
    // this scale.
    sentiment: text("sentiment").$type<RepFindingSentiment>().notNull(),
    flagged: boolean("flagged").notNull().default(false),
    flagReason: text("flag_reason"),

    runAt: timestamp("run_at").defaultNow().notNull(),
  },
  (table) => ({
    repEngineFindingsEngagementIdx: index("rep_engine_findings_engagement_idx").on(table.engagementId, table.runAt),
  })
);

// ── Reputation Manager: Trustpilot Reviews ──────────────────────────────────
// rep-trustpilot-watch's own output. Trustpilot's official API requires a
// Trustpilot for Business account with API access, reportedly Enterprise-
// tier only (~$6k-$30k+/year) — confirmed by reading their own docs, not
// assumed. Sourced instead via Outscraper's own /trustpilot-reviews
// endpoint — one company, one maintained API, verified directly against
// their OpenAPI spec, not a marketplace of unverified third-party actors.
//
// Dedup mirrors webhookEvents' own pattern exactly: a unique constraint on
// (engagementId, externalReviewId) that a bulk onConflictDoNothing insert
// collides against, so re-polling a domain that already has 200 stored
// reviews only ever writes the genuinely new ones — same "no separate
// SELECT-then-filter step needed" reasoning as the booking webhook path.
export const repTrustpilotReviews = pgTable(
  "rep_trustpilot_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.engagementId),

    // Trustpilot's own review identifier (Outscraper's review_id field,
    // confirmed from their documented example response).
    externalReviewId: text("external_review_id").notNull(),
    reviewerName: text("reviewer_name"),
    rating: integer("rating").notNull(), // 1-5
    reviewText: text("review_text").notNull(),
    publishedAt: timestamp("published_at"),

    // Same scoring shape as repEngineFindings — one batch-scoring pass
    // over a run's new reviews, not a call per review.
    sentiment: text("sentiment").$type<RepFindingSentiment>().notNull(),
    flagged: boolean("flagged").notNull().default(false),
    flagReason: text("flag_reason"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    repTrustpilotReviewUnique: uniqueIndex("rep_trustpilot_review_unique").on(table.engagementId, table.externalReviewId),
    repTrustpilotReviewsEngagementIdx: index("rep_trustpilot_reviews_engagement_idx").on(table.engagementId, table.createdAt),
  })
);

// ── Reputation Manager: Reddit Mentions ─────────────────────────────────────
// rep-reddit-watch's own output. Reddit's official commercial API tier is
// reportedly ~$12,000/month minimum and requires written approval for
// exactly this use case (their own terms name "monitoring brand mentions"
// and "building a SaaS product" as needing it) — confirmed by reading
// their current developer terms, not assumed. Sourced instead via
// redditapis.com's search endpoints — verified directly against their own
// docs (both post search and comment search, since most mentions that
// matter happen in comment replies, not post titles).
//
// Same dedup shape as rep_trustpilot_reviews: unique constraint on
// (engagementId, externalMentionId) — Reddit's own item id, which
// redditapis.com's own FAQ confirms exists specifically for this
// "dedupe on the item id" purpose.
export const repRedditMentions = pgTable(
  "rep_reddit_mentions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.engagementId),

    externalMentionId: text("external_mention_id").notNull(), // Reddit's own item id
    subreddit: text("subreddit").notNull(),
    author: text("author"),
    permalink: text("permalink").notNull(),
    mentionText: text("mention_text").notNull(),
    publishedAt: timestamp("published_at"),

    sentiment: text("sentiment").$type<RepFindingSentiment>().notNull(),
    flagged: boolean("flagged").notNull().default(false),
    flagReason: text("flag_reason"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    repRedditMentionUnique: uniqueIndex("rep_reddit_mention_unique").on(table.engagementId, table.externalMentionId),
    repRedditMentionsEngagementIdx: index("rep_reddit_mentions_engagement_idx").on(table.engagementId, table.createdAt),
  })
);

// ── Reputation Manager: Incidents ───────────────────────────────────────────
// rep-crisis-response's own output — the last of the original 5-skill
// roadmap. Reads across everything the other three watch skills flagged
// since this skill's own last successful run for the engagement (derived
// from skillRuns, no separate tracking column needed — see
// crisis-response-service.ts), assesses cumulative severity with one LLM
// call, and declares an incident when that score crosses
// REP_THRESHOLD_DEFAULTS.crisisScoreFloor (rep-thresholds.ts — built
// early on, sitting unused until this skill).
//
// contributingFindings is a snapshot, not a set of foreign keys — the
// findings tables have no delete path today, but taking a point-in-time
// copy of what actually triggered this incident is still the more
// correct choice: an incident's record of "why this got declared" should
// never change even if something about the underlying finding rows ever
// does.
//
// Never a path to auto-publish anything. This table only ever records
// that a human was notified — see runRepCrisisResponse's own comment for
// why the notification goes to the workspace operator, not literally to
// soleAuthorityName as a delivery address.
export const repIncidents = pgTable("rep_incidents", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: text("engagement_id")
    .notNull()
    .references(() => engagements.engagementId),

  severityScore: integer("severity_score").notNull(), // 0-100 — max composite across contributing findings, see rep-thresholds.ts's SEVERITY_COMPOSITION_WEIGHTS
  summary: text("summary").notNull(), // the LLM's synthesis of what's actually happening, across every contributing finding
  contributingFindings: jsonb("contributing_findings").$type<
    {
      // "anomaly" is a synthetic entry anomaly-detection.ts produces when
      // a statistical spike/drop fires independent of any individual
      // flagged record — see crisis-response-service.ts.
      source: "engine_panel" | "trustpilot" | "reddit" | "anomaly";
      excerpt: string;
      flagReason: string | null;
      // Per-axis 1-10 scores and the resulting 0-100 composite (see
      // rep-thresholds.ts's SEVERITY_COMPOSITION_WEIGHTS/SEVERITY_AXIS_RUBRIC)
      // plus this finding's own signal-class classification, if any.
      // Optional: null on incidents declared before this scoring model —
      // never backfilled, same "snapshot of what triggered this at the
      // time" reasoning this column's own original comment already gives
      // for not using foreign keys.
      reach?: number;
      sentiment?: number;
      permanence?: number;
      compositeScore?: number;
      signalClass?: string | null;
    }[]
  >().notNull(),

  // Set when any contributing finding classified into one of
  // SIGNAL_CLASSES_FORCE_TRIGGER (rep-thresholds.ts) — this incident was
  // declared because of what it is, not because the composite score
  // crossed the engagement's threshold. Null means score-driven.
  signalClass: text("signal_class"),

  // "open" (declared, operator notified) | "acknowledged" (operator has
  // seen it — set by a future dashboard action, nothing writes this yet)
  // | "resolved" (set by a future dashboard action)
  status: text("status").notNull().default("open"),

  declaredAt: timestamp("declared_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
});

// ── Reputation Manager: Audit log ────────────────────────────────────────
// Ported from mcs/cms's audit-log-schema.md (Section 3.7 of the reputation
// system spec) — "the single source of truth for what the reputation
// system did." The original is a JSON-Lines file the buyer's own machine
// appends to (audit/events.jsonl); here it's a real table, since this
// product runs hosted rather than on the buyer's filesystem.
//
// The spec's eight event types (detection, draft, approval,
// external_action, outcome, compliance_block, ai_engine_notice,
// reflection) share four common fields and otherwise have entirely
// different shapes — kept as one generic `payload` jsonb column rather
// than eight column sets, discriminated by `eventType` at read time (see
// src/features/reputation-manager/server/audit-log.ts's typed
// RepAuditEventPayload union, which is what every write actually goes
// through — this table's shape is intentionally generic, the type safety
// lives in that file).
//
// The spec's per-type `event_id`-string chain references
// (triggered_by_event_id / draft_event_id / approval_event_id /
// action_event_id — always "the prior event in this chain") collapse into
// one `parentEventId` column here: same relationship every time, just
// named differently per hop in the original flat-file design where each
// type's own field needed a self-describing name. No FK constraint on it
// (or on engagementId->engagements pattern used elsewhere for jsonb
// snapshots) — same "it's a record of what happened, not a live
// relationship to keep in sync" reasoning repIncidents.contributingFindings
// already documents.
//
// Only "detection" has a real producer today (the three ingestion
// skills — rep-engine-panel, rep-trustpilot-watch, rep-reddit-watch — log
// one per scored mention, flagged or not). The other seven exist as a
// complete, typed data model for when draft/approval/publish/outcome
// flows actually exist — not speculative rows, just an honest reflection
// that this table's schema shouldn't need to change shape when they do.
export const repAuditEvents = pgTable(
  "rep_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.engagementId),

    eventType: text("event_type").notNull(),
    parentEventId: uuid("parent_event_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    schemaVersion: text("schema_version").notNull().default("1.0"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    repAuditEventsEngagementIdx: index("rep_audit_events_engagement_idx").on(table.engagementId, table.createdAt),
  })
);

// ── Chat threads (2026-08-30) ───────────────────────────────────────────
// Persistence for Teammates chat (src/app/api/teammates/chat/route.ts),
// which previously had none — the client resent full message history each
// turn and nothing survived a reload. A thread is either scoped to one
// engagement (buyer asked something about a specific client) or workspace-
// wide (engagementId null — reserved for cross-client threads like a
// future notify.ts "Ops" channel, not populated by anything yet).
// whopUserId is kept for audit trail only, same convention as
// credential_vault above — workspaceId is what every read path actually
// filters on.
export const chatThreads = pgTable(
  "chat_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.workspaceId),
    engagementId: text("engagement_id").references(() => engagements.engagementId),
    whopUserId: text("whop_user_id").notNull(),
    // Derived from the first user message (truncated), not an LLM call —
    // titling a thread doesn't need model reasoning and every extra call
    // here is pure cost for no real benefit, same reasoning this project
    // has applied everywhere else a deterministic answer is available.
    title: text("title").notNull(),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    chatThreadsWorkspaceLastMessageIdx: index("chat_threads_workspace_last_message_idx").on(table.workspaceId, table.lastMessageAt),
  })
);

// Mirrors ClaudeContentBlock from src/lib/llm.ts by convention. Not
// imported directly — schema.ts stays a leaf module with no app-logic
// imports, same as every other table here — so this is kept in sync by
// hand if that type ever changes shape.
export type ChatMessageContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | unknown; is_error?: boolean };

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id").notNull().references(() => chatThreads.id),
    role: text("role").notNull(), // "user" | "assistant"
    // "text" is a real turn shown as a chat bubble. "internal" covers the
    // two turns a tool round-trip needs but that were never a bubble in
    // the UI even before persistence existed: the assistant's tool_use
    // request, and the synthetic user-role turn carrying tool output back
    // (see the followUp construction in the chat route). Stored so
    // history reconstruction stays exact, never rendered.
    kind: text("kind").notNull().default("text"),
    // Exactly what's sent to/from callClaudeWithTools for this turn —
    // string for a plain text turn, ClaudeContentBlock[] for a turn
    // carrying tool_use or tool_result blocks. This, not displayText, is
    // the source of truth used to reconstruct conversation history on the
    // next turn.
    rawContent: jsonb("raw_content").$type<string | ChatMessageContentBlock[]>().notNull(),
    // Plain text for rendering a bubble. Null for kind="tool_result" rows
    // (nothing to show — the human-readable outcome is the *next*
    // assistant text turn, which already summarizes what happened).
    displayText: text("display_text"),
    // Per-tool-call outcome summary, same shape the UI already rendered
    // pre-persistence (route.ts's toolResults) — kept alongside
    // displayText rather than folded into it, so the checkmark/message
    // list under a bubble survives a reload exactly as it looked live.
    toolCalls: jsonb("tool_calls").$type<{ name: string; ok: boolean; message: string }[]>(),
    // Page links surfaced after a tool call succeeded — e.g. the run just
    // triggered, so the user can jump straight to it. Null when a turn
    // triggered nothing.
    links: jsonb("links").$type<{ label: string; href: string }[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    chatMessagesThreadCreatedIdx: index("chat_messages_thread_created_idx").on(table.threadId, table.createdAt),
  })
);