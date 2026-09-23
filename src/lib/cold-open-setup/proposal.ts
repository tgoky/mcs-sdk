// src/lib/cold-open-setup/proposal.ts
//
// One proposed Cold Open setup from everything known about the client:
// what's saved, the website (product, ICPs, sizing, tone), the sending
// platform (past results, the emails and subject lines that got replies,
// mailbox capacity, schedule timezone), the CRM's won deals (who really
// buys) and Jev's campaign matches. Pure: the caller loads the inputs.
//
// A saved value always wins. Live sending is never proposed on.

import type { ClientFact } from "@/lib/client-facts";
import type { TrustTier } from "@/lib/fact-trust";
import type { ColdOpenIcp, ColdOpenSizingBound } from "@/models/schema";
import { validateSubjectPool } from "@/features/cold-open/server/subject-variants";
import { importTouchset, platformSubject, rankSubjects, sendCapacity, suggestDailyVolume, touchsetsFromSteps, voiceFromSteps, type BuyerProfile } from "./analyze";
import type { SenderIntel } from "./sender";
import type { ColdOpenProposal, IcpProposal, Sourced } from "./types";

export interface SavedColdOpen {
  productIdentity: { name: string; url: string; price: string; valueProp: string } | null;
  icps: ColdOpenIcp[];
  sizingBounds: Record<string, ColdOpenSizingBound>;
  voiceProfile: { greeting: string; signOff: string; tone: string } | null;
  subjectVariants: string[];
  bodyVariantPools: Record<string, { subject: string; body1: string; body2: string; body3: string }[]>;
  sendPlatform: { platform: SenderIntel["platform"]; baseUrl?: string } | null;
  campaignMap: Record<string, string>;
  dailySendSettings: { volume: number; localHour: number; timezone?: string; copyMode: "generate" | "upload"; liveSendEnabled: boolean } | null;
}

export interface ProposalInput {
  domain: string | null;
  saved: SavedColdOpen | null;
  facts: Record<string, ClientFact>;
  sender: SenderIntel | null;
  buyers: BuyerProfile | null;
  /** Jev's ICP slug -> campaign id matches, with confidence 0 to 100. */
  campaignMatch: Record<string, { id: string; confidence: number } | null> | null;
  clientTimezone: string | null;
  tierOf: (fact: ClientFact | undefined) => TrustTier;
  platformLabel: (platform: string) => string;
}

const SITE = "your website";
const usable = (f: ClientFact | undefined) => Boolean(f) && f!.status !== "rejected";
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const conf = (c: number): TrustTier => (c >= 75 ? "done" : c >= 45 ? "likely" : "ask");

function sourced(saved: string | undefined, fact: ClientFact | undefined, key: string, tierOf: ProposalInput["tierOf"], fallback?: Sourced<string>): Sourced<string> {
  if (saved?.trim()) return { value: saved.trim(), tier: "done", source: "saved" };
  const v = usable(fact) ? str((fact!.value as Record<string, unknown>)?.[key]) : "";
  if (v) return { value: v, tier: tierOf(fact), source: SITE };
  return fallback ?? { value: "", tier: "ask", source: "" };
}

