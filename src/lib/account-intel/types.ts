// src/lib/account-intel/types.ts

import type { BookingHistory, DealHistory, EmailHistory, EventTypeInfo, QuestionAnswers } from "./analyze";

/** Where each tool's whole pull is kept, one fact per provider. */
export const INTEL_FACT_PREFIX = "accountIntel:";

export interface TeamMember {
  name: string;
  email?: string | null;
  role?: string | null;
}

export interface Automation {
  name: string;
  status?: string | null;
  trigger?: string | null;
}

export interface AudienceList {
  id: string;
  name: string;
  count?: number | null;
}

/** Everything one connected account told us, in one shape for every vendor. */
export interface AccountIntel {
  provider: string;
  pulledAt: string;
  coverage: { read: string[]; blocked: string[]; failed: string[] };
  timeZone?: string | null;
  currency?: string | null;
  business?: { name?: string | null; website?: string | null; email?: string | null; industry?: string | null };
  booking?: {
    history: BookingHistory;
    eventTypes: EventTypeInfo[];
    answers: QuestionAnswers[];
    /** Owner-level ids the booking config needs (Calendly org, Cal.com username). */
    meta?: Record<string, string>;
  };
  deals?: DealHistory;
  pipelineStages?: { pipeline: string; stage: string; closed: boolean }[];
  /** Meetings logged in the CRM with an outcome (HubSpot). */
  meetings?: { total: number; completed: number; noShows: number; canceled: number; noShowRate: number | null };
  contacts?: { total: number | null; addedLast30Days?: number | null; lifecycle?: { stage: string; count: number }[]; sources?: { source: string; count: number }[] };
  email?: EmailHistory;
  sender?: { fromName?: string | null; fromEmail?: string | null; replyTo?: string | null };
  automations?: Automation[];
  lists?: AudienceList[];
  team?: TeamMember[];
  /** Other tools wired into this one (a store, a payment processor). */
  integrations?: string[];
}
