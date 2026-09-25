// src/lib/rep-setup/proposal.ts
//
// One proposed identity for Reputation Manager, built from everything
// already known about this client: what's saved, the website crawl (name,
// founder, socials, offers, press, contact emails, brands, competitors,
// same-name lookalikes), the connected tools' account reads (booking
// hosts, sender name and address, business name and website), Whop plans,
// the Google listing setup found, and Jev's decisions on the uncertain
// ones. Pure: the caller loads the inputs.
//
// Every name here becomes a search the watches run, so the rule is: a
// saved value always wins; a candidate from a tool or the site is shown
// with where it came from, and on by default only when we're sure enough.

import type { ClientFact } from "@/lib/client-facts";
import type { RepCollision, RepEntity, RepGoogleListing, RepOffering, RepCompetitor } from "@/models/schema";
import type { TrustTier } from "@/lib/fact-trust";
import { WEB_COMPETITORS_FACT, type WebCompetitor } from "./types";
import type { RepCollisionProposal, RepEntityProposal, RepItem, RepProposal } from "./types";

export interface SavedGraph {
  operatorName: string;
  operatorAliases: string[];
  operatorHandles: Record<string, string>;
  operatorDomains: string[];
  operatorEmailContacts: string[];
  entities: RepEntity[];
  offerings: RepOffering[];
  competitors: RepCompetitor[];
  collisions: RepCollision[];
  trustedSources: string[];
  seedPanelPrompts: string[];
  soleAuthorityName: string;
  googleListing?: RepGoogleListing | null;
}

export interface Decision {
  keep: boolean;
  confidence: number;
}

/** Jev's calls on the uncertain candidates, keyed by lower-cased value. */
export interface RepDecisions {
  aliases?: Record<string, Decision>;
  domains?: Record<string, Decision>;
  /** keep = it really is a different party people could confuse with this client. */
  collisions?: Record<string, Decision>;
  /** keep = a main brand prospects know them by (searched daily). */
  priority?: Record<string, Decision>;
}

export interface ProposalInput {
  buyer: string;
  primaryDomain: string | null;
  saved: SavedGraph | null;
  facts: Record<string, ClientFact>;
  decisions: RepDecisions | null;
  tierOf: (fact: ClientFact | undefined) => TrustTier;
  /** Provider id -> plain label ("calendly" -> "Calendly"). */
  toolLabel: (provider: string) => string;
}

const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|pm|gmx|zoho|zohomail|yandex|mail|hey)\.[a-z.]+$/i;
const NO_REPLY = /^(no-?reply|do-?not-?reply|mailer-daemon|bounce)/i;

