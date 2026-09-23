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
// because these pages are built and published as static HTML that every
// future prospect who books lands on, not rebuilt per booking — onboarding
// (onboarding-service.ts) builds it once, and confirmation-page-only.ts
// can rebuild+republish it again on demand afterward (still the same
// static-per-engagement model — a rebuild replaces the one live page, it
// doesn't create a per-prospect variant).
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
import { classifySiteSignal, DEFAULT_TOKENS, type DesignTokens, type RawSiteSignal } from "./dynamic/tokens";

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
  /** A Loom/YouTube/Vimeo share link to the buyer's own recorded hero
   * video, once they've actually recorded the script script-builder.ts
   * generates. Every template ships a "recording in progress" placeholder
   * by default (see buildHeroVideoBlock below) — this is the one field
   * that replaces it with a real embed. Anything that isn't a recognized
   * share link from one of those three providers is dropped rather than
   * embedded, same "allowlist and rebuild the URL ourselves" approach as
   * calendarAddToUrl below, not just HTML-escaped. */
  heroVideoUrl?: string;
  /** Raw scraped signal from the buyer's own site (design-scraper.ts),
   * when a crawl produced one. Classified once, here, into DesignTokens —
   * templates never see the raw form. Absent (undefined) is a completely
   * normal state (no domain yet, scrape failed, or the buyer's site
   * didn't yield enough signal) and falls back to DEFAULT_TOKENS, which
   * is exactly today's hardcoded look for each archetype — a scrape can
   * only add a matched skin, it can never break the safe default. */
  designSignal?: RawSiteSignal;
  /** Opt-in only — see ENTRANCE_ANIMATION_CSS's own comment for why this
   * defaults to false rather than shipping on by default. */
  animationsEnabled?: boolean;
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
  /** Already validated + rebuilt into a known-safe embed URL (see
   * sanitizeVideoEmbedUrl) — templates can drop this straight into an
   * iframe src with no further checks. Undefined means "no real video
   * yet," not "sanitization failed silently" — both look the same to a
   * template (show the placeholder), which is the point. */
  heroVideoUrl?: string;
  /** Deterministic short reference code derived from the buyer's name
   * (e.g. "PD-JSC") — not a real tracking ID, just a docket-style flourish.
   * Used as a signature element by Ledger, Contract (agreement reference),
   * and The Golden Ticket (ticket-stub number). */
  reference: string;
  /** Resolved once here from PageBuilderInput.designSignal — see that
   * field's doc comment. `designTokens.confidence` is how every archetype
   * decides whether to render its site-matched skin or its static
   * default; templates should never need to look at anything else to
   * make that call. */
  designTokens: DesignTokens;
  /** Already resolved to a plain boolean — see PageBuilderInput's own field
   * for why this exists. Templates read this once, to set <body>'s class;
   * they never need the raw input shape. */
  animationsEnabled: boolean;
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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * calendarAddToUrl is the one field on PageContentModel that's a real URL
 * headed for an `href="..."` attribute rather than plain text content —
 * escapeHtml alone (safe against attribute breakout) does nothing to stop
 * a `javascript:`/`data:` URI from executing on click. Allowlists
 * http(s)/mailto and HTML-escapes what's left; anything else (including
 * no value at all) becomes undefined, which every template already
 * treats as "don't render the calendar link."
 */
function sanitizeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!/^(https?:\/\/|mailto:)/i.test(trimmed)) return undefined;
  return escapeHtml(trimmed);
}

/**
 * Recognizes a Loom/YouTube/Vimeo share link and rebuilds a fresh,
 * known-safe embed URL from just the extracted video ID — the raw input
 * string is never itself echoed into the output, only a capture group
 * that a stricter regex has already constrained to safe characters. Any
 * link that doesn't match one of the three exactly falls through to
 * undefined rather than being embedded unvetted or escaped-and-trusted;
 * a template treats "no video yet" and "unrecognized link" identically
 * (show the placeholder), which is the safer default either way.
 */
export function sanitizeVideoEmbedUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();

  const loom = trimmed.match(/^https:\/\/(?:www\.)?loom\.com\/share\/([a-zA-Z0-9]+)/i);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;

  const youtubeWatch = trimmed.match(/^https:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{6,20})/i);
  if (youtubeWatch) return `https://www.youtube.com/embed/${youtubeWatch[1]}`;

  const youtuBe = trimmed.match(/^https:\/\/youtu\.be\/([a-zA-Z0-9_-]{6,20})/i);
  if (youtuBe) return `https://www.youtube.com/embed/${youtuBe[1]}`;

  const vimeo = trimmed.match(/^https:\/\/(?:www\.)?vimeo\.com\/(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  return undefined;
}

/**
 * The one piece of markup every template's hero section needs, factored
 * out so a template only ever renders ONE of "placeholder" or "real
 * video" instead of five separate copies of that branch. Returns a
 * self-contained 16:9 box either way, styled inline so no template needs
 * a new CSS rule to support it — heroVideoUrl is already a fully-formed,
 * sanitized embed URL by the time it reaches here (see
 * sanitizeVideoEmbedUrl), so this never re-validates it.
 */
export function buildHeroVideoBlock(opts: { heroVideoUrl?: string; placeholderHtml: string }): string {
  if (!opts.heroVideoUrl) return opts.placeholderHtml;
  return `<div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000;">
    <iframe src="${opts.heroVideoUrl}" style="position:absolute;inset:0;width:100%;height:100%;border:0;" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" title="Call briefing video"></iframe>
  </div>`;
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
    calendarAddToUrl: sanitizeHref(input.calendarAddToUrl),
    heroVideoUrl: sanitizeVideoEmbedUrl(input.heroVideoUrl),
    reference: buildReference(input.buyer),
    designTokens: input.designSignal ? classifySiteSignal(input.designSignal) : DEFAULT_TOKENS,
    animationsEnabled: input.animationsEnabled === true,
  };
}

