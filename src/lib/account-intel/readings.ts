// src/lib/account-intel/readings.ts
//
// Making sense of the deep account pull:
//   - which event type is the sales call (matched to the booking link on
//     the site, or the only one, or Jev's pick with its confidence)
//   - one Claude read of the whole business from its own numbers and its
//     prospects' own words, checked by Jev against that same evidence
//     before anything built from it is trusted.

import { askJev, type JevQuestion } from "@/lib/jev";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { getClientFacts, upsertClientFact, type ClientFact } from "@/lib/client-facts";
import { scoreToConfidence } from "@/lib/field-resolvers";
import { matchEventTypeToLink, type BookingHistory, type EventTypeInfo, type QuestionAnswers } from "./analyze";
import { INTEL_FACT_PREFIX } from "./types";
import type { Raw } from "./reader";

const NONE = "__none__";

function usable(f: ClientFact | undefined): f is ClientFact {
  return Boolean(f) && f!.status !== "rejected";
}

function settled(f: ClientFact | undefined): boolean {
  return Boolean(f) && (f!.status === "confirmed" || f!.status === "edited" || f!.status === "rejected");
}

export interface SalesCallEvent {
  provider: string;
  id: string | null;
  name?: string;
  url?: string | null;
  noneFit?: boolean;
}

