// Shared content preparation for every Pin-Down confirmation page design.
// Each template file in this folder is purely presentational — it takes a
// PageContentModel and returns HTML. All the "what does this page actually
// say" logic (hero framing, which questions to show, whether to show
// proof) lives here exactly once, so a content fix (like the one below)
// or a copy change lands in every template at once instead of needing to
// be repeated 5 times.
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
