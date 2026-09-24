// src/lib/showtime-setup/types.ts
//
// What the Showtime setup screen gets from GET /setup/showtime, and the
// few constants both sides share. Client-safe.

import type { TrustTier } from "@/lib/fact-trust";
import type { SetupToolGroup, ToolGroupId } from "./catalog";

export type { TrustTier };

export interface SetupValue<T = string> {
  value: T | null;
  tier: TrustTier;
  /** client_facts source ("website", "account", "jev", "llm", "user") or
   * "saved" for a value already in this client's config. */
  source: string | null;
  sourceDetail: string | null;
  evidence: string | null;
  confidence: number | null;
}

export interface SavedConnection {
  vaultId: string;
  label: string;
  usedBy: number;
  healthStatus: string;
  /** Jev (or a single saved option) says this is the one for this client. */
  bestMatch: boolean;
}

export interface ToolState {
  provider: string;
  group: SetupToolGroup;
  /** Has a credential attached to this client right now. */
  linked: boolean;
  /** The crawl found this tool's embed or fingerprint on the website. */
  seenOnSite: boolean;
  saved: SavedConnection[];
  /** Jev's answer to "does this connected account belong to the business
   * on the website?". Null when there wasn't enough to check. */
  accountCheck: { matches: boolean; probability: number } | null;
  /** The tool's one extra value (GoHighLevel's Location ID, ActiveCampaign's
   * account URL), when it has one: what's saved for this client, and a name
   * to show for it. value null means it still needs asking. */
  extra?: { value: string | null; display: string | null };
}

export type PickSlot = "target_list_id" | "target_workflow_id" | "recovery_list_id" | "recovery_workflow_id" | "webflow_site_id" | "vercel_project_name";

export interface PickState {
  slot: PickSlot;
  /** stack-options resource the choice comes from. */
  resource: string;
  /** Extra query the resource needs (ActiveCampaign's base URL). */
  resourceParams?: Record<string, string>;
  value: { id: string; name: string } | null;
  tier: TrustTier;
  confidence: number | null;
  /** Jev looked and said none of the real options fits. */
  noneFit: boolean;
  source: "saved" | "jev" | "user" | null;
}

export interface ShowtimeSetupState {
  engagementId: string;
  buyer: string;
  /** Showtime has been saved once for this client. */
  configured: boolean;
  /** Which Showtime skills are on for this client right now. */
  skills: Record<string, boolean>;
  website: {
    domain: string;
    /** When and from which domain the site copy on file was read. */
    readAt: string | null;
    readDomain: string | null;
    /** Jev's check that this is the business's real sales site. */
    siteCheck: { isRealSite: boolean; probability: number } | null;
  };
  offer: {
    operatorName: SetupValue;
    offerName: SetupValue;
    offerPrice: SetupValue;
    offerVertical: SetupValue;
    offerIcp: SetupValue;
    trafficTemperature: SetupValue;
    castingChoice: SetupValue;
    heroVideoUrl: SetupValue;
  };
  platforms: Record<ToolGroupId, SetupValue>;
  choices: {
    smsPlatform: SetupValue;
    adDataPlatform: SetupValue;
    briefLandingDestination: SetupValue;
    slackWebhookUrl: string;
  };
  picks: Partial<Record<PickSlot, PickState>>;
  tools: ToolState[];
  whopPlanOptions: { name?: string; price?: string }[];
  /** A confirmation page the client already has (found on their site or
   * saved), and whether Pin-Down should keep it instead of building one. */
  existingPage: { url: string | null; reuse: boolean };
  /** What the deep crawl pulled for the skills to use. */
  siteReading: {
    testimonials: { quote: string; name?: string; role?: string; company?: string }[];
    faqs: { question: string; answer?: string }[];
    objections: string[];
    objectionsTier: TrustTier;
    socialProfiles: Record<string, string>;
    pagesRead: number;
  };
  /** What the connected tools showed (account-intel), for the review. */
  accountRead: AccountRead;
  preview: {
    designSignal: unknown;
    template: string;
    confirmationPageUrl: string | null;
  };
  /** Pin-Down's inputs the setup never asks for, shown in Show Rate
   * Setup's own settings and saved through PATCH /details (the same
   * route the client details drawer uses). */
  pinDown: PinDownExtras;
}

export interface PinDownExtras {
  template: string;
  animations: boolean;
  /** offerDetails.hybrid_mode_enabled: an AI-written intro per booker. */
  personalizedIntro: boolean;
  prospectMeets: string;
  topCallQuestions: string[];
  topObjections: string[];
  brandVoice: string;
  /** existingProof: the testimonials the page actually shows. The crawl
   * only fills this when it's empty (field-writeback.ts). */
  testimonials: PinDownTestimonial[];
}

export interface PinDownTestimonial {
  name: string;
  role: string;
  company?: string;
  quote: string;
  sourceUrl?: string;
}

/** One line of activation progress, streamed as NDJSON. */
export interface ActivationStep {
  id: string;
  label: string;
  status: "done" | "reused" | "skipped" | "failed";
  detail?: string;
}

export const PICK_SLOT_META: Record<PickSlot, { label: string; stackField: string }> = {
  target_list_id: { label: "Pile-On list", stackField: "target_list_id" },
  target_workflow_id: { label: "Pile-On workflow", stackField: "target_workflow_id" },
  recovery_list_id: { label: "Win-Back list", stackField: "recovery_list_id" },
  recovery_workflow_id: { label: "Win-Back workflow", stackField: "recovery_workflow_id" },
  webflow_site_id: { label: "Webflow site", stackField: "hosting_platform_meta.webflow_site_id" },
  vercel_project_name: { label: "Vercel project", stackField: "hosting_platform_meta.vercel_project_name" },
};

export const PICK_FACT_PREFIX = "pick:";

export interface AccountRead {
  booking: {
    tool: string;
    total: number;
    windowDays: number;
    perWeek: number;
    noShowRate: number | null;
    attendanceKnown: number;
    cancelRate: number | null;
    medianLeadTimeDays: number | null;
    busiestDays: string[];
    busiestHours: string[];
  } | null;
  deals: {
    tool: string;
    total: number;
    winRate: number | null;
    averageWon: number | null;
    medianCycleDays: number | null;
    openValue: number;
    currency: string | null;
  } | null;
  email: {
    tool: string;
    campaigns: number;
    averageOpenRate: number | null;
    perMonth: number | null;
    bestSubjects: { subject: string; openRate: number }[];
  } | null;
  sender: { fromName: string | null; fromEmail: string | null } | null;
  /** What prospects wrote on the booking form, a few per question. */
  prospectWords: { question: string; responses: number; answers: string[] }[];
  brief: {
    summary: string;
    prospectGoals: string[];
    prospectPains: string[];
    prospectConcerns: string[];
    watchOuts: string[];
  } | null;
  briefTier: TrustTier;
  salesCall: { id: string; name: string; url: string | null; tier: TrustTier; evidence: string | null } | null;
  eventTypes: { id: string; name: string; durationMin: number | null }[];
  automations: string[];
  team: string[];
  leadSources: { source: string; count: number }[];
  /** Parts a connection wasn't allowed to read, per tool. */
  blocked: { tool: string; parts: string[] }[];
}
