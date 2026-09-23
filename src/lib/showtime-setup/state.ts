// src/lib/showtime-setup/state.ts
//
// Everything the Showtime setup screen shows, in one read: what's saved,
// what the crawl, the account pulls and Jev found (each tagged done /
// likely / ask by fact-trust.ts), which tools are connected here or saved
// elsewhere in the workspace, and the account-specific ids Jev picked.
//
// A saved value always wins and reads as done. Otherwise the fact store
// fills in, and its tier says how sure the app is. Nothing here writes to
// the client's config except applyResolvableFacts, which the old dossier
// GET already ran on every open.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { getClientFacts, type ClientFact } from "@/lib/client-facts";
import { getPrimaryDomainForEngagement } from "@/lib/client-profile";
import { hasCredential, listEngagementsUsingVaultCredential, listVaultCredentials } from "@/lib/credentials";
import { showtimeConnectionSuggestions } from "@/lib/derived-suggestions";
import { applyResolvableFacts, type OfferDetails } from "@/lib/field-writeback";
import { factTier } from "@/lib/fact-trust";
import { getEngagementSkillStates } from "@/lib/engagement-skills";
import { SHOWTIME_TOOLS, type ToolGroupId } from "./catalog";
import { showtimePickTargets } from "./picks";
import { INTEL_FACT_PREFIX, type AccountIntel } from "@/lib/account-intel/types";
import type { Raw } from "@/lib/account-intel/reader";
import { findShowtimeTool } from "./catalog";
import { PICK_FACT_PREFIX, type AccountRead, type PickSlot, type PickState, type SetupValue, type ShowtimeSetupState, type ToolState } from "./types";

type Stack = Partial<EngagementStack> & Record<string, unknown>;

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function fromFact(fact: ClientFact | undefined): SetupValue {
  if (!fact || fact.status === "rejected") return { value: null, tier: "ask", source: null, sourceDetail: null, evidence: null, confidence: null };
  return {
    value: typeof fact.value === "string" ? fact.value : fact.value == null ? null : String(fact.value),
    tier: factTier(fact),
    source: fact.status === "confirmed" || fact.status === "edited" ? "user" : fact.source,
    sourceDetail: fact.sourceDetail,
    evidence: fact.evidence,
    confidence: fact.confidence,
  };
}

function saved(value: string): SetupValue {
  return { value, tier: "done", source: "saved", sourceDetail: null, evidence: null, confidence: null };
}

function savedOrFact(savedValue: unknown, fact: ClientFact | undefined): SetupValue {
  return nonEmpty(savedValue) ? saved(savedValue) : fromFact(fact);
}

function suggested(value: string, evidence: string | null, sourceDetail: string | null): SetupValue {
  return { value, tier: "likely", source: "rule", sourceDetail, evidence, confidence: null };
}

function listOf<T>(fact: ClientFact | undefined): T[] {
  return fact && fact.status !== "rejected" && Array.isArray(fact.value) ? (fact.value as T[]) : [];
}

const ASK: SetupValue = { value: null, tier: "ask", source: null, sourceDetail: null, evidence: null, confidence: null };