// ── Entrance animation (opt-in) ─────────────────────────────────────────
// Off by default — a prospect landing here mid-decision shouldn't have
// motion sprung on them without the operator having actually chosen it,
// and a subtle fade doesn't fix a page that isn't working, it just adds
// risk for someone who never asked for it. An operator flips this on per
// engagement (client-details-drawer.tsx) once they've seen the page and
// want the extra polish; the next rebuild is what applies it (this is a
// build-time flag baked into the static HTML, same as every other page
// setting, not something a viewer can toggle).
//
// Implementation is one shared CSS block plus a body class rather than
// per-element markup changes — a template's own top-level `main > *`
// children get a staggered fade-up automatically, so this drops into all
// 10 templates (5 static, 5 site-matched) without editing their markup at
// all. Entirely inert (zero visual change) unless both the class is
// present AND the visitor's OS isn't requesting reduced motion — the
// @media query below means a `prefers-reduced-motion: reduce` visitor
// never gets it regardless of the operator's setting, matching how every
// other real product handles that preference.
export const ENTRANCE_ANIMATION_CSS = `
  @media (prefers-reduced-motion: no-preference) {
    body.pd-anim main > * { animation: pd-fade-up 0.55s cubic-bezier(0.16, 1, 0.3, 1) both; }
    body.pd-anim main > *:nth-child(1) { animation-delay: 0s; }
    body.pd-anim main > *:nth-child(2) { animation-delay: 0.06s; }
    body.pd-anim main > *:nth-child(3) { animation-delay: 0.12s; }
    body.pd-anim main > *:nth-child(4) { animation-delay: 0.18s; }
    body.pd-anim main > *:nth-child(5) { animation-delay: 0.24s; }
    body.pd-anim main > *:nth-child(n+6) { animation-delay: 0.3s; }
    @keyframes pd-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  }`;

/** `<body class="...">`'s value — every template calls this instead of
 * inlining the ternary, so the class name itself (and ENTRANCE_ANIMATION_CSS's
 * selector) can only ever drift out of sync in one place if it ever changes. */
export function animationBodyClass(m: PageContentModel): string {
  return m.animationsEnabled ? "pd-anim" : "";
}

// ── Static templates' webfont (site-matched templates skip this — see
// their own dynamic/*.dynamic.ts files, which already render the buyer's
// real detected font from the design scrape, a stronger signal than any
// generic font choice here) ─────────────────────────────────────────────
/**
 * `families` is the exact `family=...&family=...` query Google Fonts'
 * css2 endpoint expects — each static template passes its own, since
 * each picked a different face to match its own personality (see each
 * template's own file header). preconnect hints are included so the
 * font request doesn't cost a full extra DNS+TLS round trip on top of
 * the stylesheet fetch.
 */
export function buildGoogleFontLinks(families: string): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${families}&display=swap" rel="stylesheet">`;
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
    // Embedded on Webflow/WordPress/GHL this page runs inside a srcdoc
    // iframe (hosting.ts's wrapAsEmbeddableIframe), whose own location is
    // about:srcdoc with no query string — the booking tool's params are on
    // the host page. The iframe is same-origin with it (no sandbox), so
    // read them from there.
    var search = window.location.search;
    if (!search && window.parent && window.parent !== window) {
      try { search = window.parent.location.search; } catch (e) { search = ""; }
    }
    var p = new URLSearchParams(search);
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
  // Size the embedding iframe to this page's content instead of a fixed
  // 100vh (which cut long pages off and left short ones with dead space).
  // Only applies when framed by a same-origin host (the srcdoc embed).
  try {
    var frame = window.frameElement;
    if (frame) {
      var fit = function () {
        var h = document.documentElement.scrollHeight + "px";
        if (frame.style.height !== h) frame.style.height = h;
      };
      fit();
      window.addEventListener("load", fit);
      if (window.ResizeObserver) new ResizeObserver(fit).observe(document.documentElement);
    }
  } catch (e) {}
})();
</script>`;
}
