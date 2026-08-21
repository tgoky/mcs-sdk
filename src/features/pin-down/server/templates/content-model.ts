// Shared content preparation for every Pin-Down confirmation page design.
// Each template file in this folder is purely presentational — it takes a
// PageContentModel and returns HTML. All the "what does this page actually
// say" logic (hero framing, which questions to show, whether to show
// proof) lives here exactly once, so a content fix (like the one below)
// or a copy change lands in every template at once instead of needing to
// be repeated 5 times.
//
// `buyer` below is the operator's own client/brand name (labelled "Client
// Name" in the engagement wizard — see offer-step.tsx), not the individual
// prospect who books a call. That distinction matters here specifically
// because these pages are built ONCE per engagement at onboarding
// (buildConfirmationPageHtml is called a single time in
// onboarding-service.ts) and then published as static HTML that every
// future prospect who books lands on — there is no per-booking rebuild.
// Every prospect who visits therefore sees byte-identical HTML; the only
// thing that legitimately varies per visit is whatever the booking
// platform's own redirect appends as URL query params. `/confirm/[id]`
// (the unstyled internal fallback page) already reads exactly this —
// invitee_first_name, invitee_last_name, invitee_email, assigned_to,
// event_start_time — from Calendly's documented redirect merge tokens.
// The 5 templates below use the same param names via buildMergeScriptTag()
// so a prospect's first name / call time / assigned host resolve
// client-side after the static page loads, instead of every visitor
// seeing the operator's own business name in the greeting.
export interface PageBuilderInput {
  buyer: string;
  offerDetails?: {
    name: string;
    price: string;
    icp: string;
    traffic_temperature: "cold" | "warm" | "hot";
  };
  brandVoiceProfile?: unknown;
  topCallQuestions?: string[];
  prospectMeets?: string;
  existingProof?: {
    testimonials: Array<{
      name: string;
      role: string;
      company?: string;
      quote: string;
    }>;
  };
  calendarAddToUrl?: string;
}

export interface EscapedTestimonial {
  name: string;
  role: string;
  company?: string;
  quote: string;
}

export interface PageContentModel {
  title: string;
  buyer: string;
  host: string;
  heroApproach: "research_assistance" | "urgency" | "faq";
  heroEyebrow: string;
  heroLength: string;
  /** Escaped, ready to drop straight into HTML. Always 1-3 items. Real
   * buyer-submitted questions when there are any; a small set of honest
   * generic fallbacks (not fake placeholder text) when the buyer hasn't
   * submitted any yet. */
  questions: string[];
  hasRealQuestions: boolean;
  testimonials: EscapedTestimonial[];
  showProof: boolean;
  calendarAddToUrl?: string;
  /** Deterministic short reference code derived from the buyer's name
   * (e.g. "PD-JSC") — not a real tracking ID, just a docket-style flourish.
   * Used as a signature element by Ledger, Contract (agreement reference),
   * and The Golden Ticket (ticket-stub number). */
  reference: string;
}

/**
 * Hero approach selection — OG SKILL.md Phase 2 "Auto-decided" rule:
 * cold + complex (>$5k) gets Research Assistance framing, warm/hot + high
 * price (>$10k) gets Urgency, warm + standard price gets FAQ.
 */
function selectHeroApproach(
  offer?: PageBuilderInput["offerDetails"]
): PageContentModel["heroApproach"] {
  if (!offer) return "faq";
  const price = parseFloat(String(offer.price).replace(/[^0-9.]/g, "")) || 0;
  const complex = price > 5000;
  if (offer.traffic_temperature === "cold" && complex) return "research_assistance";
  if (offer.traffic_temperature !== "cold" && price > 10000) return "urgency";
  return "faq";
}

const HERO_COPY: Record<PageContentModel["heroApproach"], { eyebrow: string; length: string }> = {
  research_assistance: {
    eyebrow: "Your call is a working session, not a pitch.",
    length: "2–3 min",
  },
  urgency: {
    eyebrow: "Here's exactly what happens between now and your call.",
    length: "60–90 sec",
  },
  faq: {
    eyebrow: "A few quick answers before we talk.",
    length: "90 sec – 2 min",
  },
};