export async function loadShowtimeSetupState(engagementId: string, workspaceId: string): Promise<ShowtimeSetupState | null> {
  // Same promotion the old dossier GET ran: trusted facts land in config.
  await applyResolvableFacts(engagementId).catch((err) =>
    console.error(`[showtime-setup] applyResolvableFacts failed for ${engagementId}:`, err)
  );

  const [row] = await db
    .select({
      buyer: engagements.buyer,
      stack: engagements.stack,
      offerDetails: engagements.offerDetails,
      castingChoice: engagements.castingChoice,
      confirmationPageUrl: engagements.confirmationPageUrl,
      confirmationPageTemplate: engagements.confirmationPageTemplate,
    })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  if (!row) return null;

  const stack = ((row.stack as Stack | null) ?? {}) as Stack;
  const offer = (row.offerDetails as Partial<OfferDetails> | null) ?? {};
  const facts = await getClientFacts(engagementId);
  const domain = (await getPrimaryDomainForEngagement(engagementId)) ?? stack.buyer_domain ?? "";

  const corpus = facts.rawVoiceCorpus;
  const siteCheckFact = facts.siteCheck?.value as { isRealSite?: boolean; probability?: number } | undefined;

  // ── What the business is ──
  const casting = savedOrFact(row.castingChoice, facts.castingChoice);
  const offerState: ShowtimeSetupState["offer"] = {
    operatorName: fromFact(facts.operatorName),
    offerName: savedOrFact(offer.name, facts.offerName),
    offerPrice: savedOrFact(offer.price, facts.offerPrice),
    offerVertical: savedOrFact(offer.vertical, facts.offerVertical),
    offerIcp: savedOrFact(offer.icp, facts.offerIcp),
    trafficTemperature: savedOrFact(offer.traffic_temperature, facts.trafficTemperature),
    // A visible default the old form already used; shown as "we think".
    castingChoice: casting.value ? casting : { ...ASK, value: "founder_on_camera", tier: "likely", source: "default" },
    heroVideoUrl: savedOrFact(stack.hero_video_id, facts.heroVideoUrl),
  };

  // ── Which tools ──
  const platforms: Record<ToolGroupId, SetupValue> = {
    booking: savedOrFact(stack.booking_platform, facts.bookingPlatform),
    email: savedOrFact(stack.email_platform, facts.emailPlatform),
    hosting: savedOrFact(stack.hosting_platform, facts.hostingPlatform),
  };

  // Without a saved platform, a tool connected to this client is the
  // choice (the account pull would have said so too, but may still be
  // running).
  const tools: ToolState[] = [];
  const vault = await listVaultCredentials(workspaceId);
  for (const t of SHOWTIME_TOOLS) {
    const linked = t.needsKey ? await hasCredential(engagementId, t.provider) : false;
    const savedHere = vault.filter((v) => v.provider === t.provider);
    const matchFact = facts[`vaultMatch:${t.provider}`];
    const savedConnections = await Promise.all(
      savedHere.map(async (v) => ({
        vaultId: v.id,
        label: v.label,
        healthStatus: v.healthStatus,
        usedBy: (await listEngagementsUsingVaultCredential(v.id)).length,
        bestMatch: savedHere.length === 1 || (matchFact?.value === v.id && factTier(matchFact) !== "ask"),
      }))
    );
    // The one that looks like this client's goes first.
    savedConnections.sort((a, b) => Number(b.bestMatch) - Number(a.bestMatch));
    const siteFactKey = t.group === "booking" ? "bookingPlatform" : t.group === "hosting" ? "hostingPlatform" : "siteEmailPlatformHint";
    const siteFact = facts[siteFactKey];
    const check = facts[`accountCheck:${t.provider}`]?.value as { matches?: boolean; probability?: number } | undefined;
    tools.push({
      provider: t.provider,
      group: t.group,
      linked,
      seenOnSite: siteFact?.source === "website" && siteFact.value === t.provider,
      saved: savedConnections,
      accountCheck: check && typeof check.matches === "boolean" ? { matches: check.matches, probability: check.probability ?? 0 } : null,
    });
    if (linked && !platforms[t.group].value) {
      platforms[t.group] = { value: t.provider, tier: "done", source: "account", sourceDetail: t.provider, evidence: "Connected for this client.", confidence: null };
    }
  }

  // ── How the skills behave ──
  // The rule-based suggestions read the stack; before the first save the
  // platforms only exist as facts, so hand them what the screen will save.
  const effectiveStack = {
    ...stack,
    booking_platform: (stack.booking_platform ?? platforms.booking.value ?? undefined) as EngagementStack["booking_platform"],
    email_platform: (stack.email_platform ?? platforms.email.value ?? undefined) as EngagementStack["email_platform"],
  } as Partial<EngagementStack>;
  const rules = await showtimeConnectionSuggestions(engagementId, effectiveStack).catch(() => ({}) as Record<string, { value: unknown; evidence: string | null; sourceDetail: string | null }>);
  const ruleValue = (key: string): SetupValue | null => {
    const r = (rules as Record<string, { value: unknown; evidence: string | null; sourceDetail: string | null }>)[key];
    return r && nonEmpty(r.value) ? suggested(r.value, r.evidence, r.sourceDetail) : null;
  };
  const choices: ShowtimeSetupState["choices"] = {
    smsPlatform: nonEmpty(stack.sms_platform)
      ? saved(stack.sms_platform)
      : ruleValue("smsPlatform") ?? { ...ASK, value: "none", tier: "likely", source: "default", evidence: "Nothing connected here can send SMS yet." },
    adDataPlatform: nonEmpty(stack.ad_data_platform)
      ? saved(stack.ad_data_platform)
      : ruleValue("adDataPlatform") ?? { ...ASK, value: "none", tier: "likely", source: "default", evidence: "No ad-data tool connected." },
    briefLandingDestination: nonEmpty(stack.brief_landing_destination) ? saved(stack.brief_landing_destination) : ruleValue("briefLandingDestination") ?? ASK,
    slackWebhookUrl: typeof stack.slack_webhook_url === "string" ? stack.slack_webhook_url : "",
  };

  // ── Account-specific ids ──
  const picks: Partial<Record<PickSlot, PickState>> = {};
  const hostingMeta = (stack.hosting_platform_meta ?? {}) as Record<string, unknown>;
  const savedPickValue: Record<PickSlot, unknown> = {
    target_list_id: stack.target_list_id,
    recovery_list_id: stack.recovery_list_id,
    recovery_workflow_id: stack.recovery_workflow_id,
    webflow_site_id: hostingMeta.webflow_site_id,
    vercel_project_name: hostingMeta.vercel_project_name,
  };
  for (const target of showtimePickTargets({
    emailPlatform: platforms.email.value,
    hostingPlatform: platforms.hosting.value,
    activecampaignBaseUrl: typeof stack.activecampaign_base_url === "string" ? stack.activecampaign_base_url : null,
  })) {
    const fact = facts[`${PICK_FACT_PREFIX}${target.slot}`];
    const factValue = fact?.value as { id?: string | null; name?: string; resource?: string; noneFit?: boolean } | undefined;
    // A pick scored against a different platform's lists doesn't apply.
    const factApplies = factValue && factValue.resource === target.resource;
    const savedId = savedPickValue[target.slot];
    if (nonEmpty(savedId)) {
      const name = factApplies && factValue.id === savedId && factValue.name ? factValue.name : savedId;
      picks[target.slot] = { slot: target.slot, resource: target.resource, resourceParams: target.params, value: { id: savedId, name }, tier: "done", confidence: null, noneFit: false, source: "saved" };
    } else if (factApplies && fact) {
      const hasPick = nonEmpty(factValue.id);
      picks[target.slot] = {
        slot: target.slot,
        resource: target.resource,
        resourceParams: target.params,
        value: hasPick ? { id: factValue.id as string, name: factValue.name ?? (factValue.id as string) } : null,
        tier: hasPick ? factTier(fact) : "ask",
        confidence: fact.confidence,
        noneFit: !hasPick,
        source: fact.status === "confirmed" || fact.status === "edited" ? "user" : "jev",
      };
    } else {
      picks[target.slot] = { slot: target.slot, resource: target.resource, resourceParams: target.params, value: null, tier: "ask", confidence: null, noneFit: false, source: null };
    }
  }

  const planOptions = facts.whopPlanOptions;
  return {
    engagementId,
    buyer: row.buyer,
    // Saved from this screen (it writes the skill switches) or the old
    // dossier (it required the website and lead warmth).
    configured: Boolean(stack.showtime_setup_saved_at) || Boolean(offer.traffic_temperature && stack.buyer_domain),
    skills: await getEngagementSkillStates(engagementId),
    website: {
      domain,
      readAt: corpus ? corpus.updatedAt.toISOString() : null,
      readDomain: corpus?.sourceDetail ?? null,
      siteCheck:
        siteCheckFact && typeof siteCheckFact.isRealSite === "boolean"
          ? { isRealSite: siteCheckFact.isRealSite, probability: siteCheckFact.probability ?? 0 }
          : null,
    },
    offer: offerState,
    platforms,
    choices,
    picks,
    tools,
    whopPlanOptions:
      !nonEmpty(offer.price) && planOptions && planOptions.status !== "rejected" && Array.isArray(planOptions.value)
        ? (planOptions.value as { name?: string; price?: string }[])
        : [],
    siteReading: {
      testimonials: listOf(facts.siteTestimonials),
      faqs: listOf(facts.siteFaqs),
      objections: listOf(facts.siteObjections),
      objectionsTier: factTier(facts.siteObjections),
      socialProfiles:
        facts.socialProfiles && facts.socialProfiles.status !== "rejected" && typeof facts.socialProfiles.value === "object"
          ? (facts.socialProfiles.value as Record<string, string>)
          : {},
      pagesRead: ((facts.siteCrawl?.value as { pages?: unknown[] } | undefined)?.pages ?? []).length,
    },
    accountRead: accountReadFrom(facts),
    existingPage: {
      url:
        (typeof stack.existing_confirmation_page_url === "string" && stack.existing_confirmation_page_url) ||
        (typeof facts.existingConfirmationPageUrl?.value === "string" && facts.existingConfirmationPageUrl.status !== "rejected"
          ? (facts.existingConfirmationPageUrl.value as string)
          : null),
      reuse: Boolean(stack.existing_confirmation_page_reuse),
    },
    preview: {
      designSignal: facts.designSignal?.value ?? null,
      template: row.confirmationPageTemplate,
      confirmationPageUrl: row.confirmationPageUrl ?? null,
    },
  };
}

