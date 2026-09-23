// src/lib/rep-setup/types.ts
//
// What the Reputation Manager setup screen gets from GET /setup/rep.
// Client-safe.

import type { TrustTier } from "@/lib/fact-trust";
import type { RepGoogleListing } from "@/models/schema";
import type { ToolState } from "@/lib/showtime-setup/types";

export type { TrustTier, RepGoogleListing };

/** One proposed value, where it came from, and how sure we are. */
export interface RepItem {
  value: string;
  /** Plain-words origins: "your website", "Calendly", "Klaviyo"... */
  sources: string[];
  tier: TrustTier;
  /** On by default in the review (a person can switch it). */
  on: boolean;
}

export interface RepEntityProposal extends RepItem {
  type: "company" | "brand" | "product" | "service" | "publication";
  highPriority: boolean;
}

export interface RepCollisionProposal {
  name: string;
  whoTheyAre: string;
  disambiguationNote: string;
  tier: TrustTier;
  on: boolean;
}

export interface RepProposal {
  operatorName: { value: string; tier: TrustTier; source: string };
  aliases: RepItem[];
  domains: RepItem[];
  emailContacts: RepItem[];
  /** platform -> handle ("x", "instagram", "linkedin"...). */
  handles: { platform: string; handle: string; sources: string[]; tier: TrustTier; on: boolean }[];
  entities: RepEntityProposal[];
  offerings: RepItem[];
  competitors: RepItem[];
  collisions: RepCollisionProposal[];
  trustedSources: RepItem[];
  seedPrompts: RepItem[];
  /** Never pre-filled: the founder (or whoever the site names) is only a
   * suggestion a person has to confirm. */
  soleAuthority: { saved: string | null; suggestion: { name: string; role: string | null; source: string } | null };
  googleListing: { listing: RepGoogleListing; saved: boolean } | null;
}

export interface FirstLook {
  at: string;
  google: { rating: number | null; reviews: number | null; oneStar: number | null; unansweredNegative: number; recentNegative: { text: string; rating: number; url: string | null }[] } | null;
  trustpilot: { rating: number | null; reviews: number | null } | null;
  reddit: { mentions: number; negative: number } | null;
  x: { mentions: number; negative: number } | null;
  news: { articles: number; negative: number; top: { title: string; url: string }[] } | null;
  search: { query: string; results: { title: string; url: string; position: number; risky: boolean }[] } | null;
  engines: { engine: string; sentiment: "positive" | "neutral" | "negative"; excerpt: string; flagged: boolean }[];
  /** Parts that couldn't run (no key configured, or the call failed). */
  skipped: string[];
}

export interface RepSetupState {
  engagementId: string;
  buyer: string;
  configured: boolean;
  skills: Record<string, boolean>;
  website: { domain: string | null; readAt: string | null };
  /** This client's tools that add names: connected here (for any product),
   * or saved elsewhere in the workspace. Same shape as Showtime's. */
  tools: ToolState[];
  whop: { linked: boolean; connectHref: string };
  proposal: RepProposal;
  firstLook: FirstLook | null;
  engines: { active: string[] | null; available: string[] };
  crisisThreshold: number | null;
  operatorPagePhone: string | null;
}