/** Plain-words evidence for one ICP from who actually bought. */
export function icpEvidence(label: string, buyers: BuyerProfile | null): string | null {
  if (!buyers || buyers.companies === 0) return null;
  const words = new Set(label.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const hits = buyers.industries.filter((i) => i.industry.toLowerCase().split(/[^a-z0-9]+/).some((w) => words.has(w)));
  if (hits.length) {
    const n = hits.reduce((a, b) => a + b.count, 0);
    return `${n} of your ${buyers.companies} won customers are in ${hits.map((h) => h.industry).join(" or ")}`;
  }
  return null;
}

export function buildColdOpenProposal(input: ProposalInput): ColdOpenProposal {
  const { saved, facts, sender, buyers, tierOf } = input;
  const platformName = sender ? input.platformLabel(sender.platform) : null;
  const fromPlatform = platformName ? `your ${platformName} emails` : "";

  // ── Product ──
  const pf = facts.productIdentity;
  const sp = saved?.productIdentity ?? undefined;
  const product = {
    name: sourced(sp?.name, pf, "name", tierOf),
    url: sourced(sp?.url, pf, "url", tierOf, input.domain ? { value: `https://${input.domain}`, tier: "done", source: SITE } : undefined),
    price: sourced(sp?.price, pf, "price", tierOf),
    valueProp: sourced(sp?.valueProp, pf, "valueProp", tierOf),
  };

  // ── ICPs, with sizing from won deals when the site didn't say ──
  const factIcps = usable(facts.icps) && Array.isArray(facts.icps.value) ? (facts.icps.value as ColdOpenIcp[]) : [];
  const factSizing = usable(facts.sizingBounds) ? (facts.sizingBounds.value as Record<string, ColdOpenSizingBound>) : {};
  const icpsFrom = saved?.icps.length ? saved.icps : factIcps;
  const sizing = saved?.icps.length ? saved.sizingBounds : factSizing;
  const icpTier: TrustTier = saved?.icps.length ? "done" : tierOf(facts.icps);
  const icps: IcpProposal[] = icpsFrom.map((i) => {
    const b = sizing[i.slug];
    const fromDeals = !b?.teamSizeMin && !b?.teamSizeMax && buyers?.sweetSpot ? buyers.sweetSpot : null;
    const evidence = [icpEvidence(i.label, buyers), fromDeals ? `${fromDeals.share}% of won customers have ${fromDeals.min}${fromDeals.max ? `-${fromDeals.max}` : "+"} people` : null].filter(Boolean).join(". ");
    return {
      slug: i.slug,
      label: i.label,
      weight: i.weight,
      teamSizeMin: b?.teamSizeMin ?? fromDeals?.min ?? null,
      teamSizeMax: b?.teamSizeMax ?? fromDeals?.max ?? null,
      disqualifyIf: b?.disqualifyIf ?? [],
      tier: icpTier,
      evidence: evidence || null,
    };
  });

  // ── Voice: the greeting and sign-off their sent emails actually use ──
  const vf = facts.voiceProfile;
  const learned = sender ? voiceFromSteps(sender.steps) : { greeting: null, signOff: null };
  const sv = saved?.voiceProfile ?? undefined;
  const voice = {
    greeting: sv?.greeting ? { value: sv.greeting, tier: "done" as const, source: "saved" } : learned.greeting ? { value: learned.greeting, tier: "done" as const, source: fromPlatform } : sourced(undefined, vf, "greeting", tierOf),
    signOff: sv?.signOff ? { value: sv.signOff, tier: "done" as const, source: "saved" } : learned.signOff ? { value: learned.signOff, tier: "done" as const, source: fromPlatform } : sourced(undefined, vf, "signOff", tierOf),
    tone: sourced(sv?.tone, vf, "tone", tierOf),
  };

  // ── Subject lines: saved, else the platform's best first-email subjects
  // that pass Cold Open's own subject rules ──
  let subjects: ColdOpenProposal["subjects"];
  if (saved?.subjectVariants.length) {
    subjects = saved.subjectVariants.map((value) => ({ value, source: "saved", replyRate: null, on: true }));
  } else {
    const ranked = sender ? rankSubjects(sender.steps, sender.campaigns, 20) : [];
    subjects = [];
    for (const s of ranked) {
      const value = platformSubject(s.subject);
      if (!value || validateSubjectPool([value]).some((v) => v.severity === "error" && v.index === 0)) continue;
      subjects.push({ value, source: `${s.campaign} in ${platformName}`, replyRate: s.replyRate, on: subjects.length < 6 });
      if (subjects.length >= 12) break;
    }
  }

  // ── The client's own sequences, when they can be sent as written ──
  const savedPool = saved?.bodyVariantPools?.default ?? [];
  let touchsets: ColdOpenProposal["touchsets"];
  let touchsetsDropped = 0;
  if (savedPool.length) {
    touchsets = savedPool.map((t) => ({ ...t, campaign: "saved", on: true }));
  } else {
    const raw = sender ? touchsetsFromSteps(sender.steps, sender.campaigns, 8) : [];
    touchsets = [];
    for (const t of raw) {
      const ok = importTouchset(t);
      if (ok) touchsets.push({ ...ok, campaign: t.campaign, on: true });
      else touchsetsDropped++;
    }
  }

  // ── Where each ICP's leads go ──
  const names = new Map((sender?.campaigns ?? []).map((c) => [c.id, c.name]));
  const campaignMap: ColdOpenProposal["campaignMap"] = {};
  for (const i of icps) {
    const savedId = saved?.campaignMap[i.slug];
    const match = input.campaignMatch?.[i.slug];
    campaignMap[i.slug] = savedId
      ? { id: savedId, name: names.get(savedId) ?? savedId, tier: "done" }
      : match
        ? { id: match.id, name: names.get(match.id) ?? match.id, tier: conf(match.confidence) }
        : null;
  }

  // ── Daily send: volume within what the mailboxes can carry ──
  const sd = saved?.dailySendSettings;
  const capacity = sender ? sendCapacity(sender.mailboxes) : null;
  const suggested = suggestDailyVolume(capacity);
  const daily = sd
    ? { volume: sd.volume, localHour: sd.localHour, timezone: sd.timezone ?? null, copyMode: sd.copyMode, liveSendEnabled: sd.liveSendEnabled, volumeSource: "saved" }
    : {
        volume: suggested && suggested > 0 ? suggested : 20,
        localHour: 9,
        timezone: sender?.timezone ?? input.clientTimezone,
        copyMode: (touchsets.length >= 2 ? "upload" : "generate") as "upload" | "generate",
        liveSendEnabled: false,
        volumeSource: suggested && suggested > 0 ? `a third of what your ${capacity} a day of mailbox capacity can send, leaving room for follow-ups` : "a careful starting point",
      };

  return {
    product,
    icps,
    voice,
    subjects,
    touchsets,
    touchsetsDropped,
    platform: saved?.sendPlatform?.platform ?? sender?.platform ?? null,
    campaignMap,
    daily,
  };
}