// Used only when the buyer hasn't submitted any top call questions yet —
// honest placeholder content instead of the old literal "Common question
// #1/#2/#3" text, which shipped even when real questions existed because
// the breakout section never actually read the `questions` array.
const FALLBACK_QUESTIONS = [
  "What should I bring or prepare before the call?",
  "How long will we actually spend together?",
  "What happens if I need to reschedule?",
];

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReference(buyer: string): string {
  const initials =
    buyer
      .replace(/[^A-Za-z\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "CL";
  return `PD-${initials}`;
}

export function buildPageContentModel(input: PageBuilderInput): PageContentModel {
  const heroApproach = selectHeroApproach(input.offerDetails);
  const hero = HERO_COPY[heroApproach];
  const host = escapeHtml(input.prospectMeets ?? "our team");
  const buyer = escapeHtml(input.buyer);

  const realQuestions = (input.topCallQuestions ?? []).map((q) => q.trim()).filter(Boolean).slice(0, 3);
  const hasRealQuestions = realQuestions.length > 0;
  const questions = (hasRealQuestions ? realQuestions : FALLBACK_QUESTIONS).map(escapeHtml);

  const testimonials: EscapedTestimonial[] = (input.existingProof?.testimonials ?? [])
    .filter((t) => t.name && t.role && t.quote)
    .slice(0, 3)
    .map((t) => ({
      name: escapeHtml(t.name),
      role: escapeHtml(t.role),
      company: t.company ? escapeHtml(t.company) : undefined,
      quote: escapeHtml(t.quote),
    }));

  return {
    title: `You're confirmed — ${buyer}`,
    buyer,
    host,
    heroApproach,
    heroEyebrow: hero.eyebrow,
    heroLength: hero.length,
    questions,
    hasRealQuestions,
    testimonials,
    showProof: testimonials.length > 0,
    calendarAddToUrl: input.calendarAddToUrl,
    reference: buildReference(input.buyer),
  };
}

// ── Client-side prospect personalization ────────────────────────────────
// Every static page reads these from its own URL query string at load
// time. Names match Calendly's redirect-URL merge tokens exactly (a
// buyer wires these into their Calendly event's confirmation redirect —
// the same convention /confirm/[id] already relies on), so no new booking
// platform wiring is required for this to work end to end.
export const MERGE_PARAMS = {
  firstName: "invitee_first_name",
  lastName: "invitee_last_name",
  email: "invitee_email",
  host: "assigned_to",
  timezone: "invitee_timezone",
  startTime: "event_start_time",
} as const;

/** Values the merge script resolves and can drop into the page — the
 * first four plus `email`/`timezone` come straight from a URL param each;
 * `fullName` and `call_time` are derived (first+last name joined,
 * event_start_time formatted) rather than read directly. */
export type MergeKey = "firstName" | "lastName" | "fullName" | "email" | "host" | "timezone" | "call_time";

/**
 * A two-span pair: a server-rendered `fallback` shown by default (so the
 * page reads correctly even with zero query params — an operator
 * previewing it, or a prospect who reached it some other way), and a
 * `resolved` version revealed in its place once the merge script confirms
 * real data came through in the URL. `resolved` can itself contain a bare
 * `<span data-merge="...">` for the live value to be dropped into.
 */
export function mergeField(group: MergeKey, fallback: string, resolved: string): string {
  return `<span class="mf-d" data-merge-group="${group}">${fallback}</span><span class="mf-l" data-merge-group="${group}" hidden>${resolved}</span>`;
}

/** Bare inline slot a `mergeField()` "resolved" string can embed — the
 * script fills its textContent once the corresponding param resolves. */
export function mergeSlot(key: MergeKey): string {
  return `<span data-merge="${key}"></span>`;
}

/**
 * The actual client-side script, shared byte-for-byte across all 5
 * templates so a fix here fixes every design at once. Reads the query
 * string once on load, formats event_start_time the same way
 * /confirm/[id] already does, then reveals/hides matching
 * .mf-l/.mf-d pairs and fills bare [data-merge] slots. Fails silently
 * (try/catch) rather than ever breaking the static page underneath it.
 */
export function buildMergeScriptTag(): string {
  return `<script>
(function () {
  try {
    var p = new URLSearchParams(window.location.search);
    var firstName = (p.get("${MERGE_PARAMS.firstName}") || "").trim();
    var lastName = (p.get("${MERGE_PARAMS.lastName}") || "").trim();
    var email = (p.get("${MERGE_PARAMS.email}") || "").trim();
    var host = (p.get("${MERGE_PARAMS.host}") || "").trim();
    var timezone = (p.get("${MERGE_PARAMS.timezone}") || "").trim();
    var startRaw = p.get("${MERGE_PARAMS.startTime}") || "";
    var fullName = (firstName + " " + lastName).trim();

    var callTime = "";
    if (startRaw) {
      var d = new Date(startRaw);
      if (!isNaN(d.getTime())) {
        callTime = d.toLocaleDateString(undefined, {
          weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });
      }
    }

    var values = { firstName: firstName, lastName: lastName, fullName: fullName, email: email, host: host, timezone: timezone, call_time: callTime };
    var groupKeys = ["firstName", "lastName", "fullName", "email", "host", "timezone", "call_time"];

    groupKeys.forEach(function (group) {
      var val = values[group];
      if (!val) return;
      document.querySelectorAll('[data-merge-group="' + group + '"].mf-l').forEach(function (el) { el.hidden = false; });
      document.querySelectorAll('[data-merge-group="' + group + '"].mf-d').forEach(function (el) { el.hidden = true; });
    });

    Object.keys(values).forEach(function (key) {
      var val = values[key];
      if (!val) return;
      document.querySelectorAll('[data-merge="' + key + '"]').forEach(function (el) { el.textContent = val; });
    });
  } catch (e) {}
})();
</script>`;
}
