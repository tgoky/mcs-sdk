// src/lib/skill-settings/schema.ts
//
// Each skill's own settings, edited in place from Configure
// (components/skill-settings): the knobs that change how it behaves, and
// the tools it runs on. A tool is picked from its logo and connected right
// there (sign in, a saved account, or a key), with whatever else it needs
// (a Twilio number, a Slack channel, a webhook address to paste, a
// signing secret). Nothing a skill needs is left to another page.
//
// Every field names where it's stored and the default the running code
// uses when it's unset; saving a value equal to that default clears it, so
// "unset" keeps meaning "the default". Client-safe: no db imports.

import type { WorkerId } from "@/lib/worker-registry";
import { COLD_OPEN_SEND_TOOLS, SHOWTIME_TOOL_GROUPS, SKILL_TOOLS, type SetupTool } from "@/lib/showtime-setup/catalog";
import { TEMPLATE_IDS, TEMPLATE_META } from "@/features/pin-down/server/templates/types";
import { DEFAULT_CHECK_IN_MESSAGE } from "@/lib/at-risk";
import { DEFAULT_RECOVERY_MESSAGE } from "@/features/whop-agent/server/recovery-message";
import { DEFAULT_REVIEW_MESSAGE, DEFAULT_REVIEW_SUBJECT, DEFAULT_REVIEW_DELAY_HOURS } from "@/features/reputation-manager/server/review-request-message";

/** Where a value lives: the engagement's stack, Cold Open's config row,
 * Reputation Manager's identity graph, or a column on the engagement
 * itself. `path` may be nested ("a.b"). "none" is for rows that store
 * nothing of their own (a connection, an address to copy, a secret). */
export type SettingStore = "stack" | "coldOpen" | "rep" | "engagement" | "none";

/** One logo in a tool row. `tool` is what gets connected, null when the
 * choice has nothing to connect ("No texts", "A note in the CRM"). */
export interface ToolChoice {
  value: string;
  tool: SetupTool | null;
  /** Under the logo; the tool's own name when not given. */
  label?: string;
  /** For a choice without a tool: whose mark to draw, or a plain glyph. */
  logo?: string;
  icon?: "off" | "note" | "tag";
}

/** Addresses a client pastes into another tool, made per client. */
export type CopyId = "twilioReplyUrl" | "replyCatcherUrl" | "deliveryWebhookUrl" | "recallWebhookUrl";

interface FieldBase {
  store: SettingStore;
  path: string;
  label: string;
  help?: string;
  /** Shown only when another field has one of these values (and is shown itself). */
  showIf?: { path: string; equals: (string | number | boolean)[] };
  /** Can't be changed while another field has this value (and why). */
  lockedIf?: { path: string; equals: string | number | boolean; reason: string; value: string | number | boolean };
}

export type SettingField =
  | (FieldBase & { kind: "toggle"; default: boolean })
  | (FieldBase & {
      kind: "number";
      min: number;
      max: number;
      step?: number;
      /** Shown after the number, e.g. "%", "days". */
      unit?: string;
      /** Stored as a fraction, shown as a percent (0.08 is shown as 8). */
      percent?: boolean;
      /** Whole numbers only. */
      integer?: boolean;
      default: number | null;
    })
  | (FieldBase & {
      kind: "select";
      options: { value: string; label: string; hint?: string }[];
      /** Choices read for this client instead (the connected Slack's channels). */
      optionsFrom?: "slackChannels";
      numeric?: boolean;
      default: string | null;
    })
  | (FieldBase & {
      kind: "text";
      placeholder?: string;
      maxLength: number;
      format?: "url" | "email" | "timezone" | "phone";
      required?: boolean;
      default: string | null;
    })
  | (FieldBase & { kind: "textarea"; maxLength: number; tokens?: string[]; requiredTokens?: string[]; default: string | null })
  /** Several of a fixed or loaded list. `optionsFrom` loads them per client. */
  | (FieldBase & { kind: "multi"; options?: { value: string; label: string }[]; optionsFrom?: "coldOpenIcps"; allWhenEmpty?: boolean; default: string[] | null })
  /** A short list of phrases the client types. */
  | (FieldBase & { kind: "list"; maxItems: number; maxLength: number; placeholder?: string; default: string[] | null })
  /** The tool the skill runs on, as a row of logos; `multi` for several at once. */
  | (FieldBase & { kind: "tool"; choices: ToolChoice[]; multi?: boolean; default: string | string[] | null })
  /** A connection the skill needs, with nothing to choose. */
  | (FieldBase & { kind: "connect"; tools: SetupTool[]; default: null })
  /** One of a list read live from the connected account (stack-options). */
  | (FieldBase & {
      kind: "pick";
      resource: string;
      /** Query values the list needs, from other fields (Twilio's Account SID). */
      params?: Record<string, string>;
      /** The connection the list is read through. */
      needs: string;
      default: string | null;
    })
  /** An address to paste into another tool. Read only. */
  | (FieldBase & { kind: "copy"; from: CopyId; default: null })
  /** A secret that's saved but never shown back (a webhook signing secret). */
  | (FieldBase & { kind: "secret"; secret: { credential: string } | { signing: "recall" }; placeholder?: string; default: null })
  /** One choice per key: a campaign for each Cold Open customer type. */
  | (FieldBase & { kind: "map"; keysFrom: "coldOpenIcps"; optionsFrom: "coldOpenCampaigns"; default: null });