function accountReadFrom(facts: Record<string, ClientFact>): AccountRead {
  const v = <T,>(key: string): T | null => (facts[key] && facts[key].status !== "rejected" ? (facts[key].value as T) : null);
  const toolName = (p: string | undefined) => (p ? (findShowtimeTool(p)?.label ?? p) : "");
  const booking = v<Raw>("bookingHistory");
  const deals = v<Raw>("dealHistory");
  const email = v<Raw>("emailHistory");
  const sender = v<Raw>("emailSender");
  const brief = v<Raw>("businessBrief");
  const sales = v<Raw>("salesCallEventType");
  const types = v<{ types?: { id: string; name: string; durationMin?: number | null; active?: boolean }[] }>("bookingEventTypes");
  const answers = v<{ question: string; responses: number; answers: string[] }[]>("bookingAnswers") ?? [];
  const autos = v<{ automations?: { name: string; status?: string | null }[] }>("emailAutomations");
  const team = v<{ name: string }[]>("salesTeam") ?? [];
  const sources = v<{ source: string; count: number }[]>("leadSources") ?? [];
  const blocked = Object.values(facts)
    .filter((f) => f.key.startsWith(INTEL_FACT_PREFIX) && f.status !== "rejected")
    .map((f) => ({ tool: toolName(f.key.slice(INTEL_FACT_PREFIX.length)), parts: ((f.value as AccountIntel).coverage?.blocked ?? []) as string[] }))
    .filter((b) => b.parts.length > 0);
  return {
    booking: booking
      ? {
          tool: toolName(booking.provider),
          total: booking.total ?? 0,
          windowDays: booking.windowDays ?? 90,
          perWeek: booking.perWeek ?? 0,
          noShowRate: booking.noShowRate ?? null,
          attendanceKnown: booking.attendanceKnown ?? 0,
          cancelRate: booking.cancelRate ?? null,
          medianLeadTimeDays: booking.medianLeadTimeDays ?? null,
          busiestDays: booking.busiestDays ?? [],
          busiestHours: booking.busiestHours ?? [],
        }
      : null,
    deals: deals
      ? {
          tool: toolName(deals.provider),
          total: deals.total ?? 0,
          winRate: deals.winRate ?? null,
          averageWon: deals.averageWon ?? null,
          medianCycleDays: deals.medianCycleDays ?? null,
          openValue: deals.openValue ?? 0,
          currency: deals.currency ?? null,
        }
      : null,
    email: email
      ? { tool: toolName(email.provider), campaigns: email.campaigns ?? 0, averageOpenRate: email.averageOpenRate ?? null, perMonth: email.perMonth ?? null, bestSubjects: email.bestSubjects ?? [] }
      : null,
    sender: sender && (sender.fromName || sender.fromEmail) ? { fromName: sender.fromName ?? null, fromEmail: sender.fromEmail ?? null } : null,
    prospectWords: answers.slice(0, 4).map((q) => ({ question: q.question, responses: q.responses, answers: q.answers.slice(0, 6) })),
    brief:
      brief && typeof brief.summary === "string"
        ? {
            summary: brief.summary,
            prospectGoals: brief.prospectGoals ?? [],
            prospectPains: brief.prospectPains ?? [],
            prospectConcerns: brief.prospectConcerns ?? [],
            watchOuts: brief.watchOuts ?? [],
          }
        : null,
    briefTier: factTier(facts.businessBrief),
    salesCall:
      sales && sales.id
        ? { id: String(sales.id), name: String(sales.name ?? "Event"), url: sales.url ?? null, tier: factTier(facts.salesCallEventType), evidence: facts.salesCallEventType?.evidence ?? null }
        : null,
    eventTypes: (types?.types ?? []).filter((t) => t.active !== false).map((t) => ({ id: t.id, name: t.name, durationMin: t.durationMin ?? null })),
    automations: (autos?.automations ?? []).map((a) => a.name).slice(0, 40),
    team: team.map((t) => t.name).slice(0, 20),
    leadSources: sources.slice(0, 6),
    blocked,
  };
}
