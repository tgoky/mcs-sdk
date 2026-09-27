// src/lib/skill-settings/schema.ts
//
// Each skill's own settings: the knobs that change how that skill behaves,
// edited in place from Configure (components/skill-settings). Not the
// product's setup: tools, keys and destinations (which have to be checked
// or registered when they change) stay in setup, and a skill's settings
// only show them as facts with a link there.
//
// Every field names where it's stored and the default the running code
// uses when it's unset; saving a value equal to that default clears it, so
// "unset" keeps meaning "the default". Client-safe: no db imports.

import type { WorkerId } from "@/lib/worker-registry";
import { DEFAULT_CHECK_IN_MESSAGE } from "@/lib/at-risk";
import { DEFAULT_RECOVERY_MESSAGE } from "@/features/whop-agent/server/recovery-message";
import { DEFAULT_REVIEW_MESSAGE, DEFAULT_REVIEW_SUBJECT, DEFAULT_REVIEW_DELAY_HOURS } from "@/features/reputation-manager/server/review-request-message";

/** Where a value lives: the engagement's stack, Cold Open's config row, or
 * Reputation Manager's identity graph. `path` may be nested ("a.b"). */
export type SettingStore = "stack" | "coldOpen" | "rep";

interface FieldBase {
  store: SettingStore;
  path: string;
  label: string;
  help?: string;
  /** Shown only when another field has one of these values. */
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
  | (FieldBase & { kind: "select"; options: { value: string; label: string }[]; numeric?: boolean; default: string | null })
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
  | (FieldBase & { kind: "list"; maxItems: number; maxLength: number; placeholder?: string; default: string[] | null });

export type SettingValue = string | number | boolean | string[] | null;
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

export const SKILL_SETTINGS: Partial<Record<WorkerId, SkillSettingsSpec>> = {
  // ── Showtime ───────────────────────────────────────────────────────────
  "pile-on": {
    fields: [
      { kind: "toggle", store: "stack", path: "at_risk_check_in", label: "Check in with at-risk calls", help: "One extra text 3 hours before a call whose estimated show chance is low. Replies come back like any text: YES confirms, a new time lands in the Queue.", default: false },
      { kind: "number", store: "stack", path: "at_risk_threshold", label: "At risk under", unit: "%", min: 10, max: 90, step: 5, integer: true, default: 50, showIf: { path: "at_risk_check_in", equals: [true] } },
      { kind: "textarea", store: "stack", path: "at_risk_check_in_message", label: "Check-in text", maxLength: 320, tokens: ["{name}", "{time}"], default: DEFAULT_CHECK_IN_MESSAGE, showIf: { path: "at_risk_check_in", equals: [true] } },
      {
        kind: "select",
        store: "stack",
        path: "reminder_holdout_percent",
        label: "Holdout",
        help: "A small random share of bookings gets no reminder texts, to prove what reminders are worth on this client's own calls.",
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
        options: [
          { value: "standard", label: "Standard (Reply STOP to opt out)" },
          { value: "custom", label: "Your own wording" },
        ],
        default: "standard",
      },
      { kind: "text", store: "stack", path: "sms_compliance_footer_custom", label: "Your opt-out line", maxLength: 120, placeholder: "Text STOP to stop these messages", default: null, showIf: { path: "sms_compliance_footer_variant", equals: ["custom"] } },
    ],
    check: (v) =>
      v.sms_compliance_footer_variant === "custom" && !(typeof v.sms_compliance_footer_custom === "string" && /stop/i.test(v.sms_compliance_footer_custom))
        ? "Your opt-out line has to tell people how to stop (mention STOP)."
        : null,
  },
  "win-back": {
    fields: [
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
    ],
  },
  "pre-call-read": {
    fields: [
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
    ],
  },

  // ── Cold Open ──────────────────────────────────────────────────────────
  "daily-send": {
    fields: [
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
    fields: [{ kind: "multi", store: "coldOpen", path: "autoPushIcps", label: "Push without review", optionsFrom: "coldOpenIcps", help: "Leads for these customer types go straight to the sending tool, even if they're marked for review.", default: null }],
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

export function isShown(f: SettingField, values: SettingValues): boolean {
  if (!f.showIf) return true;
  return f.showIf.equals.includes(values[f.showIf.path] as string | number | boolean);
}

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
      if (!f.options.some((o) => o.value === s)) return { error: `${f.label}: pick one of the choices.` };
      return { value: f.numeric ? Number(s) : s };
    }
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
    if (!(fieldKey(f) in raw)) continue;
    if (!isShown(f, incoming)) continue;
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