export function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  try {
    return new URL(v.startsWith("http") ? v : `https://${v}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function emailDomain(email: string | null | undefined): string | null {
  const m = email?.trim().toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m) return null;
  // Sending subdomains (mail.acme.com, send.acme.com) belong to the root.
  const parts = m[1].split(".");
  const root = parts.length > 2 && /^(mail|email|send|em|e|news|m|mg|mailer|info|hello)$/.test(parts[0]) ? parts.slice(1).join(".") : m[1];
  return FREE_MAIL.test(root) ? null : root;
}

/** X watch reads operatorHandles["x"]; the crawl calls it "twitter". */
export function normalizeHandles(map: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, raw] of Object.entries(map ?? {})) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const platform = k.toLowerCase() === "twitter" ? "x" : k.toLowerCase();
    let handle = raw.trim();
    // A profile URL becomes its handle for the handle-based watches.
    if (/^https?:\/\//i.test(handle) && (platform === "x" || platform === "instagram" || platform === "tiktok")) {
      try {
        handle = `@${new URL(handle).pathname.split("/").filter(Boolean)[0] ?? ""}`;
      } catch {
        // keep as given
      }
    }
    if (platform === "x" || platform === "instagram" || platform === "tiktok") handle = `@${handle.replace(/^@+/, "")}`;
    if (handle === "@") continue;
    out[platform] = handle;
  }
  return out;
}

function decisionTier(d: Decision | undefined, fallback: TrustTier): TrustTier {
  if (!d) return fallback;
  if (!d.keep) return "ask";
  return d.confidence >= 75 ? "done" : d.confidence >= 45 ? "likely" : "ask";
}

/** Collects candidates by lower-cased value, merging their sources. */
class Bag {
  private items = new Map<string, { value: string; sources: Set<string>; tier: TrustTier }>();
  add(value: string | null | undefined, source: string, tier: TrustTier) {
    const v = value?.trim();
    if (!v || v.length > 200) return;
    const key = v.toLowerCase();
    const cur = this.items.get(key);
    const rank = (t: TrustTier) => (t === "done" ? 2 : t === "likely" ? 1 : 0);
    if (cur) {
      cur.sources.add(source);
      if (rank(tier) > rank(cur.tier)) cur.tier = tier;
    } else {
      this.items.set(key, { value: v, sources: new Set([source]), tier });
    }
  }
  has(value: string) {
    return this.items.has(value.trim().toLowerCase());
  }
  list(opts: { decisions?: Record<string, Decision>; savedKeys?: Set<string>; max?: number } = {}): RepItem[] {
    return [...this.items.entries()]
      .map(([key, it]) => {
        const saved = opts.savedKeys?.has(key) ?? false;
        const tier = saved ? "done" : decisionTier(opts.decisions?.[key], it.tier);
        return { value: it.value, sources: [...it.sources], tier, on: saved || tier !== "ask" };
      })
      .slice(0, opts.max ?? 40);
  }
}

const usable = (f: ClientFact | undefined) => Boolean(f) && f!.status !== "rejected";
const strList = (f: ClientFact | undefined): string[] =>
  usable(f) && Array.isArray(f!.value) ? (f!.value as unknown[]).map((v) => (typeof v === "string" ? v : (v as { name?: string })?.name)).filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];

interface IntelLike {
  provider: string;
  business?: { name?: string | null; website?: string | null; email?: string | null };
  sender?: { fromName?: string | null; fromEmail?: string | null; replyTo?: string | null };
  booking?: { history?: { hosts?: { name: string; count: number }[]; total?: number } };
}

function intelFacts(facts: Record<string, ClientFact>): IntelLike[] {
  return Object.values(facts)
    .filter((f) => f.key.startsWith("accountIntel:") && usable(f) && f.value && typeof f.value === "object")
    .map((f) => f.value as IntelLike);
}

/** Hosts who took a real share of calls: the names people actually meet. */
export function notableHosts(hosts: { name: string; count: number }[] | undefined, total: number | undefined): string[] {
  const all = hosts ?? [];
  const sum = total || all.reduce((n, h) => n + h.count, 0);
  return all.filter((h) => h.count >= 3 && (sum === 0 || h.count / sum >= 0.15)).map((h) => h.name).slice(0, 4);
}

export function buildRepProposal(input: ProposalInput): RepProposal {
  const { facts, saved, tierOf, toolLabel } = input;
  const d = input.decisions ?? {};
  const SITE = "your website";

  // ── Name ──
  const nameFact = facts.operatorName;
  const operatorName = saved?.operatorName?.trim()
    ? { value: saved.operatorName.trim(), tier: "done" as const, source: "saved" }
    : usable(nameFact) && typeof nameFact.value === "string" && nameFact.value.trim()
      ? { value: nameFact.value.trim(), tier: tierOf(nameFact), source: nameFact.source === "account" ? toolLabel(nameFact.sourceDetail ?? "") || "a connected tool" : SITE }
      : { value: input.buyer, tier: "likely" as const, source: "the client name" };
  const nameKey = operatorName.value.toLowerCase();

  const intel = intelFacts(facts);
  const founder = usable(facts.founder) ? (facts.founder.value as { name?: string | null; role?: string | null }) : null;

  // ── Aliases: other names people use for the business or its people ──
  const aliases = new Bag();
  for (const a of saved?.operatorAliases ?? []) aliases.add(a, "saved", "done");
  if (founder?.name) aliases.add(founder.name, SITE, "likely");
  for (const i of intel) {
    const label = toolLabel(i.provider);
    if (i.business?.name && i.business.name.toLowerCase() !== nameKey) aliases.add(i.business.name, label, "likely");
    if (i.sender?.fromName && i.sender.fromName.toLowerCase() !== nameKey) aliases.add(i.sender.fromName, label, "likely");
    for (const h of notableHosts(i.booking?.history?.hosts, i.booking?.history?.total)) aliases.add(h, label, "likely");
  }
  const savedAliasKeys = new Set((saved?.operatorAliases ?? []).map((a) => a.toLowerCase()));

  // ── Domains ──
  const domains = new Bag();
  for (const dm of saved?.operatorDomains ?? []) domains.add(hostOf(dm), "saved", "done");
  domains.add(hostOf(input.primaryDomain), SITE, "done");
  for (const i of intel) {
    const label = toolLabel(i.provider);
    domains.add(hostOf(i.business?.website), label, "likely");
    domains.add(emailDomain(i.sender?.fromEmail), label, "likely");
  }
  const listing = saved?.googleListing ?? (usable(facts.googleListing) ? (facts.googleListing.value as RepGoogleListing) : null);
  if (listing?.site) domains.add(hostOf(listing.site), "your Google listing", "likely");
  const savedDomainKeys = new Set((saved?.operatorDomains ?? []).map((x) => hostOf(x) ?? x.toLowerCase()));

  // ── Contact emails ──
  const emails = new Bag();
  for (const e of saved?.operatorEmailContacts ?? []) emails.add(e, "saved", "done");
  const contact = usable(facts.contactInfo) ? (facts.contactInfo.value as { emails?: string[] }) : null;
  for (const e of contact?.emails ?? []) if (!NO_REPLY.test(e)) emails.add(e.toLowerCase(), SITE, "likely");
  for (const i of intel) {
    // The business's own address on the account, then who its mail goes out as.
    for (const e of [i.business?.email, i.sender?.fromEmail, i.sender?.replyTo]) if (e && !NO_REPLY.test(e)) emails.add(e.toLowerCase(), toolLabel(i.provider), "likely");
  }

  // ── Handles ──
  const handleMap = new Map<string, { handle: string; sources: Set<string>; tier: TrustTier }>();
  const addHandles = (map: Record<string, string> | null | undefined, source: string, tier: TrustTier) => {
    for (const [platform, handle] of Object.entries(normalizeHandles(map))) {
      const cur = handleMap.get(platform);
      if (!cur) handleMap.set(platform, { handle, sources: new Set([source]), tier });
      else if (cur.handle.toLowerCase() === handle.toLowerCase()) cur.sources.add(source);
    }
  };
  addHandles(saved?.operatorHandles, "saved", "done");
  if (usable(facts.socialProfiles)) addHandles(facts.socialProfiles.value as Record<string, string>, SITE, "done");
  if (usable(facts.operatorHandles) && !Array.isArray(facts.operatorHandles.value)) {
    const f = facts.operatorHandles;
    addHandles(f.value as Record<string, string>, f.source === "account" ? toolLabel(f.sourceDetail ?? "") : SITE, tierOf(f));
  }

  // ── Brands (entities): the business itself first, then what the site names ──
  const entities: RepEntityProposal[] = [];
  const seenEntity = new Set<string>();
  const pushEntity = (e: RepEntityProposal) => {
    const k = e.value.toLowerCase();
    if (seenEntity.has(k)) return;
    seenEntity.add(k);
    entities.push(e);
  };
  if (saved?.entities?.length) {
    for (const e of saved.entities) pushEntity({ value: e.name, type: e.type, highPriority: e.highPriority, sources: ["saved"], tier: "done", on: true });
  } else {
    pushEntity({ value: operatorName.value, type: "company", highPriority: true, sources: [operatorName.source], tier: operatorName.tier, on: true });
    const tier = tierOf(facts.entities);
    for (const name of strList(facts.entities).slice(0, 10)) {
      const pd = d.priority?.[name.toLowerCase()];
      pushEntity({ value: name, type: "brand", highPriority: Boolean(pd?.keep && pd.confidence >= 60), sources: [SITE], tier, on: tier !== "ask" });
    }
  }

  // ── Offerings: products and programs people complain about by name ──
  const offerings = new Bag();
  for (const o of saved?.offerings ?? []) offerings.add(o.name, "saved", "done");
  if (!saved?.offerings?.length) {
    if (usable(facts.offerName) && typeof facts.offerName.value === "string") offerings.add(facts.offerName.value, SITE, tierOf(facts.offerName));
    for (const t of strList(facts.offerTiers).slice(0, 8)) offerings.add(t, SITE, "likely");
    for (const p of strList(facts.whopPlanOptions).slice(0, 8)) offerings.add(p, "Whop", "likely");
  }

  // ── Competitors, lookalikes, press, AI questions ──
  const competitors = new Bag();
  if (saved?.competitors?.length) for (const c of saved.competitors) competitors.add(c.name, "saved", "done");
  else {
    for (const c of strList(facts.competitors).slice(0, 7)) competitors.add(c, SITE, tierOf(facts.competitors));
    // Found by web search and checked one by one (competitor-search.ts): each
    // name carries its own confidence, so one weak match doesn't pass as sure.
    const web = facts[WEB_COMPETITORS_FACT];
    if (usable(web) && Array.isArray(web.value)) {
      for (const c of web.value as WebCompetitor[]) if (c?.name) competitors.add(c.name, "the web", c.confidence === null ? "ask" : decisionTier({ keep: true, confidence: c.confidence }, "ask"));
    }
  }

  const collisions: RepCollisionProposal[] = saved?.collisions?.length
    ? saved.collisions.map((c) => ({ ...c, tier: "done" as const, on: true }))
    : usable(facts.collisions) && Array.isArray(facts.collisions.value)
      ? (facts.collisions.value as { name?: string; whoTheyAre?: string; domain?: string; disambiguationNote?: string }[])
          .filter((c) => c?.name)
          .map((c) => {
            const decision = d.collisions?.[c.name!.toLowerCase()];
            const tier = decisionTier(decision, "ask");
            return {
              name: c.name!,
              whoTheyAre: c.whoTheyAre || (c.domain ? `Runs ${c.domain}` : "A different business with a similar name"),
              disambiguationNote: c.disambiguationNote || `Not ${operatorName.value}${input.primaryDomain ? ` (${hostOf(input.primaryDomain)})` : ""}.`,
              tier,
              on: tier !== "ask",
            };
          })
          .slice(0, 8)
      : [];

  const press = new Bag();
  if (saved?.trustedSources?.length) for (const t of saved.trustedSources) press.add(t, "saved", "done");
  else for (const p of strList(facts.pressMentions).slice(0, 10)) press.add(p, SITE, "likely");

  const prompts = new Bag();
  if (saved?.seedPanelPrompts?.length) for (const p of saved.seedPanelPrompts) prompts.add(p, "saved", "done");
  else for (const p of strList(facts.seedPanelPrompts).slice(0, 8)) prompts.add(p, SITE, tierOf(facts.seedPanelPrompts));

  const savedCompetitorKeys = new Set((saved?.competitors ?? []).map((c) => c.name.toLowerCase()));

  return {
    operatorName,
    aliases: aliases.list({ decisions: d.aliases, savedKeys: savedAliasKeys, max: 12 }).filter((a) => a.value.toLowerCase() !== nameKey),
    domains: domains.list({ decisions: d.domains, savedKeys: savedDomainKeys, max: 8 }),
    emailContacts: emails.list({ max: 6 }),
    handles: [...handleMap.entries()].map(([platform, h]) => ({ platform, handle: h.handle, sources: [...h.sources], tier: h.tier, on: h.tier !== "ask" })),
    entities,
    offerings: offerings.list({ max: 10 }),
    competitors: competitors.list({ savedKeys: savedCompetitorKeys, max: 10 }),
    collisions,
    trustedSources: press.list({ max: 10 }),
    seedPrompts: prompts.list({ max: 8 }),
    soleAuthority: {
      saved: saved?.soleAuthorityName?.trim() || null,
      suggestion: founder?.name ? { name: founder.name, role: founder.role ?? null, source: SITE } : null,
    },
    googleListing: listing ? { listing, saved: Boolean(saved?.googleListing) } : null,
  };
}