/** Which event type books the sales call. */
export async function resolveSalesCallEvent(engagementId: string): Promise<SalesCallEvent | null> {
  const facts = await getClientFacts(engagementId);
  if (settled(facts.salesCallEventType)) return (facts.salesCallEventType.value as SalesCallEvent) ?? null;
  if (!usable(facts.bookingEventTypes)) return null;
  const { provider, types } = facts.bookingEventTypes.value as { provider: string; types: EventTypeInfo[] };
  const active = (types ?? []).filter((t) => t.active && t.id);
  if (active.length === 0) return null;

  const store = async (t: EventTypeInfo | null, opts: { source: "account" | "jev"; confidence?: number; evidence: string }) => {
    const value: SalesCallEvent = t ? { provider, id: t.id, name: t.name, url: t.url ?? null } : { provider, id: null, noneFit: true };
    await upsertClientFact(engagementId, "salesCallEventType", value, { source: opts.source, sourceDetail: provider, confidence: opts.confidence, evidence: opts.evidence });
    return value;
  };

  const link = usable(facts.salesCallBookingLink) ? (facts.salesCallBookingLink.value as { url?: string })?.url : null;
  const matched = matchEventTypeToLink(active, link);
  if (matched) return store(matched, { source: "account", evidence: `The event type behind the booking link on the site (${link}).` });
  if (active.length === 1) return store(active[0], { source: "account", evidence: `The only active event type in ${provider}.` });

  const counts = usable(facts.bookingHistory) ? ((facts.bookingHistory.value as BookingHistory).byEventType ?? []) : [];
  const countFor = (t: EventTypeInfo) => counts.find((c) => c.id === t.id || c.name === t.name)?.count ?? 0;
  const options = active.slice(0, 254);
  const criteria: Record<string, string> = {};
  options.forEach((t, i) => {
    const bits = [t.durationMin ? `${t.durationMin} min` : null, `${countFor(t)} bookings in 90 days`, t.questions.length ? `asks: ${t.questions.slice(0, 4).map((q) => q.name).join("; ")}` : null, t.description ? t.description.slice(0, 160) : null];
    criteria[String(i)] = `${t.name} (${bits.filter(Boolean).join(", ")})`;
  });
  criteria[NONE] = "None of these books a sales call.";

  const str = (k: string) => (usable(facts[k]) && typeof facts[k].value === "string" ? (facts[k].value as string) : undefined);
  try {
    const result = await askJev({
      state: { offer: str("offerName"), idealCustomer: str("offerIcp"), bookingLinkOnSite: link ?? undefined },
      questions: {
        salesCall: {
          type: "choice",
          instructions: "Which event type is the sales, strategy or discovery call prospects book before buying? Not onboarding, support, coaching sessions for existing clients, or internal meetings. Pick none if nothing clearly is.",
          criteria,
        },
      },
      reading: { engagementId, purpose: "sales-call-event" },
    });
    const answer = result.answers.salesCall;
    if (!answer || answer.type !== "choice") return null;
    const picked = answer.choice === NONE ? null : options[Number(answer.choice)] ?? null;
    return store(picked, {
      source: "jev",
      confidence: Math.round(answer.confidence * 100),
      evidence: picked ? `Picked by Jev from ${options.length} event types (model ${result.model}).` : `Jev found no sales call among ${options.length} event types (model ${result.model}).`,
    });
  } catch (err) {
    console.warn(`[account-intel] sales-call pick failed for ${engagementId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export interface BusinessRead {
  summary: string;
  salesMotion: string | null;
  prospectGoals: string[];
  prospectPains: string[];
  prospectConcerns: string[];
  emailPatterns: string | null;
  watchOuts: string[];
}

const READ_LEVELS = [
  "Fabricated: the read claims things the evidence doesn't show",
  "Mostly wrong: a few points match the evidence, most are guesses",
  "Mixed: about half is supported by the evidence",
  "Mostly right: nearly everything is supported, with small stretches",
  "Fully right: every statement follows from the numbers and the prospects' own words",
];

function strings(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim()).slice(0, max) : [];
}

/** The evidence a business read is built from: numbers and real words only. */
export function accountDigest(facts: Record<string, ClientFact>): Record<string, unknown> | null {
  const v = (k: string) => (usable(facts[k]) ? facts[k].value : undefined);
  const str = (k: string) => (typeof v(k) === "string" ? (v(k) as string) : undefined);
  const booking = v("bookingHistory") as (BookingHistory & { provider?: string }) | undefined;
  const answers = v("bookingAnswers") as QuestionAnswers[] | undefined;
  const deals = v("dealHistory");
  const email = v("emailHistory");
  if (!booking && !answers?.length && !deals && !email) return null;
  return {
    business: { name: str("operatorName"), offer: str("offerName"), price: str("offerPrice"), idealCustomer: str("offerIcp"), industry: str("offerVertical") },
    bookings: booking
      ? {
          last90Days: booking.total,
          perWeek: booking.perWeek,
          cancelRate: booking.cancelRate,
          noShowRate: booking.noShowRate,
          noShowSample: booking.attendanceKnown,
          medianDaysBookedAhead: booking.medianLeadTimeDays,
          busiestDays: booking.busiestDays,
          busiestHours: booking.busiestHours,
          eventTypes: booking.byEventType.slice(0, 8),
          cancelReasons: booking.cancelReasons,
        }
      : undefined,
    prospectAnswers: answers?.slice(0, 8).map((q) => ({ question: q.question, answers: q.answers.slice(0, 20) })),
    crmMeetings: v("crmMeetings"),
    deals,
    pipelineStages: v("pipelineStages"),
    contacts: v("contactStats"),
    leadSources: v("leadSources"),
    email: email
      ? (({ recentSubjects, bestSubjects, averageOpenRate, averageClickRate, perMonth }: Raw) => ({ recentSubjects, bestSubjects, averageOpenRate, averageClickRate, perMonth }))(email)
      : undefined,
    automations: (v("emailAutomations") as { automations?: { name: string; status?: string }[] } | undefined)?.automations?.slice(0, 30),
    team: (v("salesTeam") as { name: string }[] | undefined)?.map((t) => t.name),
    otherTools: v("connectedIntegrations"),
  };
}

/**
 * One read of the business from its own accounts. Runs again only when a
 * newer pull has landed since the last read, and never over a read a
 * person confirmed or edited.
 */
export async function readBusinessFromAccounts(engagementId: string): Promise<BusinessRead | null> {
  const facts = await getClientFacts(engagementId);
  if (settled(facts.businessBrief)) return null;
  const newestPull = Object.values(facts)
    .filter((f) => f.key.startsWith(INTEL_FACT_PREFIX))
    .reduce((max, f) => Math.max(max, f.updatedAt.getTime()), 0);
  if (facts.businessBrief && facts.businessBrief.updatedAt.getTime() >= newestPull) return facts.businessBrief.value as BusinessRead;

  const digest = accountDigest(facts);
  if (!digest) return null;

  let read: BusinessRead;
  try {
    const result = await callClaudeWithRetry({
      model: MODEL.SYNTHESIS,
      system: `You are reading a business through its own sales tools: its booking history, what its prospects wrote when they booked, its deals, its email campaigns and automations. Write what a sharp new sales ops hire would say after a day in these accounts. Return ONLY a JSON object:
{
  "summary": "3 or 4 plain sentences: what they sell, who books, how they sell, and the numbers that matter most",
  "sales_motion": "one sentence on how a lead becomes a customer here, or null",
  "prospect_goals": ["what prospects say they want, in their own words where possible, most common first"],
  "prospect_pains": ["problems prospects describe"],
  "prospect_concerns": ["worries or hesitations that show up in answers, cancel reasons or lost deals, phrased as a prospect would say them"],
  "email_patterns": "one sentence on what their emails are about and what gets opened, or null",
  "watch_outs": ["up to 3 specific things in the numbers worth fixing, each citing the number"]
}
Rules: use only the evidence. Quote or closely paraphrase prospects; never invent a goal, pain or number. Up to 5 items per list; [] when the evidence has nothing. No preamble, no markdown fences.`,
      userMessage: JSON.stringify(digest).slice(0, 60_000),
      maxTokens: 1800,
    });
    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.summary !== "string" || !parsed.summary.trim()) return null;
    read = {
      summary: parsed.summary.trim(),
      salesMotion: typeof parsed.sales_motion === "string" ? parsed.sales_motion.trim() : null,
      prospectGoals: strings(parsed.prospect_goals, 5),
      prospectPains: strings(parsed.prospect_pains, 5),
      prospectConcerns: strings(parsed.prospect_concerns, 5),
      emailPatterns: typeof parsed.email_patterns === "string" ? parsed.email_patterns.trim() : null,
      watchOuts: strings(parsed.watch_outs, 3),
    };
  } catch (err) {
    console.warn(`[account-intel] business read failed for ${engagementId}:`, err instanceof Error ? err.message : err);
    return null;
  }

  // Jev checks the read against the same evidence before it counts.
  let confidence: number | undefined;
  let model = "";
  try {
    const questions: Record<string, JevQuestion> = {
      read: { type: "score", instructions: "How well is this read of the business supported by the evidence (its numbers and its prospects' own words)?", criteria: READ_LEVELS },
    };
    const result = await askJev({ state: { evidence: digest, read }, questions, reading: { engagementId, purpose: "business-read" } });
    confidence = scoreToConfidence(result.answers.read, READ_LEVELS.length);
    model = result.model;
  } catch (err) {
    console.warn(`[account-intel] Jev check of the business read failed for ${engagementId}:`, err instanceof Error ? err.message : err);
  }

  const opts =
    confidence !== undefined
      ? { source: "jev" as const, sourceDetail: "accountIntel", confidence, evidence: `Read by Claude from the connected accounts, checked against them by Jev (model ${model}).` }
      : { source: "llm" as const, sourceDetail: "accountIntel", evidence: "Read by Claude from the connected accounts; not yet checked." };
  await upsertClientFact(engagementId, "businessBrief", read, opts);
  if (read.prospectConcerns.length) await upsertClientFact(engagementId, "prospectConcerns", read.prospectConcerns, opts);
  return read;
}
