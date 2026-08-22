// The bounded catalog itself. Every function here is hand-written, visually
// checked, mobile-safe CSS — nothing in this file is ever generated. Scraping
// only ever selects a key into these maps; it never writes a CSS value that
// didn't already exist before the crawl ran. This is what "guardrail, not
// generation" means in actual code: the combinatorics (6 button variants x
// 5 card variants x 3 densities x 4 type pairings x arbitrary accent color =
// hundreds of distinguishable outcomes) come from composition, not from
// asking a model to invent layout.
import type { DesignTokens } from "./tokens";

export function buttonCss(t: DesignTokens): string {
  const { accent, accentText, border, text } = t.color;
  const r = t.radius;
  switch (t.buttonVariant) {
    case "solid-pill":
      return `background:${accent};color:${accentText};border:none;border-radius:${r.pill};padding:13px 28px;font-weight:700;`;
    case "solid-rect":
      return `background:${accent};color:${accentText};border:none;border-radius:${r.md};padding:12px 24px;font-weight:700;`;
    case "solid-soft":
      return `background:color-mix(in srgb, ${accent} 14%, ${t.color.surface});color:${accent};border:1px solid color-mix(in srgb, ${accent} 30%, transparent);border-radius:${r.md};padding:12px 24px;font-weight:700;`;
    case "outline-rect":
      return `background:transparent;color:${text};border:1.5px solid ${border};border-radius:${r.md};padding:11px 23px;font-weight:600;`;
    case "outline-pill":
      return `background:transparent;color:${accent};border:1.5px solid ${accent};border-radius:${r.pill};padding:11px 26px;font-weight:600;`;
    case "ghost-underline":
      return `background:transparent;color:${accent};border:none;border-bottom:1.5px solid ${accent};border-radius:0;padding:4px 2px;font-weight:600;`;
  }
}

export function cardCss(t: DesignTokens): string {
  const { surface, border } = t.color;
  const r = t.radius;
  switch (t.cardVariant) {
    case "flat-bordered":
      return `background:${surface};border:1px solid ${border};border-radius:${r.md};box-shadow:none;`;
    case "soft-shadow":
      return `background:${surface};border:1px solid ${border};border-radius:${r.lg};box-shadow:0 8px 24px rgba(0,0,0,0.06);`;
    case "hard-shadow":
      return `background:${surface};border:1.5px solid ${t.color.text};border-radius:${r.md};box-shadow:6px 6px 0 ${t.color.text};`;
    case "glass":
      return `background:color-mix(in srgb, ${surface} 55%, transparent);border:1px solid color-mix(in srgb, ${border} 70%, transparent);border-radius:${r.lg};backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 8px 32px rgba(0,0,0,0.08);`;
    case "borderless-inset":
      return `background:color-mix(in srgb, ${t.color.bg} 60%, ${surface});border:none;border-radius:${r.lg};box-shadow:none;`;
  }
}

export const DENSITY_SPACE: Record<DesignTokens["density"], { section: string; card: string; gap: string }> = {
  compact: { section: "28px", card: "16px 18px", gap: "8px" },
  cozy: { section: "40px", card: "22px 24px", gap: "12px" },
  spacious: { section: "56px", card: "30px 32px", gap: "18px" },
};
