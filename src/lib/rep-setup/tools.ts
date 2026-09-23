// src/lib/rep-setup/tools.ts
//
// The tools that add names to Reputation Manager's identity: the same
// booking and email tools Showtime connects (one connection per client,
// shared by every product), plus Whop for product names. Client-safe.

import { SHOWTIME_TOOLS, type SetupTool, type ToolGroupId } from "@/lib/showtime-setup/catalog";

/** What connecting each one adds to the watch list, in a few words. */
export const REP_TOOL_ADDS: Record<string, string> = {
  calendly: "the people who take your calls",
  cal_com: "the people who take your calls",
  ghl_calendar: "your business name, socials and team",
  oncehub: "your booking pages",
  hubspot: "your team and company domain",
  klaviyo: "your sender name and address",
  mailchimp: "your sender name and address",
  ghl: "your business name, socials and team",
  activecampaign: "your sender name and team",
  convertkit: "your sender name",
};

export const REP_TOOLS: SetupTool<ToolGroupId>[] = SHOWTIME_TOOLS.filter((t) => t.needsKey && REP_TOOL_ADDS[t.provider] && !(t.provider === "ghl" && SHOWTIME_TOOLS.some((x) => x.provider === "ghl_calendar")));

/** Whop connects through Whop Agent's own flow (it checks the key's
 * scopes and finds the company), not a pasted key on this screen. */
export const WHOP_PROVIDER = "whop_bot_api_key";
