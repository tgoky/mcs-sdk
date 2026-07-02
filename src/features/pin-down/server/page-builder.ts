import type { ConfirmationPageContent } from "@/lib/platforms/hosting";

export interface PageBuilderInput {
  buyer: string;
  offerDetails?: {
    name: string;
    price: string;
    icp: string;
    traffic_temperature: "cold" | "warm" | "hot";
  };
  brandVoiceProfile?: any;
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

/**
 * Hero approach selection — OG SKILL.md Phase 2 "Auto-decided" rule,
 * ported as-is: cold + complex (>$5k) gets Research Assistance framing,
 * warm/hot + high price (>$10k) gets Urgency, warm + standard price gets FAQ.
 */
function selectHeroApproach(
  offer?: PageBuilderInput["offerDetails"]
): "research_assistance" | "urgency" | "faq" {
  if (!offer) return "faq";
  const price = parseFloat(String(offer.price).replace(/[^0-9.]/g, "")) || 0;
  const complex = price > 5000;
  if (offer.traffic_temperature === "cold" && complex) return "research_assistance";
  if (offer.traffic_temperature !== "cold" && price > 10000) return "urgency";
  return "faq";
}

const HERO_COPY: Record<string, { eyebrow: string; length: string }> = {
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds the confirmation page as a single self-contained HTML document.
 * This is what every hosting adapter (Webflow CMS item, WordPress page,
 * Vercel static deploy, or the paste-ready fallback) receives — one source
 * of truth for content, platform-specific wrapping happens in hosting.ts.
 *
 * Section order matches OG SKILL.md's default: hero, what-to-expect,
 * breakout videos, proof (conditional), contact info, calendar add-to-link.
 * Videos ship as placeholders with a recording-pending label — the actual
 * hero/breakout video *scripts* are a separate content-generation pass
 * (Pin-Down's script writer), not part of page publishing.
 */
export function buildConfirmationPageHtml(input: PageBuilderInput): ConfirmationPageContent {
  const approach = selectHeroApproach(input.offerDetails);
  const hero = HERO_COPY[approach];
  const host = input.prospectMeets ?? "our team";
  const questions = (input.topCallQuestions ?? []).slice(0, 3);
  const testimonials = (input.existingProof?.testimonials ?? []).filter(
    (t) => t.name && t.role && t.quote
  );
  const showProof = testimonials.length > 0;

  const title = `You're confirmed — ${input.buyer}`;

  const questionsHtml = questions.length
    ? `<ul class="qa-list">${questions
        .map((q) => `<li>${escapeHtml(q)}</li>`)
        .join("")}</ul>`
    : "";

  const proofHtml = showProof
    ? `<section class="proof-block">
        <h2>What others say</h2>
        ${testimonials
          .slice(0, 3)
          .map(
            (t) => `<blockquote>
              <p>&ldquo;${escapeHtml(t.quote)}&rdquo;</p>
              <cite>${escapeHtml(t.name)}, ${escapeHtml(t.role)}${
                t.company ? ` — ${escapeHtml(t.company)}` : ""
              }</cite>
            </blockquote>`
          )
          .join("")}
      </section>`
    : "";

  const calendarLink = input.calendarAddToUrl
    ? `<a class="cta" href="${escapeHtml(input.calendarAddToUrl)}">Add to calendar</a>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #fafafa; color: #18181b; }
  main { max-width: 640px; margin: 0 auto; padding: 48px 24px 80px; }
  h1 { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 8px; }
  .eyebrow { color: #52525b; font-size: 0.95rem; margin-bottom: 32px; }
  section { margin-bottom: 40px; }
  .video-placeholder { border: 1px dashed #d4d4d8; border-radius: 12px; padding: 32px; text-align: center; color: #71717a; background: #fff; }
  .video-placeholder .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: #a1a1aa; margin-bottom: 8px; }
  .breakout-grid { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
  @media (max-width: 480px) { .breakout-grid { grid-template-columns: 1fr; } }
  .qa-list { padding-left: 20px; color: #3f3f46; line-height: 1.6; }
  .proof-block blockquote { background: #fff; border-radius: 12px; padding: 20px 24px; margin: 0 0 16px; border: 1px solid #e4e4e7; }
  .proof-block cite { display: block; margin-top: 12px; font-size: 0.85rem; color: #71717a; font-style: normal; }
  .contact-block { font-size: 0.9rem; color: #52525b; }
  .cta { display: inline-block; margin-top: 24px; padding: 12px 20px; background: #18181b; color: #fff; border-radius: 8px; text-decoration: none; font-size: 0.9rem; font-weight: 500; }
</style>
</head>
<body>
<main>
  <h1>You're confirmed with ${escapeHtml(input.buyer)}</h1>
  <p class="eyebrow">${escapeHtml(hero.eyebrow)}</p>

  <section class="hero">
    <div class="video-placeholder">
      <div class="label">Hero video — ${hero.length} — pending recording</div>
      This video will introduce your call with ${escapeHtml(host)} and cover what to expect.
    </div>
  </section>

  <section class="what-to-expect">
    <h2>What to expect on the call</h2>
    <p>You'll be speaking directly with ${escapeHtml(host)}. Here's what we typically cover:</p>
    ${questionsHtml}
  </section>

  <section class="breakouts">
    <h2>Quick answers while you wait</h2>
    <div class="breakout-grid">
      <div class="video-placeholder"><div class="label">Breakout — pending</div>Common question #1</div>
      <div class="video-placeholder"><div class="label">Breakout — pending</div>Common question #2</div>
      <div class="video-placeholder"><div class="label">Breakout — pending</div>Common question #3</div>
    </div>
  </section>

  ${proofHtml}

  <section class="contact-block">
    <h2>Need to reschedule?</h2>
    <p>Use the link in your confirmation email, or reply directly and we'll sort it out.</p>
    ${calendarLink}
  </section>
</main>
</body>
</html>`;

  return { html, title };
}
