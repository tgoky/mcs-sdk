// src/lib/account-intel/index.ts
//
// The deep account pull. account-harvest.ts and paste-key-harvest.ts read
// who the account is (name, timezone, which platform); this reads what the
// account has done: the calls booked and missed, what prospects wrote, the
// deals won and lost, the emails sent and how they landed, the automations
// already running, the lists, the team. Every connected Showtime tool gets
// it, whether it came in through Composio or a pasted key.
//
// Everything lands in client_facts as account-sourced suggestions (never
// over a value a person confirmed or edited), then readings.ts has Jev and
// Claude make sense of it.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getClientFact, getClientFacts, upsertClientFact } from "@/lib/client-facts";
import { seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { hasCredential, resolveCredential } from "@/lib/credentials";
import { ghlLocationIdOf } from "@/lib/ghl-location";
import { pullCalCom, pullCalendly, pullOnceHub } from "./booking";
import { pullActiveCampaign, pullGhl, pullHubSpot, pullKit, pullKlaviyo, pullMailchimp } from "./crm";
import { INTEL_FACT_PREFIX, type AccountIntel } from "./types";
import { readBusinessFromAccounts, resolveSalesCallEvent } from "./readings";

export { INTEL_FACT_PREFIX, type AccountIntel } from "./types";

/** Tools with a deep pull. GoHighLevel's booking and CRM sides share one. */
export const INTEL_PROVIDERS = ["calendly", "cal_com", "ghl_calendar", "oncehub", "hubspot", "klaviyo", "mailchimp", "activecampaign", "convertkit", "ghl"] as const;
export type IntelProvider = (typeof INTEL_PROVIDERS)[number];

export function isIntelProvider(provider: string): provider is IntelProvider {
  return (INTEL_PROVIDERS as readonly string[]).includes(provider);
}

/** A pull this recent is reused instead of read again. */
const FRESH_FOR_MS = 6 * 60 * 60 * 1000;

async function loadStack(engagementId: string): Promise<Partial<EngagementStack>> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  return ((row?.stack as Partial<EngagementStack> | null) ?? {}) as Partial<EngagementStack>;
}

const ghlLocationId = ghlLocationIdOf;

export async function pullAccountIntel(engagementId: string, provider: IntelProvider, credential: string): Promise<AccountIntel | null> {
  switch (provider) {
    case "calendly":
      return pullCalendly(credential);
    case "cal_com":
      return pullCalCom(credential);
    case "oncehub":
      return pullOnceHub(credential);
    case "hubspot":
      return pullHubSpot(credential);
    case "klaviyo":
      return pullKlaviyo(credential);
    case "mailchimp":
      return pullMailchimp(credential);
    case "convertkit":
      return pullKit(credential);
    case "activecampaign": {
      const base = (await loadStack(engagementId)).activecampaign_base_url;
      return base ? pullActiveCampaign(credential, base) : null;
    }
    case "ghl":
    case "ghl_calendar": {
      const location = ghlLocationId(await loadStack(engagementId));
      return location ? pullGhl(credential, location) : null;
    }
  }
}

const put = (engagementId: string, key: string, value: unknown, provider: string, evidence: string) =>
  upsertClientFact(engagementId, key, value, { source: "account", sourceDetail: provider, evidence });

/** Writes one pull into client_facts. Returns the keys written. */
export async function writeAccountIntel(engagementId: string, intel: AccountIntel): Promise<string[]> {
  const p = intel.provider;
  const written: string[] = [];
  const w = async (key: string, value: unknown, evidence: string) => {
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) return;
    await put(engagementId, key, value, p, evidence);
    written.push(key);
  };

  await w(`${INTEL_FACT_PREFIX}${p}`, intel, "Everything the deep account pull read.");

  const b = intel.booking;
  if (b) {
    if (b.history.total > 0) await w("bookingHistory", { provider: p, ...b.history }, `The last ${b.history.windowDays} days of bookings in ${p}.`);
    await w("bookingEventTypes", { provider: p, types: b.eventTypes }, `Every event type in ${p}.`);
    await w("bookingAnswers", b.answers, `What prospects wrote on the ${p} booking form.`);
    await w(
      "bookingFormSchema",
      b.eventTypes.filter((t) => t.questions.length).map((t) => ({ eventName: t.name, questions: t.questions.map((q) => q.name) })),
      `Booking form questions per event type in ${p}, for Pre-Call Briefs.`
    );
    await w("callHosts", b.history.hosts, `Who took the calls booked in ${p}.`);
    if (b.meta && Object.keys(b.meta).length) await w("bookingAccountMeta", { provider: p, ...b.meta }, `Account ids ${p} needs for bookings.`);
  }

  if (intel.deals && intel.deals.total > 0) await w("dealHistory", { provider: p, ...intel.deals }, `Deals created in the last year in ${p}.`);
  await w("pipelineStages", intel.pipelineStages, `Deal pipeline stages in ${p}.`);
  if (intel.meetings) await w("crmMeetings", { provider: p, ...intel.meetings }, `Meetings logged with an outcome in ${p} in the last 90 days.`);
  if (intel.contacts) await w("contactStats", { provider: p, ...intel.contacts }, `Contacts in ${p}.`);
  if (intel.email && (intel.email.campaigns > 0 || intel.email.recentSubjects.length)) await w("emailHistory", { provider: p, ...intel.email }, `Email campaigns sent from ${p}.`);
  if (intel.sender && (intel.sender.fromName || intel.sender.fromEmail)) await w("emailSender", { provider: p, ...intel.sender }, `Who emails come from in ${p}.`);
  await w("emailAutomations", intel.automations?.length ? { provider: p, automations: intel.automations.slice(0, 60) } : null, `Automations already set up in ${p}.`);
  await w("audienceLists", intel.lists?.length ? { provider: p, lists: intel.lists.slice(0, 60) } : null, `Lists in ${p}.`);
  await w("salesTeam", intel.team?.slice(0, 30), `Users on the ${p} account.`);
  await w("connectedIntegrations", intel.integrations, `Other tools connected to ${p}.`);

  if (intel.timeZone) await w("timezone", intel.timeZone, `${p} account timezone.`);
  if (intel.business?.name) await w("operatorName", intel.business.name, `${p} account name.`);
  if (intel.business?.website) await seedPrimaryDomainFromUrl(engagementId, intel.business.website).catch(() => {});

  await mergeLeadSources(engagementId);
  return written;
}