export type SettingValue = string | number | boolean | string[] | Record<string, string> | null;
export type SettingValues = Record<string, SettingValue>;

export interface SkillSettingsSpec {
  fields: SettingField[];
  /** Rules across fields; a message when the values don't go together. */
  check?: (values: SettingValues) => string | null;
}

const hours = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}` }));
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => ({ value: String(i), label: d }));
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
// 1-28 only: every month has them, so a deep-dive is never skipped.
const monthDays = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `The ${ordinal(i + 1)}` }));

// ── Tools ────────────────────────────────────────────────────────────────

const groupTools = (id: "booking" | "email" | "hosting") => SHOWTIME_TOOL_GROUPS.find((g) => g.id === id)!.tools;
const skillTool = (provider: string) => SKILL_TOOLS.find((t) => t.provider === provider)!;
const emailTool = (provider: string) => groupTools("email").find((t) => t.provider === provider)!;
const choices = (tools: SetupTool[]): ToolChoice[] => tools.map((t) => ({ value: t.provider, tool: t }));

/** Changing one of these sets Showtime up again (webhooks, the page). */
export const SHOWTIME_CORE_TOOLS = ["booking_platform", "email_platform", "hosting_platform"] as const;
const CORE_NOTE = "Every Showtime skill uses this. Saving a different one sets Showtime up again with it.";

const BOOKING_TOOL: SettingField = { kind: "tool", store: "stack", path: "booking_platform", label: "Bookings from", help: CORE_NOTE, choices: choices(groupTools("booking")), default: null };
const EMAIL_TOOL: SettingField = { kind: "tool", store: "stack", path: "email_platform", label: "Emails through", help: CORE_NOTE, choices: choices(groupTools("email")), default: null };
const HOSTING_TOOL: SettingField = { kind: "tool", store: "stack", path: "hosting_platform", label: "Confirmation page on", help: CORE_NOTE, choices: choices(groupTools("hosting")), default: null };

const TEXTING = ["twilio", "ghl_sms"];
const SMS_TOOL: SettingField = {
  kind: "tool",
  store: "stack",
  path: "sms_platform",
  label: "Texts through",
  help: "Used by every Showtime skill that texts.",
  choices: [
    { value: "twilio", tool: skillTool("twilio") },
    { value: "ghl_sms", tool: emailTool("ghl"), label: "GoHighLevel" },
    { value: "hubspot_sms", tool: emailTool("hubspot"), label: "HubSpot" },
    { value: "none", tool: null, label: "No texts", icon: "off" },
  ],
  default: null,
};
const onTwilio = { path: "sms_platform", equals: ["twilio"] };
const TWILIO_FIELDS: SettingField[] = [
  { kind: "text", store: "stack", path: "sms_platform_meta.twilio_account_sid", label: "Twilio Account SID", placeholder: "Starts with AC", maxLength: 64, default: null, showIf: onTwilio, help: "On the Twilio Console home, beside the Auth Token." },
  {
    kind: "pick",
    store: "stack",
    path: "sms_platform_meta.twilio_messaging_service_sid",
    label: "Messaging Service",
    resource: "twilio-messaging-services",
    params: { accountSid: "sms_platform_meta.twilio_account_sid" },
    needs: "twilio",
    default: null,
    showIf: onTwilio,
    help: "Texts go out from its numbers, and its A2P registration is checked before anything sends.",
  },
  {
    kind: "pick",
    store: "stack",
    path: "sms_platform_meta.twilio_from_number",
    label: "Or send from one number",
    resource: "twilio-phone-numbers",
    params: { accountSid: "sms_platform_meta.twilio_account_sid" },
    needs: "twilio",
    default: null,
    showIf: onTwilio,
  },
  {
    kind: "copy",
    store: "none",
    path: "copy:twilioReplyUrl",
    label: "Replies come back to",
    from: "twilioReplyUrl",
    default: null,
    showIf: onTwilio,
    help: "In Twilio, set \"A message comes in\" on the Messaging Service (or number) to this address. STOP ends every text to that person; other replies land in the Queue.",
  },
];

const SLACK = skillTool("slack");
const slackFields = (showIf: FieldBase["showIf"]): SettingField[] => [
  { kind: "connect", store: "none", path: "connect:slack", label: "Slack", tools: [SLACK], default: null, showIf },
  { kind: "select", store: "stack", path: "slack_channel_id", label: "Channel", options: [], optionsFrom: "slackChannels", default: null, showIf, help: "Invite the Slack app to the channel. Channels show once Slack is connected." },
  { kind: "text", store: "stack", path: "slack_webhook_url", label: "Or post through an incoming webhook", format: "url", maxLength: 500, placeholder: "https://hooks.slack.com/services/…", default: null, showIf, help: "Keeps the Approve and Reject buttons on each post." },
];

const RECALL_REGIONS = [
  { value: "us-east-1", label: "US East" },
  { value: "us-west-2", label: "US West" },
  { value: "eu-central-1", label: "EU Central" },
  { value: "ap-northeast-1", label: "Asia Pacific (Northeast)" },
];
const onRecall = { path: "conversation_intelligence_provider", equals: ["recall_ai"] };
const DELIVERY_EMAIL = ["klaviyo", "activecampaign", "mailchimp", "convertkit"];

/** Cold Open's sending tool. Values are Cold Open's platform ids. */
const SEND_TOOL: SettingField = {
  kind: "tool",
  store: "coldOpen",
  path: "sendPlatform.platform",
  label: "Sending tool",
  help: "Where the emails go out. A different tool needs its campaigns picked again.",
  choices: COLD_OPEN_SEND_TOOLS.map((t) => ({ value: t.provider.replace(/^cold_open_/, ""), tool: t })),
  default: null,
};

export const SKILL_SETTINGS: Partial<Record<WorkerId, SkillSettingsSpec>> = {
  // ── Showtime ───────────────────────────────────────────────────────────
  "pin-down": {
    fields: [
      BOOKING_TOOL,
      EMAIL_TOOL,
      HOSTING_TOOL,
      {
        kind: "select",
        store: "engagement",
        path: "confirmationPageTemplate",
        label: "Page design",
        options: TEMPLATE_IDS.map((id) => ({ value: id, label: TEMPLATE_META[id].name, hint: TEMPLATE_META[id].bestFor })),
        default: "contract",
      },
      { kind: "text", store: "engagement", path: "heroVideoUrl", label: "Video at the top", format: "url", maxLength: 500, placeholder: "A YouTube, Vimeo or Loom link", default: null },
      { kind: "toggle", store: "engagement", path: "offerDetails.hybrid_mode_enabled", label: "Personal intro", help: "An AI-written opening paragraph for each booker.", default: false },
      { kind: "toggle", store: "engagement", path: "confirmationPageAnimationsEnabled", label: "Animations", help: "Sections fade in as the page loads.", default: false },
      { kind: "text", store: "engagement", path: "prospectMeets", label: "Who runs the calls", maxLength: 120, placeholder: "The founder, or a closer named Sam", default: null },
      { kind: "list", store: "engagement", path: "topCallQuestions", label: "Questions prospects ask on calls", maxItems: 10, maxLength: 200, default: null },
      { kind: "list", store: "engagement", path: "topObjections", label: "What makes prospects hesitate", maxItems: 10, maxLength: 200, default: null },
      { kind: "textarea", store: "engagement", path: "rawVoiceCorpus", label: "Brand voice", help: "Copy that sounds like the client. Scripts and briefs are written to match it.", maxLength: 20000, default: null },
    ],
  },
  "pile-on": {
    fields: [
      SMS_TOOL,
      ...TWILIO_FIELDS,
      { kind: "toggle", store: "stack", path: "at_risk_check_in", label: "Check in with at-risk calls", help: "One extra text 3 hours before a call whose estimated show chance is low. Replies come back like any text: YES confirms, a new time lands in the Queue.", default: false, showIf: { path: "sms_platform", equals: TEXTING } },
      { kind: "number", store: "stack", path: "at_risk_threshold", label: "At risk under", unit: "%", min: 10, max: 90, step: 5, integer: true, default: 50, showIf: { path: "at_risk_check_in", equals: [true] } },
      { kind: "textarea", store: "stack", path: "at_risk_check_in_message", label: "Check-in text", maxLength: 320, tokens: ["{name}", "{time}"], default: DEFAULT_CHECK_IN_MESSAGE, showIf: { path: "at_risk_check_in", equals: [true] } },
      {
        kind: "select",
        store: "stack",
        path: "reminder_holdout_percent",
        label: "Holdout",
        help: "A small random share of bookings gets no reminder texts, to prove what reminders are worth on this client's own calls.",
        showIf: { path: "sms_platform", equals: TEXTING },
        numeric: true,
        options: [
          { value: "0", label: "Remind everyone" },
          { value: "10", label: "Hold out 10%" },
        ],
        default: "0",
      },
      {
        kind: "select",
        store: "stack",
        path: "sms_compliance_footer_variant",
        label: "Opt-out line on texts",
        showIf: { path: "sms_platform", equals: TEXTING },
        options: [
          { value: "standard", label: "Standard (Reply STOP to opt out)" },
          { value: "custom", label: "Your own wording" },
        ],
        default: "standard",
      },
      { kind: "text", store: "stack", path: "sms_compliance_footer_custom", label: "Your opt-out line", maxLength: 120, placeholder: "Text STOP to stop these messages", default: null, showIf: { path: "sms_compliance_footer_variant", equals: ["custom"] } },
      {
        kind: "tool",
        store: "stack",
        path: "ad_data_platform",
        label: "Ad audiences",
        help: "Booked leads are added to an audience your ads can target or exclude.",
        choices: [
          { value: "hyros", tool: skillTool("hyros") },
          { value: "google_sheets", tool: skillTool("google_sheets") },
          { value: "native_crm", tool: null, label: "Tag in the CRM", icon: "tag" },
          { value: "none", tool: null, label: "Don't sync", icon: "off" },
        ],
        default: null,
      },
      {
        kind: "pick",
        store: "stack",
        path: "ad_data_platform_meta.google_sheets_spreadsheet_id",
        label: "Spreadsheet",
        resource: "google-sheets-spreadsheets",
        needs: "google_sheets",
        default: null,
        showIf: { path: "ad_data_platform", equals: ["google_sheets"] },
      },
      {
        kind: "pick",
        store: "stack",
        path: "ad_data_platform_meta.google_sheets_cohort_sheet_name",
        label: "Tab",
        resource: "google-sheets-tabs",
        params: { spreadsheetId: "ad_data_platform_meta.google_sheets_spreadsheet_id" },
        needs: "google_sheets",
        default: null,
        showIf: { path: "ad_data_platform", equals: ["google_sheets"] },
      },
    ],
    check: (v) =>
      v.sms_compliance_footer_variant === "custom" && !(typeof v.sms_compliance_footer_custom === "string" && /stop/i.test(v.sms_compliance_footer_custom))
        ? "Your opt-out line has to tell people how to stop (mention STOP)."
        : null,
  },
  "win-back": {
    fields: [
      EMAIL_TOOL,
      SMS_TOOL,
      ...TWILIO_FIELDS,
      {
        kind: "select",
        store: "stack",
        path: "recovery_window_days",
        label: "Keep trying for",
        numeric: true,
        options: [14, 21, 30, 45, 60].map((d) => ({ value: String(d), label: `${d} days` })),
        default: "30",
      },
      {
        kind: "select",
        store: "stack",
        path: "daily_send_tolerance",
        label: "Most touches a day",
        numeric: true,
        options: [
          { value: "1", label: "One (email or text)" },
          { value: "2", label: "Two (email and text the same day)" },
        ],
        default: "2",
      },
      {
        kind: "select",
        store: "stack",
        path: "reschedule_mode",
        label: "Rebooking link",
        options: [
          { value: "time_slots", label: "Open times to pick from" },
          { value: "fresh_link", label: "The booking tool's own reschedule link" },
        ],
        default: "time_slots",
      },
      { kind: "toggle", store: "stack", path: "recovered_from_no_show_tagging_enabled", label: "Tag people who rebook", help: "Marks them in the email tool as recovered from a no-show.", default: true },
      { kind: "number", store: "stack", path: "win_back_bounce_rate_threshold", label: "Pause if bounces pass", unit: "%", percent: true, min: 1, max: 20, step: 0.5, default: 0.05 },
      { kind: "number", store: "stack", path: "win_back_complaint_rate_threshold", label: "Pause if spam complaints pass", unit: "%", percent: true, min: 0.05, max: 1, step: 0.05, default: 0.001 },
      { kind: "number", store: "stack", path: "win_back_delivery_sample_minimum", label: "Only judge after", unit: "emails", min: 5, max: 500, integer: true, default: 20 },
      {
        kind: "copy",
        store: "none",
        path: "copy:deliveryWebhookUrl",
        label: "Bounce and complaint webhook",
        from: "deliveryWebhookUrl",
        default: null,
        showIf: { path: "email_platform", equals: DELIVERY_EMAIL },
        help: "Add this address as a webhook in the email tool, so bounces and complaints are counted and sending pauses on its own.",
      },
      { kind: "secret", store: "none", path: "secret:klaviyo", label: "Klaviyo webhook secret", secret: { credential: "klaviyo_webhook_secret" }, default: null, showIf: { path: "email_platform", equals: ["klaviyo"] } },
      { kind: "secret", store: "none", path: "secret:mailchimp", label: "Your own secret on the address (optional)", secret: { credential: "mailchimp_webhook_secret" }, default: null, showIf: { path: "email_platform", equals: ["mailchimp"] }, help: "The address already carries this client's token. To add your own too, append &secret= and it to the address in Mailchimp, and save the same value here." },
      { kind: "secret", store: "none", path: "secret:activecampaign", label: "ActiveCampaign webhook secret", secret: { credential: "activecampaign_webhook_secret" }, default: null, showIf: { path: "email_platform", equals: ["activecampaign"] } },
      { kind: "text", store: "stack", path: "activecampaign_webhook_signature_header", label: "Signature header name", placeholder: "The header you marked as the signature", maxLength: 100, default: null, showIf: { path: "email_platform", equals: ["activecampaign"] } },
      {
        kind: "select",
        store: "stack",
        path: "inbound_reply_mode",
        label: "When someone replies",
        options: [
          { value: "none", label: "Keep going", hint: "Only a rebooking or the window ending stops the sequence." },
          { value: "forwarding", label: "Stop, from forwarded replies", hint: "Point an inbound-parse service (Postmark, SendGrid) at the address below." },
          { value: "native", label: "Stop, from HubSpot Conversations", hint: "Needs HubSpot as the email tool." },
        ],
        default: "none",
      },
      { kind: "copy", store: "none", path: "copy:replyCatcherUrl", label: "Forward replies to", from: "replyCatcherUrl", default: null, showIf: { path: "inbound_reply_mode", equals: ["forwarding"] } },
      { kind: "text", store: "stack", path: "hubspot_portal_id", label: "HubSpot account ID", placeholder: "12345678", maxLength: 20, default: null, showIf: { path: "inbound_reply_mode", equals: ["native"] }, help: "Read from HubSpot when it's connected; otherwise under Settings, Account Setup, Account Defaults." },
    ],
    check: (v) =>
      v.inbound_reply_mode === "native" && v.email_platform !== "hubspot"
        ? "HubSpot Conversations needs HubSpot as the email tool."
        : v.inbound_reply_mode === "native" && !(typeof v.hubspot_portal_id === "string" && v.hubspot_portal_id.trim())
          ? "Add the HubSpot account ID, so replies can be matched."
          : null,
  },
  "pre-call-read": {
    fields: [
      {
        kind: "tool",
        store: "stack",
        path: "brief_landing_destination",
        label: "Briefs land in",
        choices: [
          { value: "slack", tool: SLACK },
          { value: "crm_note", tool: null, label: "CRM note", icon: "note" },
        ],
        default: null,
      },
      ...slackFields({ path: "brief_landing_destination", equals: ["slack"] }),
      {
        kind: "select",
        store: "stack",
        path: "brief_trigger_type",
        label: "When briefs are written",
        options: [
          { value: "nightly", label: "The night before" },
          { value: "dynamic_webhook", label: "A set time before each call" },
        ],
        default: "nightly",
      },
      { kind: "number", store: "stack", path: "brief_lead_time_hours", label: "How long before the call", unit: "hours", min: 1, max: 48, integer: true, default: 12, showIf: { path: "brief_trigger_type", equals: ["dynamic_webhook"] } },
      { kind: "number", store: "stack", path: "person_match_confidence_threshold", label: "Research only when the person matches at least", unit: "/100", min: 0, max: 100, integer: true, default: 70, help: "How sure the brief must be it found the right person before it adds research about them." },
      {
        kind: "toggle",
        store: "stack",
        path: "show_rate_scoring_enabled",
        label: "Estimate each call's show chance",
        help: "From booking signals (earlier no-shows, lead time, time of day in the client's time zone). Not yet trained on this client's calls. Calls under 50% are marked at risk on the calendar.",
        default: false,
        lockedIf: { path: "at_risk_check_in", equals: true, value: true, reason: "On while Pile-On checks in with at-risk calls, which need it." },
      },
      {
        kind: "tool",
        store: "stack",
        path: "prospect_research_sources_used",
        label: "Research from",
        help: "The public web always. Add one of these only if the client already pays for it.",
        multi: true,
        choices: [
          { value: "apollo", tool: skillTool("apollo") },
          { value: "pdl", tool: skillTool("pdl") },
        ],
        default: null,
      },
      {
        kind: "tool",
        store: "stack",
        path: "conversation_intelligence_provider",
        label: "Calls recorded by",
        choices: [
          { value: "recall_ai", tool: skillTool("recall_ai") },
          { value: "none", tool: null, label: "Not recorded", icon: "off" },
        ],
        default: null,
      },
      { kind: "select", store: "stack", path: "conversation_intelligence_meta.recall_region", label: "Recall region", options: RECALL_REGIONS, default: null, showIf: onRecall, help: "Must match the region in this client's Recall.ai dashboard." },
      { kind: "text", store: "stack", path: "conversation_intelligence_meta.recall_bot_name", label: "Notetaker's name", placeholder: "Notetaker", maxLength: 60, default: null, showIf: onRecall },
      { kind: "copy", store: "none", path: "copy:recallWebhookUrl", label: "Recall webhook address", from: "recallWebhookUrl", default: null, showIf: onRecall, help: "In Recall.ai → Webhooks, point a webhook here, then paste its signing secret below." },
      { kind: "secret", store: "none", path: "secret:recall", label: "Recall webhook signing secret", secret: { signing: "recall" }, default: null, showIf: onRecall },
      {
        kind: "tool",
        store: "stack",
        path: "video_engagement_platform",
        label: "Video watch data from",
        choices: [
          { value: "vidalytics", tool: skillTool("vidalytics") },
          { value: "wistia", tool: skillTool("wistia") },
          { value: "youtube_analytics", tool: skillTool("youtube_analytics") },
          { value: "loom", tool: null, label: "Loom", logo: "loom" },
          { value: "none", tool: null, label: "None", icon: "off" },
        ],
        default: null,
      },
      { kind: "text", store: "stack", path: "hero_video_id", label: "Video ID", maxLength: 100, default: null, showIf: { path: "video_engagement_platform", equals: ["vidalytics", "youtube_analytics"] } },
      { kind: "text", store: "stack", path: "video_engagement_meta.wistia_video_id", label: "Wistia video ID", maxLength: 100, default: null, showIf: { path: "video_engagement_platform", equals: ["wistia"] } },
      { kind: "text", store: "stack", path: "video_engagement_meta.youtube_channel_id", label: "YouTube channel ID", maxLength: 100, default: null, showIf: { path: "video_engagement_platform", equals: ["youtube_analytics"] } },
    ],
  },
  "leak-map": {
    fields: [
      { kind: "select", store: "stack", path: "weekly_summary_schedule.dayOfWeek", label: "Weekly summary on", options: weekdays, numeric: true, default: "1" },
      { kind: "select", store: "stack", path: "monthly_deep_dive_schedule.dayOfMonth", label: "Monthly deep-dive on", options: monthDays, numeric: true, default: "1" },
      { kind: "select", store: "stack", path: "weekly_summary_schedule.hourLocal", label: "At", options: hours, numeric: true, default: "9" },
      { kind: "text", store: "stack", path: "weekly_summary_schedule.timezone", label: "Time zone", format: "timezone", maxLength: 64, placeholder: "America/New_York", default: null },
      {
        kind: "select",
        store: "stack",
        path: "audit_output_format",
        label: "Send the report",
        options: [
          { value: "dashboard_only", label: "Only on the dashboard" },
          { value: "email", label: "By email" },
          { value: "slack", label: "To Slack" },
        ],
        default: "dashboard_only",
      },
      { kind: "text", store: "stack", path: "leak_map_report_email", label: "Email it to", format: "email", maxLength: 254, required: true, default: null, showIf: { path: "audit_output_format", equals: ["email"] } },
      ...slackFields({ path: "audit_output_format", equals: ["slack"] }),
      { kind: "number", store: "stack", path: "sample_size_minimum", label: "Trust a number only after", unit: "calls", min: 1, max: 200, integer: true, default: 5 },
      { kind: "number", store: "stack", path: "aging_threshold_days", label: "Deals count as stuck after", unit: "days", min: 1, max: 365, integer: true, default: 30 },
    ],
  },

  // ── Reputation Manager ─────────────────────────────────────────────────
  "rep-engine-panel": {
    fields: [
      {
        kind: "multi",
        store: "rep",
        path: "activeEngines",
        label: "AI engines to ask",
        options: [
          { value: "chatgpt", label: "ChatGPT" },
          { value: "claude", label: "Claude" },
          { value: "perplexity", label: "Perplexity" },
          { value: "grok", label: "Grok" },
          { value: "gemini", label: "Gemini" },
        ],
        allWhenEmpty: true,
        default: null,
      },
      { kind: "list", store: "rep", path: "seedPanelPrompts", label: "Questions to ask them", maxItems: 12, maxLength: 200, placeholder: "Is Acme legit?", default: null },
    ],
  },
  "rep-crisis-response": {
    fields: [
      { kind: "text", store: "rep", path: "soleAuthorityName", label: "Who decides on a response", required: true, maxLength: 120, default: null, help: "The one person paged in a crisis. Nothing is ever posted on the client's behalf." },
      { kind: "text", store: "rep", path: "operatorPagePhone", label: "Text them at", format: "phone", maxLength: 32, placeholder: "+15551234567", default: null },
      { kind: "number", store: "rep", path: "crisisThresholdOverride", label: "Page at severity", unit: "/100", min: 20, max: 100, integer: true, default: 80 },
    ],
  },
  "rep-review-requests": {
    fields: [
      { kind: "text", store: "stack", path: "rep_review_link", label: "Review link", format: "url", maxLength: 500, placeholder: "https://g.page/r/…/review", default: null, help: "In Google Business Profile, choose Ask for reviews and copy the link. Nothing is sent until one is saved." },
      { kind: "textarea", store: "stack", path: "rep_review_request_message", label: "Message", maxLength: 600, tokens: ["{name}", "{link}"], requiredTokens: ["{link}"], default: DEFAULT_REVIEW_MESSAGE },
      { kind: "text", store: "stack", path: "rep_review_request_subject", label: "Email subject", maxLength: 150, default: DEFAULT_REVIEW_SUBJECT },
      { kind: "number", store: "stack", path: "rep_review_request_delay_hours", label: "Ask after", unit: "hours", min: 0, max: 168, integer: true, default: DEFAULT_REVIEW_DELAY_HOURS },
      {
        kind: "select",
        store: "stack",
        path: "rep_review_request_channel",
        label: "Try first",
        options: [
          { value: "email", label: "Email" },
          { value: "sms", label: "Text" },
        ],
        default: "email",
      },
      { kind: "connect", store: "none", path: "connect:smtp", label: "Emails through", tools: [emailTool("smtp")], default: null, help: "Your own mail server, or Resend. Requests go out from the client's address." },
      SMS_TOOL,
      ...TWILIO_FIELDS,
    ],
  },

  // ── Cold Open ──────────────────────────────────────────────────────────
  "daily-send": {
    fields: [
      SEND_TOOL,
      { kind: "toggle", store: "coldOpen", path: "dailySendSettings.liveSendEnabled", label: "Send for real", help: "Off, each run only shows what it would push.", default: false },
      { kind: "number", store: "coldOpen", path: "dailySendSettings.volume", label: "Leads a day", min: 1, max: 500, integer: true, default: 25 },
      { kind: "select", store: "coldOpen", path: "dailySendSettings.localHour", label: "At", options: hours, numeric: true, default: "9" },
      { kind: "text", store: "coldOpen", path: "dailySendSettings.timezone", label: "Time zone", format: "timezone", maxLength: 64, placeholder: "America/New_York", default: null },
      {
        kind: "select",
        store: "coldOpen",
        path: "dailySendSettings.copyMode",
        label: "Email copy",
        options: [
          { value: "generate", label: "Written for each lead" },
          { value: "upload", label: "From the variants you uploaded" },
        ],
        default: "generate",
      },
    ],
  },
  "send-connect": {
    fields: [
      SEND_TOOL,
      { kind: "map", store: "coldOpen", path: "campaignMap", label: "Campaign for each customer type", keysFrom: "coldOpenIcps", optionsFrom: "coldOpenCampaigns", default: null, help: "Leads go into this campaign in the sending tool." },
      { kind: "multi", store: "coldOpen", path: "autoPushIcps", label: "Push without review", optionsFrom: "coldOpenIcps", help: "Leads for these customer types go straight to the sending tool, even if they're marked for review.", default: null },
    ],
  },
  "icp-lock": {
    fields: [
      { kind: "multi", store: "coldOpen", path: "reviewRequiredIcps", label: "Hold for review", optionsFrom: "coldOpenIcps", help: "Leads for these customer types wait in the Queue before they're pushed.", default: null },
      { kind: "toggle", store: "coldOpen", path: "trackingDefaults.openTracking", label: "Track opens", default: true },
      { kind: "toggle", store: "coldOpen", path: "trackingDefaults.linkTracking", label: "Track link clicks", default: true },
    ],
  },
  "voice-capture": {
    fields: [
      { kind: "text", store: "coldOpen", path: "voiceProfile.greeting", label: "Greeting", maxLength: 80, placeholder: "Hi {first_name},", default: null },
      { kind: "text", store: "coldOpen", path: "voiceProfile.signOff", label: "Sign-off", maxLength: 120, placeholder: "Cheers, Sam", default: null },
      { kind: "text", store: "coldOpen", path: "voiceProfile.tone", label: "Tone", maxLength: 200, placeholder: "Direct, warm, no jargon", default: null },
    ],
  },
  "send-report": {
    fields: [{ kind: "number", store: "coldOpen", path: "reportWindowDays", label: "Report covers the last", unit: "days", min: 1, max: 90, integer: true, default: 7 }],
  },

  // ── Whop Agent ─────────────────────────────────────────────────────────
  "whop-cancellation-save-offer": {
    fields: [
      { kind: "number", store: "stack", path: "whop_save_offer_discount_percentage", label: "Discount", unit: "% off", min: 1, max: 100, integer: true, default: null },
      { kind: "number", store: "stack", path: "whop_save_offer_duration_months", label: "For", unit: "months", min: 1, max: 36, integer: true, default: null },
      { kind: "textarea", store: "stack", path: "whop_save_offer_message", label: "What members see", maxLength: 1000, tokens: ["{discount}", "{months}"], default: null },
      { kind: "number", store: "stack", path: "whop_save_offer_min_tenure_days", label: "Only members of at least", unit: "days", min: 0, max: 3650, integer: true, default: 30 },
      { kind: "number", store: "stack", path: "whop_save_offer_cooldown_days", label: "At most once every", unit: "days", min: 0, max: 3650, integer: true, default: 90 },
    ],
    check: (v) => {
      const parts = [v.whop_save_offer_discount_percentage, v.whop_save_offer_duration_months, v.whop_save_offer_message].map((x) => x !== null && x !== undefined && x !== "");
      return parts.some(Boolean) && !parts.every(Boolean) ? "Set the discount, the length and the message together, or leave all three empty. We never pick an offer for you." : null;
    },
  },
  "whop-refund-dispute-velocity": {
    fields: [
      { kind: "number", store: "stack", path: "refund_dispute_rate_threshold", label: "Warn when a week's refunds pass", unit: "% of payments", percent: true, min: 1, max: 50, step: 0.5, default: 0.08 },
      { kind: "number", store: "stack", path: "dispute_rate_threshold", label: "Warn when disputes pass", unit: "% of payments", percent: true, min: 0.1, max: 5, step: 0.05, default: 0.0075 },
      { kind: "number", store: "stack", path: "dispute_alert_threshold", label: "Or when dispute alerts reach", unit: "in a week", min: 1, max: 100, integer: true, default: 3 },
      { kind: "number", store: "stack", path: "min_payment_sample_size", label: "Only judge a week with at least", unit: "payments", min: 1, max: 1000, integer: true, default: 10 },
    ],
  },
  "whop-bridge-manager": {
    fields: [{ kind: "text", store: "stack", path: "whop_bridge_destination_url", label: "Forward events to", format: "url", maxLength: 500, placeholder: "https://…", default: null, help: "A public https address. Verified Whop events are posted there as they arrive." }],
  },
  "whop-payment-recovery": {
    fields: [{ kind: "textarea", store: "stack", path: "whop_recovery_message", label: "Message to the buyer", maxLength: 1000, tokens: ["{name}", "{product}", "{amount}", "{link}"], default: DEFAULT_RECOVERY_MESSAGE, help: "Sent as a Whop message, only after you approve it. Nothing is sent if they pay first." }],
  },
};

// ── Helpers shared by the panel and the server ──────────────────────────

export function settingsFor(skillId: string): SkillSettingsSpec | null {
  return SKILL_SETTINGS[skillId as WorkerId] ?? null;
}

/** A field's key in a values object: its path, which is unique per skill. */
export const fieldKey = (f: SettingField) => f.path;

export function defaultValue(f: SettingField): SettingValue {
  if (f.kind === "select" && f.numeric && f.default !== null) return Number(f.default);
  return f.default;
}

/** Shown when its condition holds and the field it depends on is shown too
 * (the at-risk level hides with the at-risk switch when texts are off). */
export function isShown(f: SettingField, values: SettingValues, fields?: SettingField[], depth = 0): boolean {
  if (!f.showIf) return true;
  if (!f.showIf.equals.includes(values[f.showIf.path] as string | number | boolean)) return false;
  const parent = fields?.find((x) => fieldKey(x) === f.showIf!.path);
  return !parent || depth > 5 || isShown(parent, values, fields, depth + 1);
}

/** Rows that store nothing of their own: not sent, not saved as values. */
export const isValueless = (f: SettingField) => f.kind === "connect" || f.kind === "copy";

const TIMEZONE_OK = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Cleans one value for a field, or says what's wrong with it. null means "use the default". */
export function cleanValue(f: SettingField, raw: unknown): { value: SettingValue } | { error: string } {
  const empty = raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "");
  switch (f.kind) {
    case "toggle":
      if (typeof raw !== "boolean") return { error: `${f.label}: choose on or off.` };
      return { value: raw };
    case "number": {
      if (empty) return { value: null };
      const shown = Number(raw);
      if (!Number.isFinite(shown)) return { error: `${f.label}: enter a number.` };
      if (f.integer && !Number.isInteger(shown)) return { error: `${f.label}: use a whole number.` };
      if (shown < f.min || shown > f.max) return { error: `${f.label}: between ${f.min} and ${f.max}${f.unit ? ` ${f.unit}` : ""}.` };
      return { value: f.percent ? Math.round((shown / 100) * 1e6) / 1e6 : shown };
    }
    case "select": {
      if (empty) return { value: null };
      const s = String(raw);
      // Loaded choices are checked by the server against this client's list.
      if (!f.optionsFrom && !f.options.some((o) => o.value === s)) return { error: `${f.label}: pick one of the choices.` };
      return { value: f.numeric ? Number(s) : s };
    }
    case "tool": {
      if (empty || (Array.isArray(raw) && raw.length === 0)) return { value: null };
      const allowed = new Set(f.choices.map((c) => c.value));
      if (f.multi) {
        if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string" || !allowed.has(x))) return { error: `${f.label}: pick from the tools shown.` };
        return { value: [...new Set(raw as string[])] };
      }
      if (typeof raw !== "string" || !allowed.has(raw)) return { error: `${f.label}: pick one of the tools shown.` };
      return { value: raw };
    }
    case "pick": {
      if (empty) return { value: null };
      if (typeof raw !== "string" || raw.length > 200) return { error: `${f.label}: pick one from the list.` };
      return { value: raw.trim() };
    }
    case "secret": {
      // Empty keeps the saved one.
      if (empty) return { value: null };
      if (typeof raw !== "string" || raw.trim().length > 500) return { error: `${f.label}: paste the secret as shown.` };
      return { value: raw.trim() };
    }
    case "map": {
      if (empty) return { value: null };
      if (typeof raw !== "object" || Array.isArray(raw) || Object.values(raw as object).some((x) => typeof x !== "string")) return { error: `${f.label}: pick a campaign for each.` };
      return { value: Object.fromEntries(Object.entries(raw as Record<string, string>).filter(([, id]) => id)) };
    }
    case "connect":
    case "copy":
      return { value: null };
    case "text": {
      if (empty) return f.required ? { error: `${f.label} is needed.` } : { value: null };
      if (typeof raw !== "string") return { error: `${f.label} must be text.` };
      const s = raw.trim();
      if (s.length > f.maxLength) return { error: `${f.label}: keep it under ${f.maxLength} characters.` };
      if (f.format === "url") {
        try {
          if (new URL(s).protocol !== "https:") return { error: `${f.label} must start with https://.` };
        } catch {
          return { error: `${f.label} isn't a web address.` };
        }
      }
      if (f.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { error: `${f.label} isn't an email address.` };
      if (f.format === "timezone" && !TIMEZONE_OK(s)) return { error: `"${s}" isn't a time zone we recognize. Use one like America/New_York.` };
      if (f.format === "phone" && !/^\+?[0-9 ()-]{7,20}$/.test(s)) return { error: `${f.label} isn't a phone number.` };
      return { value: s };
    }
    case "textarea": {
      if (empty) return { value: null };
      if (typeof raw !== "string") return { error: `${f.label} must be text.` };
      const s = raw.trim();
      if (s.length > f.maxLength) return { error: `${f.label}: keep it under ${f.maxLength} characters.` };
      const missing = (f.requiredTokens ?? []).filter((t) => !s.includes(t));
      if (missing.length) return { error: `${f.label}: put ${missing.join(" and ")} in it.` };
      return { value: s };
    }
    case "multi": {
      if (empty) return { value: null };
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) return { error: `${f.label}: pick from the list.` };
      const picked = [...new Set(raw as string[])];
      if (f.options && picked.some((p) => !f.options!.some((o) => o.value === p))) return { error: `${f.label}: pick from the list.` };
      return { value: picked };
    }
    case "list": {
      if (empty) return { value: null };
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) return { error: `${f.label} must be a list.` };
      const items = [...new Set((raw as string[]).map((x) => x.trim()).filter(Boolean))];
      if (items.length > f.maxItems) return { error: `${f.label}: ${f.maxItems} at most.` };
      if (items.some((x) => x.length > f.maxLength)) return { error: `${f.label}: keep each under ${f.maxLength} characters.` };
      return { value: items.length ? items : null };
    }
  }
}

