export type TemplateId = "signal" | "ledger" | "studio" | "grid" | "fieldnotes";

export const TEMPLATE_IDS: TemplateId[] = ["signal", "ledger", "studio", "grid", "fieldnotes"];

export const DEFAULT_TEMPLATE: TemplateId = "signal";

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  tagline: string;
  bestFor: string;
  /** 3 hex swatches used for the small palette chip in the picker —
   * background, accent, ink, in that order. */
  swatch: [string, string, string];
}

// Shown in the template gallery — src/app/dashboard/engagements/new/steps/
// template-picker.tsx reads this to render the grid, and the live preview
// renders the actual template HTML in an iframe alongside it, so this copy
// is orientation only, not a substitute for seeing the real page.
export const TEMPLATE_META: Record<TemplateId, TemplateMeta> = {
  signal: {
    id: "signal",
    name: "Signal",
    tagline: "Dark, confident, built for momentum",
    bestFor: "High-ticket offers, urgency-driven calls",
    swatch: ["#0A0A0B", "#F5A623", "#F4F4F5"],
  },
  ledger: {
    id: "ledger",
    name: "Ledger",
    tagline: "Quiet, professional, built on trust",
    bestFor: "Consulting, agencies, professional services",
    swatch: ["#F7F5F1", "#1B2430", "#1B2430"],
  },
  studio: {
    id: "studio",
    name: "Studio",
    tagline: "Warm and personal, coach-to-client",
    bestFor: "Coaches, creators, personal brands",
    swatch: ["#FCEAE0", "#6B3550", "#3A2E28"],
  },
  grid: {
    id: "grid",
    name: "Grid",
    tagline: "Structured, precise, enterprise-ready",
    bestFor: "B2B SaaS, enterprise sales calls",
    swatch: ["#0F172A", "#38BDF8", "#E2E8F0"],
  },
  fieldnotes: {
    id: "fieldnotes",
    name: "Field Notes",
    tagline: "A well-kept notebook, annotated by hand",
    bestFor: "Educators, researchers, applied-expertise offers",
    swatch: ["#EDE6D6", "#8B5E34", "#2B2620"],
  },
};

export function isTemplateId(value: string | null | undefined): value is TemplateId {
  return !!value && (TEMPLATE_IDS as string[]).includes(value);
}