/** One ranked list of where leads come from, across every pull. */
async function mergeLeadSources(engagementId: string): Promise<void> {
  const facts = await getClientFacts(engagementId);
  const counts = new Map<string, { count: number; from: Set<string> }>();
  const add = (list: unknown, from: string) => {
    if (!Array.isArray(list)) return;
    for (const s of list as { source?: string; count?: number }[]) {
      if (!s?.source) continue;
      const key = s.source.toLowerCase();
      const e = counts.get(key) ?? { count: 0, from: new Set<string>() };
      e.count += s.count ?? 0;
      e.from.add(from);
      counts.set(key, e);
    }
  };
  const v = (key: string) => (facts[key] && facts[key].status !== "rejected" ? (facts[key].value as Record<string, unknown>) : null);
  add(v("bookingHistory")?.sources, "bookings");
  add(v("dealHistory")?.sources, "deals");
  add(v("contactStats")?.sources, "contacts");
  if (counts.size === 0) return;
  const merged = [...counts.entries()].map(([source, e]) => ({ source, count: e.count, from: [...e.from] })).sort((a, b) => b.count - a.count).slice(0, 10);
  await upsertClientFact(engagementId, "leadSources", merged, { source: "account", sourceDetail: "accountIntel", evidence: "Lead sources from booking tracking, deals and contacts." });
}

export interface IntelRun {
  provider: IntelProvider;
  intel: AccountIntel | null;
  reused: boolean;
}

/**
 * Pulls one connected tool for this client, unless a pull from the last
 * few hours is on file (force skips that). Never throws.
 */
export async function runAccountIntel(engagementId: string, provider: IntelProvider, opts: { force?: boolean; credential?: string } = {}): Promise<IntelRun> {
  try {
    if (!opts.force) {
      const prior = await getClientFact(engagementId, `${INTEL_FACT_PREFIX}${provider}`);
      const at = prior && typeof prior.value === "object" ? Date.parse((prior.value as AccountIntel).pulledAt) : NaN;
      if (Number.isFinite(at) && Date.now() - at < FRESH_FOR_MS) return { provider, intel: prior!.value as AccountIntel, reused: true };
    }
    let credential = opts.credential;
    if (!credential) {
      if (!(await hasCredential(engagementId, provider))) return { provider, intel: null, reused: false };
      credential = await resolveCredential(engagementId, provider);
    }
    const intel = await pullAccountIntel(engagementId, provider, credential);
    if (!intel) return { provider, intel: null, reused: false };
    await writeAccountIntel(engagementId, intel);
    return { provider, intel, reused: false };
  } catch (err) {
    console.error(`[account-intel] ${provider} pull failed for ${engagementId}:`, err);
    return { provider, intel: null, reused: false };
  }
}

/** After one or more pulls: pick the sales-call event, read the business. */
export async function runAccountReadings(engagementId: string): Promise<void> {
  await resolveSalesCallEvent(engagementId).catch((err) => console.warn(`[account-intel] sales-call pick failed for ${engagementId}:`, err));
  await readBusinessFromAccounts(engagementId).catch((err) => console.warn(`[account-intel] business read failed for ${engagementId}:`, err));
}

/**
 * Everything that follows connecting a tool for a client: the deep pull
 * (read fresh, since the connection just changed) and the readings, stored
 * as facts for the setup screens to show. Meant for next/server's
 * after(), so the person connecting never waits on it. Never throws.
 */
export async function deepPullAfterConnect(engagementId: string, provider: string, credential?: string): Promise<void> {
  if (!isIntelProvider(provider)) return;
  const run = await runAccountIntel(engagementId, provider, { force: true, credential });
  if (!run.intel) return;
  await runAccountReadings(engagementId);
  // Readings are stored as facts only. They reach config when the person
  // saves a setup or confirms the fact, never from a background pull.
}
