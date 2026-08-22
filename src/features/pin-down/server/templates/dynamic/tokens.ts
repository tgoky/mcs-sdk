// Design tokens extracted from a buyer's real site, and the deterministic
// classifier that turns raw scraped signal into a bounded set of choices.
//
// The bound is the whole point. This never asks a model to write CSS. It
// picks from a small, pre-vetted catalog (component-catalog.ts) using
// rules a human can read and audit. That's what keeps a scraped-and-skinned
// page from degrading into "AI slop" the way freeform generation would —
// every possible output already exists as tested code before any site is
// ever crawled; scraping only decides which combination gets used.

export type ThemeMode = "light" | "dark";
export type ButtonVariant = "solid-pill" | "solid-rect" | "solid-soft" | "outline-rect" | "outline-pill" | "ghost-underline";
export type CardVariant = "flat-bordered" | "soft-shadow" | "hard-shadow" | "glass" | "borderless-inset";
export type Density = "compact" | "cozy" | "spacious";
export type TypePairing = "system-sans" | "geometric-sans" | "editorial-serif" | "mono-accent";

export interface DesignTokens {
  mode: ThemeMode;
  color: {
    bg: string;
    surface: string;
    text: string;
    textMuted: string;
    accent: string;
    accentText: string;
    border: string;
  };
  typePairing: TypePairing;
  fontFamily: string;
  headingWeight: 500 | 600 | 700 | 800;
  radius: { sm: string; md: string; lg: string; pill: string };
  buttonVariant: ButtonVariant;
  cardVariant: CardVariant;
  density: Density;
  /** "scraped" when real signal drove these choices, "default" when we
   * fell back — surfaced in the wizard so an operator knows whether
   * they're looking at a real match or a safe placeholder. Never hidden. */
  confidence: "scraped" | "default";
}

export const DEFAULT_TOKENS: DesignTokens = {
  mode: "light",
  color: {
    bg: "#FAFAFA",
    surface: "#FFFFFF",
    text: "#18181B",
    textMuted: "#71717A",
    accent: "#2563EB",
    accentText: "#FFFFFF",
    border: "#E4E4E7",
  },
  typePairing: "system-sans",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headingWeight: 700,
  radius: { sm: "6px", md: "10px", lg: "16px", pill: "999px" },
  buttonVariant: "solid-rect",
  cardVariant: "flat-bordered",
  density: "cozy",
  confidence: "default",
};

/**
 * What a scraper hands the classifier — deliberately dumb, string-level
 * signal, not a parsed stylesheet. The classifier below is the only place
 * that turns it into a judgment.
 */
export interface RawSiteSignal {
  /** Every class="..." value found on elements that look like a primary
   * CTA (a/button tags whose text or context suggests "book", "get
   * started", "confirm", etc.) or a card-like container, concatenated
   * and space-split. */
  classTokens: string[];
  /** Hex/rgb values found in inline styles, `:root { --x: ... }` blocks,
   * or a `<meta name="theme-color">` tag, in document order — first is
   * weighted heaviest as "most likely the primary surface or accent". */
  colorMentions: string[];
  /** font-family values found in <style> blocks, inline styles, or
   * @font-face declarations, in document order. */
  fontFamilyMentions: string[];
  /** True if the page's own markup or meta tags signal a dark theme
   * (e.g. a dark <meta name="color-scheme">, `bg-black`/`bg-neutral-900`
   * classes on <body>/<html>). */
  looksDark: boolean;
}

const has = (tokens: string[], re: RegExp) => tokens.some((t) => re.test(t));
const count = (tokens: string[], re: RegExp) => tokens.filter((t) => re.test(t)).length;

function classifyButtonVariant(tokens: string[]): ButtonVariant {
  const pill = has(tokens, /\brounded-full\b/);
  const outline = has(tokens, /\bborder(?!-(?:0|none))\b/) && !has(tokens, /\bbg-(?!transparent|white\/0)/);
  const ghost = has(tokens, /\bunderline\b/) || (has(tokens, /\bhover:underline\b/) && !has(tokens, /\bbg-/));
  const soft = has(tokens, /\bbg-\w+-(50|100)\b/);
  if (ghost) return "ghost-underline";
  if (pill && outline) return "outline-pill";
  if (pill) return "solid-pill";
  if (outline) return "outline-rect";
  if (soft) return "solid-soft";
  return "solid-rect";
}