/** Every shown field cleaned, plus the skill's own cross-field check.
 * Fields that aren't shown keep what's stored (undefined here). */
export function cleanSettings(spec: SkillSettingsSpec, raw: Record<string, unknown>): { values: SettingValues } | { error: string; field?: string } {
  const values: SettingValues = {};
  // Visibility is judged on the incoming values (a toggle just switched on shows its fields).
  const incoming = { ...raw } as SettingValues;
  for (const f of spec.fields) {
    if (isValueless(f)) continue;
    if (!(fieldKey(f) in raw)) continue;
    if (!isShown(f, incoming, spec.fields)) continue;
    const r = cleanValue(f, raw[fieldKey(f)]);
    if ("error" in r) return { error: r.error, field: fieldKey(f) };
    values[fieldKey(f)] = r.value;
  }
  const merged = { ...incoming, ...values };
  const problem = spec.check?.(merged) ?? null;
  return problem ? { error: problem } : { values };
}

/** The value to store for a top-level stack setting: null (cleared, so the
 * running code's default applies) when it equals the default. Settings
 * inside an object, and Cold Open's and Reputation's columns, are read
 * without a fallback, so the server always stores those in full. */
export function storedValue(f: SettingField, value: SettingValue): SettingValue {
  if (value === null) return null;
  const d = defaultValue(f);
  if (d !== null && JSON.stringify(d) === JSON.stringify(value)) return null;
  return value;
}

/** A stored value in the units the form shows (fractions as percents). */
export function toShown(f: SettingField, v: SettingValue): SettingValue {
  if (f.kind === "number" && f.percent && typeof v === "number") return Math.round(v * 100 * 1e4) / 1e4;
  return v;
}
