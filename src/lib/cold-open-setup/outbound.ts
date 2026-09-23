// src/lib/cold-open-setup/outbound.ts
//
// The screen's summary of a sending platform read: results per campaign,
// mailbox capacity, and whether each sending domain's SPF, DKIM and DMARC
// are in place.

import { validateDomainLive } from "@/features/cold-open/server/dns-validator";
import { mailboxDomains, overallReplyRate, replyRate, sendCapacity, suggestDailyVolume } from "./analyze";
import type { SenderIntel } from "./sender";
import type { Outbound } from "./types";

/** Webmail domains aren't the client's to fix. */
const SHARED_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "aol.com", "proton.me", "protonmail.com"]);
const MAX_DOMAIN_CHECKS = 6;

export async function summarizeOutbound(intel: SenderIntel, checkDomain = validateDomainLive): Promise<Outbound> {
  const capacity = sendCapacity(intel.mailboxes);
  const domains = mailboxDomains(intel.mailboxes).filter((d) => !SHARED_DOMAINS.has(d)).slice(0, MAX_DOMAIN_CHECKS);
  const checks = await Promise.all(
    domains.map(async (domain) => {
      const gaps = (await checkDomain(domain)).filter((g) => g.severity === "warn");
      return { domain, ok: gaps.length === 0, problems: gaps.map((g) => g.message) };
    })
  );
  return {
    platform: intel.platform,
    pulledAt: intel.pulledAt,
    campaigns: intel.campaigns
      .map((c) => ({ id: c.id, name: c.name, sent: c.sent, replyRate: replyRate(c) }))
      .sort((a, b) => (b.replyRate ?? -1) - (a.replyRate ?? -1) || (b.sent ?? 0) - (a.sent ?? 0)),
    overallReplyRate: overallReplyRate(intel.campaigns),
    mailboxes: intel.mailboxes.map((m) => ({ email: m.email, fromName: m.fromName, dailyLimit: m.dailyLimit, health: m.health, broken: m.broken })),
    capacity,
    suggestedVolume: suggestDailyVolume(capacity),
    domains: checks,
    timezone: intel.timezone,
    blocked: intel.coverage.blocked,
  };
}