function classifyCardVariant(tokens: string[]): CardVariant {
  const glass = has(tokens, /\bbackdrop-blur/) || has(tokens, /\bbg-white\/\d+\b/) || has(tokens, /\bbg-black\/\d+\b/);
  const hardShadow = has(tokens, /\bshadow-\[/) || count(tokens, /\bshadow-(lg|xl|2xl)\b/) >= 2;
  const softShadow = has(tokens, /\bshadow-(sm|md|lg)\b/);
  const borderless = !has(tokens, /\bborder(?!-(?:0|none))\b/) && !softShadow && !glass;
  if (glass) return "glass";
  if (hardShadow) return "hard-shadow";
  if (softShadow) return "soft-shadow";
  if (borderless) return "borderless-inset";
  return "flat-bordered";
}

function classifyDensity(tokens: string[]): Density {
  const spacious = count(tokens, /\bp[xy]?-(8|10|12|16|20)\b/) >= 2 || has(tokens, /\bgap-(8|10|12)\b/);
  const compact = count(tokens, /\bp[xy]?-(1|2|3)\b/) >= 3;
  if (spacious) return "spacious";
  if (compact) return "compact";
  return "cozy";
}

function classifyRadiusScale(tokens: string[]): DesignTokens["radius"] {
  if (has(tokens, /\brounded-none\b/) && !has(tokens, /\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/)) {
    return { sm: "0px", md: "0px", lg: "0px", pill: "999px" };
  }
  if (has(tokens, /\brounded-(2xl|3xl)\b/)) {
    return { sm: "10px", md: "16px", lg: "24px", pill: "999px" };
  }
  if (has(tokens, /\brounded-(sm|md)\b/) && !has(tokens, /\brounded-(lg|xl|2xl|3xl)\b/)) {
    return { sm: "3px", md: "5px", lg: "8px", pill: "999px" };
  }
  return DEFAULT_TOKENS.radius;
}

function classifyTypePairing(fontFamilyMentions: string[]): { pairing: TypePairing; family: string; weight: 500 | 600 | 700 | 800 } {
  const joined = fontFamilyMentions.join(" ").toLowerCase();
  if (/georgia|times|garamond|playfair|merriweather|lora|source serif/.test(joined)) {
    return { pairing: "editorial-serif", family: `${fontFamilyMentions[0] ?? "Georgia"}, Georgia, serif`, weight: 600 };
  }
  if (/jetbrains|mono|ibm plex mono|space mono|fira code/.test(joined)) {
    return { pairing: "mono-accent", family: `${fontFamilyMentions[0] ?? "IBM Plex Mono"}, monospace`, weight: 600 };
  }
  if (/sora|space grotesk|manrope|clash|general sans|urbanist/.test(joined)) {
    return { pairing: "geometric-sans", family: `${fontFamilyMentions[0] ?? "Manrope"}, sans-serif`, weight: 700 };
  }
  if (fontFamilyMentions[0]) {
    return { pairing: "system-sans", family: `${fontFamilyMentions[0]}, -apple-system, sans-serif`, weight: 700 };
  }
  return { pairing: "system-sans", family: DEFAULT_TOKENS.fontFamily, weight: 700 };
}

/** Very small, deliberately conservative color picker — real color
 * science (contrast-aware role assignment) belongs in design-scraper.ts
 * once it has real screenshots to check against; this only decides
 * "does this look like a usable accent" well enough not to pick something
 * broken, and always falls back to DEFAULT_TOKENS.color untouched
 * whenever it isn't confident. */
function pickAccent(colorMentions: string[]): string | undefined {
  const isNeutral = (hex: string) => {
    const h = hex.replace("#", "");
    if (h.length !== 6) return true;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max - min < 18; // low saturation -> probably a gray/bg/text color, not a brand accent
  };
  return colorMentions.find((c) => /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(c) && !isNeutral(c));
}

export function classifySiteSignal(signal: RawSiteSignal): DesignTokens {
  if (signal.classTokens.length < 3 && signal.colorMentions.length === 0 && signal.fontFamilyMentions.length === 0) {
    return DEFAULT_TOKENS;
  }

  const mode: ThemeMode = signal.looksDark ? "dark" : "light";
  const accent = pickAccent(signal.colorMentions) ?? DEFAULT_TOKENS.color.accent;
  const type = classifyTypePairing(signal.fontFamilyMentions);

  const base = mode === "dark"
    ? { bg: "#0B0B0F", surface: "#17171D", text: "#F4F4F5", textMuted: "#A1A1AA", border: "#27272E" }
    : { bg: DEFAULT_TOKENS.color.bg, surface: "#FFFFFF", text: "#18181B", textMuted: "#71717A", border: "#E4E4E7" };

  return {
    mode,
    color: { ...base, accent, accentText: mode === "dark" ? "#0B0B0F" : "#FFFFFF" },
    typePairing: type.pairing,
    fontFamily: type.family,
    headingWeight: type.weight,
    radius: classifyRadiusScale(signal.classTokens),
    buttonVariant: classifyButtonVariant(signal.classTokens),
    cardVariant: classifyCardVariant(signal.classTokens),
    density: classifyDensity(signal.classTokens),
    confidence: "scraped",
  };
}
