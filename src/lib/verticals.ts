// src/lib/verticals.ts
//
// The fixed set of offer verticals. Leak Map groups cross-client benchmarks
// by vertical and only shows one once 20 different clients share a group
// (leak-map-benchmarks.ts's K_ANONYMITY_FLOOR), so free text — "coaching",
// "business coaching", "coach" — split what should be one group into
// several that never reach the floor. Every input picks from this list,
// Jev classifies site copy into it, and stored values are these ids.
//
// Draft list: review and adjust the entries before relying on the
// benchmarks. Changing an id later splits its benchmark group, so rename
// labels freely but keep ids stable once in use.

export interface Vertical {
  id: string;
  label: string;
  /** What belongs here — shown to Jev as the choice criteria. */
  description: string;
  /** Common free-text spellings that mean this vertical. */
  aliases: string[];
}

export const VERTICALS: readonly Vertical[] = [
  { id: "b2b_saas", label: "B2B SaaS & software", description: "Software or SaaS sold to businesses.", aliases: ["saas", "b2b saas", "software", "tech", "technology"] },
  { id: "agency", label: "Marketing & creative agency", description: "Agencies selling marketing, advertising, design, web, or lead-gen services to businesses.", aliases: ["agency", "marketing agency", "digital agency", "advertising", "marketing"] },
  { id: "coaching_consulting", label: "Coaching & consulting", description: "Business, executive, life, or career coaching; consulting and advisory offers.", aliases: ["coaching", "business coaching", "coach", "consulting", "consultant", "life coaching"] },
  { id: "info_products", label: "Courses & info products", description: "Online courses, memberships, communities, masterminds, and digital education products.", aliases: ["courses", "online courses", "info products", "education products", "membership", "community"] },
  { id: "professional_services", label: "Professional services", description: "Legal, accounting, bookkeeping, tax, and similar licensed business services.", aliases: ["legal", "law", "accounting", "bookkeeping", "tax"] },
  { id: "financial_services", label: "Financial services & insurance", description: "Wealth management, lending, investing, insurance, and financial advice.", aliases: ["finance", "financial services", "insurance", "wealth management", "investing"] },
  { id: "real_estate", label: "Real estate", description: "Real estate agents, brokerages, investing, and property services.", aliases: ["real estate", "realty", "property"] },
  { id: "home_services", label: "Home services & trades", description: "Roofing, HVAC, plumbing, solar, remodeling, cleaning, and other home or trade services.", aliases: ["home services", "construction", "trades", "roofing", "solar", "hvac"] },
  { id: "health_wellness", label: "Health, fitness & wellness", description: "Fitness, nutrition, weight loss, mental health, and wellness offers.", aliases: ["health", "fitness", "wellness", "nutrition", "health and wellness"] },
  { id: "medical_aesthetics", label: "Medical, dental & aesthetics", description: "Clinics, practices, med spas, dental, and cosmetic treatments.", aliases: ["medical", "dental", "med spa", "aesthetics", "healthcare"] },
  { id: "ecommerce", label: "E-commerce & DTC", description: "Physical products sold online direct to consumers.", aliases: ["ecommerce", "e-commerce", "dtc", "retail"] },
  { id: "recruiting_staffing", label: "Recruiting & staffing", description: "Recruiting, staffing, and hiring services.", aliases: ["recruiting", "staffing", "hr", "recruitment"] },
  { id: "education_training", label: "Education & training", description: "Schools, tutoring, certification, and workforce or corporate training.", aliases: ["education", "training", "tutoring"] },
  { id: "hospitality_events", label: "Hospitality, travel & events", description: "Hotels, restaurants, travel, venues, and event services.", aliases: ["hospitality", "travel", "events", "restaurant"] },
  { id: "nonprofit", label: "Nonprofit", description: "Charities, foundations, and mission-driven nonprofits.", aliases: ["nonprofit", "non-profit", "charity"] },
  { id: "other", label: "Other", description: "Clearly doesn't fit any of the other verticals.", aliases: [] },
];

const BY_ID = new Map(VERTICALS.map((v) => [v.id, v]));

/** The list id for a stored or typed value, or null when it doesn't match
 * one — matches ids, labels, and known aliases, ignoring case. */
export function normalizeVertical(value: string | null | undefined): string | null {
  const text = value?.trim().toLowerCase();
  if (!text) return null;
  for (const v of VERTICALS) {
    if (v.id === text || v.label.toLowerCase() === text || v.aliases.includes(text)) return v.id;
  }
  return null;
}

/** Human label for a stored value; an unmatched legacy value is shown as-is. */
export function verticalLabel(value: string | null | undefined): string {
  if (!value) return "";
  return BY_ID.get(value)?.label ?? BY_ID.get(normalizeVertical(value) ?? "")?.label ?? value;
}

export function isListedVertical(value: string | null | undefined): boolean {
  return !!value && BY_ID.has(value);
}
