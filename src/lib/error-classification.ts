// src/lib/error-classification.ts
//
// Turns a skillRuns.errorMessage string into an actionable diagnosis, when
// one can be determined with real confidence.
//
// Every platform client in src/lib/platforms/*.ts throws with the same
// convention: "<description> failed [<http status>]: <body>" — confirmed
// across 40+ call sites in booking.ts, email.ts, hosting.ts, sms.ts, and
// ad-data.ts. That convention is reliable enough to parse a real HTTP
// status code out of, rather than guessing from free-text alone.
//
// Deliberately conservative: if a status code and a recognizable platform
// keyword can't both be extracted, this returns null rather than a vague
// "please check your settings" message that fits every failure equally
// badly. A null result means "this failure gets the existing plain
// notification treatment, not a fix card" — see queue.ts's
// failedRunQueueItems, which only creates a queue item when this returns
// non-null.

export type StackSection = "booking" | "hosting" | "email" | "sms" | "ad_data";

export interface RunDiagnosis {
  /** Short queue-item title, e.g. "GoHighLevel rejected the request". */
  title: string;
  /** One or two sentences explaining what this status code means for this platform. */
  explanation: string;
  /** Which "Edit stack settings" section has the field that's likely wrong. */
  section: StackSection;
  /** 401/403 — the fix is re-checking the credential itself, not a stack field. */
  isCredentialIssue: boolean;
  /** Parsed straight from the error message, shown for transparency. */
  httpStatus: number;
  platformLabel: string;
}

// Order matters — more specific operation keywords are checked before the
// bare platform name, since e.g. "GHL" alone appears in booking, email/CRM,
// and SMS error messages and would otherwise misclassify two of the three.
const SECTION_MATCHERS: Array<{ pattern: RegExp; section: StackSection; platformLabel: string }> = [
  // Booking
  { pattern: /GHL (calendar|appointments)/i, section: "booking", platformLabel: "GoHighLevel Calendar" },
  { pattern: /Calendly/i, section: "booking", platformLabel: "Calendly" },
  { pattern: /Cal\.com/i, section: "booking", platformLabel: "Cal.com" },
  { pattern: /OnceHub/i, section: "booking", platformLabel: "OnceHub" },
  // Email / CRM
  { pattern: /Klaviyo/i, section: "email", platformLabel: "Klaviyo" },
  { pattern: /HubSpot/i, section: "email", platformLabel: "HubSpot" },
  { pattern: /ActiveCampaign/i, section: "email", platformLabel: "ActiveCampaign" },
  { pattern: /Mailchimp/i, section: "email", platformLabel: "Mailchimp" },
  { pattern: /ConvertKit/i, section: "email", platformLabel: "ConvertKit" },
  { pattern: /GHL CRM|GHL contact/i, section: "email", platformLabel: "GoHighLevel" },
  // SMS
  { pattern: /Twilio/i, section: "sms", platformLabel: "Twilio" },
  { pattern: /GHL SMS/i, section: "sms", platformLabel: "GoHighLevel SMS" },
  // Ad-data
  { pattern: /Hyros/i, section: "ad_data", platformLabel: "Hyros" },
  { pattern: /Google Sheets/i, section: "ad_data", platformLabel: "Google Sheets" },
  // Hosting
  { pattern: /Webflow/i, section: "hosting", platformLabel: "Webflow" },
  { pattern: /WordPress/i, section: "hosting", platformLabel: "WordPress" },
  { pattern: /Vercel/i, section: "hosting", platformLabel: "Vercel" },
];

/** Per-status, per-section explanation text. Falls back to a generic line for a status/section pair not worth a bespoke sentence. */
function explanationFor(status: number, section: StackSection, platformLabel: string): { title: string; explanation: string; isCredentialIssue: boolean } {
  if (status === 401 || status === 403) {
    return {
      title: `${platformLabel} rejected the credential`,
      explanation: `${platformLabel} returned ${status} — the stored API key/token is invalid, expired, or missing a required scope. Re-enter it under "Update credentials."`,
      isCredentialIssue: true,
    };
  }
  if (status === 404) {
    return {
      title: `${platformLabel} couldn't find the configured ID`,
      explanation: `${platformLabel} returned 404 — one of the IDs saved for this connection (location, calendar, list, or workflow ID) no longer exists or was never set correctly.`,
      isCredentialIssue: false,
    };
  }
  if (status === 422) {
    return {
      title: `${platformLabel} rejected a saved value`,
      explanation: `${platformLabel} returned 422 — a required field for this connection is missing or doesn't match what ${platformLabel} expects. Double-check the values under Edit stack settings.`,
      isCredentialIssue: false,
    };
  }
  if (status === 429) {
    return {
      title: `${platformLabel} is rate-limiting requests`,
      explanation: `${platformLabel} returned 429. This isn't a configuration problem — no fix needed here, it should clear on its own on the next scheduled run.`,
      isCredentialIssue: false,
    };
  }
  if (status >= 500) {
    return {
      title: `${platformLabel} had an outage`,
      explanation: `${platformLabel} returned ${status} — that's on their end, not this configuration. No fix needed here; it should clear on its own.`,
      isCredentialIssue: false,
    };
  }
  return {
    title: `${platformLabel} returned an error`,
    explanation: `${platformLabel} returned ${status}. Check the connection under Edit stack settings.`,
    isCredentialIssue: false,
  };
}

// Statuses worth surfacing as an actionable fix-it queue item. 429/5xx are
// deliberately excluded — see explanationFor above, they're transient and
// telling a buyer to go "fix" a rate limit or an upstream outage is noise,
// not help.
const ACTIONABLE_STATUSES = new Set([400, 401, 403, 404, 409, 422]);

/**
 * Parses a skillRuns.errorMessage string and returns an actionable
 * diagnosis, or null if this failure doesn't have a clear fix-it action
 * (unrecognized platform, non-actionable status like a transient 5xx/429,
 * or a message that doesn't follow the "[status]" convention at all —
 * e.g. a JS exception unrelated to any external API call).
 */
export function classifyRunError(errorMessage: string | null | undefined): RunDiagnosis | null {
  if (!errorMessage) return null;

  const statusMatch = errorMessage.match(/\[(\d{3})\]/);
  if (!statusMatch) return null;
  const httpStatus = Number(statusMatch[1]);
  if (!ACTIONABLE_STATUSES.has(httpStatus)) return null;

  const matched = SECTION_MATCHERS.find((m) => m.pattern.test(errorMessage));
  if (!matched) return null;

  const { title, explanation, isCredentialIssue } = explanationFor(httpStatus, matched.section, matched.platformLabel);
  return {
    title,
    explanation,
    section: matched.section,
    isCredentialIssue,
    httpStatus,
    platformLabel: matched.platformLabel,
  };
}
