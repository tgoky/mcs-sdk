// src/lib/cold-open-setup/types.ts
//
// What the Cold Open setup screen gets from GET /setup/cold-open.
// Client-safe.

import type { TrustTier } from "@/lib/fact-trust";
import type { ColdOpenSendPlatformId } from "@/models/schema";
import type { ToolState } from "@/lib/showtime-setup/types";
import type { BuyerProfile, Touchset } from "./analyze";

export type { TrustTier, BuyerProfile, Touchset };

export interface Sourced<T> {
  value: T;
  tier: TrustTier;
  source: string;
}

export interface IcpProposal {
  slug: string;
  label: string;
  weight: number;
  teamSizeMin: number | null;
  teamSizeMax: number | null;
  disqualifyIf: string[];
  tier: TrustTier;
  /** Plain-words evidence, e.g. "12 of your won deals are in Marketing". */
  evidence: string | null;
}

export interface Outbound {
  platform: ColdOpenSendPlatformId;
  pulledAt: string;
  campaigns: { id: string; name: string; sent: number | null; replyRate: number | null }[];
  overallReplyRate: number | null;
  mailboxes: { email: string; fromName: string | null; dailyLimit: number | null; health: number | null; broken: boolean }[];
  capacity: number | null;
  suggestedVolume: number | null;
  domains: { domain: string; ok: boolean; problems: string[] }[];
  timezone: string | null;
  /** Parts of the account the key couldn't read. */
  blocked: string[];
}

export interface ColdOpenProposal {
  product: { name: Sourced<string>; url: Sourced<string>; price: Sourced<string>; valueProp: Sourced<string> };
  icps: IcpProposal[];
  voice: { greeting: Sourced<string>; signOff: Sourced<string>; tone: Sourced<string> };
  subjects: { value: string; source: string; replyRate: number | null; on: boolean }[];
  /** The client's own proven sequences, safe to send as written. */
  touchsets: (Touchset & { campaign: string; on: boolean })[];
  /** Past sequences left out because they use fields we can't fill. */
  touchsetsDropped: number;
  platform: ColdOpenSendPlatformId | null;
  campaignMap: Record<string, { id: string; name: string; tier: TrustTier } | null>;
  daily: { volume: number; localHour: number; timezone: string | null; copyMode: "generate" | "upload"; liveSendEnabled: boolean; volumeSource: string };
}

export interface ColdOpenSetupState {
  engagementId: string;
  buyer: string;
  configured: boolean;
  skills: Record<string, boolean>;
  website: { domain: string | null; readAt: string | null };
  /** Sending platforms and HubSpot (one connection per client, shared by every product). */
  tools: ToolState[];
  /** CRM connected for any product: won deals say who really buys. */
  crm: { provider: string; label: string } | null;
  outbound: Outbound | null;
  buyers: BuyerProfile | null;
  proposal: ColdOpenProposal;
  leadSources: { icp: string; rows: number }[];
}
