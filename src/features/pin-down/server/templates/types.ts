export type TemplateId =
  | "signal"
  | "ledger"
  | "studio"
  | "grid"
  | "fieldnotes"
  | "contract"
  | "goldenticket"
  | "tentativehold"
  | "assessment"
  | "minimalist";

export const TEMPLATE_IDS: TemplateId[] = [
  "signal",
  "ledger",
  "studio",
  "grid",
  "fieldnotes",
  "contract",
  "goldenticket",
  "tentativehold",
  "assessment",
  "minimalist",
];

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
  contract: {
    id: "contract",
    name: "The Contract",
    tagline: "Ceremonial and precise, an agreement not an ad",
    bestFor: "Premium $10K+ coaching or advisory, gravitas buyers",
    swatch: ["#141119", "#C6A15B", "#F4EFE4"],
  },
  goldenticket: {
    id: "goldenticket",
    name: "The Golden Ticket",
    tagline: "A die-cut stub built for a room that's filling up",
    bestFor: "Workshops, events, cohort or seat-limited registration",
    swatch: ["#151014", "#E8B23D", "#FCEFCF"],
  },
  tentativehold: {
    id: "tentativehold",
    name: "The Tentative Hold",
    tagline: "One honest tap turns a hold into a commitment",
    bestFor: "Agency or done-for-you, needs a confirmation micro-step",
    swatch: ["#EEF1F5", "#2B4C7E", "#1B2733"],
  },
  assessment: {
    id: "assessment",
    name: "The Pre-Call Assessment",
    tagline: "A short self-check that primes the call itself",
    bestFor: "Niche or vertical offers where qualification changes the call",
    swatch: ["#F5F7F5", "#1F6F5C", "#1C2321"],
  },
  minimalist: {
    id: "minimalist",
    name: "The Minimalist Trust",
    tagline: "One quiet line, then out of the way",
    bestFor: "Strong brands, post-optin flows, keeping the lead moving",
    swatch: ["#FFFFFF", "#171717", "#6B6B6B"],
  },
};

export function isTemplateId(value: string | null | undefined): value is TemplateId {
  return !!value && (TEMPLATE_IDS as string[]).includes(value);
}
