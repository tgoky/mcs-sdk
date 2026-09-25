// src/lib/showtime-setup/jev-setup.ts
//
// The Jev questions behind "we already did the work". Jev only ever picks
// from options it's handed (a real list from the client's own account, a
// saved connection's label, yes/no), so everything here is a choice among
// things that exist, never an invented value. Each answer is stored as a
// client_facts row with Jev's confidence, and fact-trust.ts decides whether
// the setup screen shows it as done, "we think", or a question.
//
// Every function here degrades to "nothing found" on any error (no key,
// vendor down, Jev unreachable): a failed pick leaves the slot for the
// person to choose, it never blocks activation.

import { askJev, type JevQuestion } from "@/lib/jev";
import { getClientFact, getClientFacts, upsertClientFact } from "@/lib/client-facts";
import { hasCredential, resolveCredential } from "@/lib/credentials";
import { fetchStackOptions, type StackOption } from "@/lib/stack-options";
import type { PickTarget } from "./picks";
import { PICK_FACT_PREFIX } from "./types";

const NONE = "__none__";
// Jev's documented ceiling is 255 choices per question; one is "none".
const MAX_OPTIONS = 254;

export interface PickResult {
  slot: string;
  picked: StackOption | null;
  confidence: number;
  noneFit: boolean;
}

/** The business context every pick is judged against. */
async function businessContext(engagementId: string, domain: string | null): Promise<Record<string, unknown>> {
  const facts = await getClientFacts(engagementId);
  const str = (key: string) => (typeof facts[key]?.value === "string" ? (facts[key].value as string) : undefined);
  return {
    website: domain ?? undefined,
    businessName: str("operatorName"),
    offer: str("offerName"),
    idealCustomer: str("offerIcp"),
  };
}

/**
 * Picks each account-specific id (the Pile-On list, the Win-Back list or
 * workflow, the Webflow site, the Vercel project) from the client's real
 * options. Targets sharing a resource share one fetch and one Jev call.
 */
export async function pickShowtimeIds(engagementId: string, domain: string | null, targets: PickTarget[]): Promise<PickResult[]> {
  if (targets.length === 0) return [];
  const context = await businessContext(engagementId, domain);
  const results: PickResult[] = [];

  const byResource = new Map<string, PickTarget[]>();
  for (const t of targets) {
    const key = `${t.resource}?${new URLSearchParams(t.params ?? {}).toString()}`;
    byResource.set(key, [...(byResource.get(key) ?? []), t]);
  }

  for (const group of byResource.values()) {
    const { provider, resource, params } = group[0];
    try {
      if (!(await hasCredential(engagementId, provider))) continue;
      const credential = await resolveCredential(engagementId, provider);
      const options = (await fetchStackOptions(resource, credential, new URLSearchParams(params ?? {})))
        .filter((o) => o.id && o.name?.trim())
        .slice(0, MAX_OPTIONS);
      if (options.length === 0) {
        for (const t of group) {
          await storePick(engagementId, t, null, 0, true, "The connected account has no options to pick from yet.");
          results.push({ slot: t.slot, picked: null, confidence: 0, noneFit: true });
        }
        continue;
      }

      const criteria: Record<string, string> = Object.fromEntries(options.map((o) => [o.id, o.name]));
      criteria[NONE] = "None of these is meant for this.";
      const questions: Record<string, JevQuestion> = {};
      for (const t of group) {
        questions[t.slot] = {
          type: "choice",
          instructions: `${t.purpose} Judged by name, which one should it be for this business? Pick "none" if nothing clearly fits.`,
          criteria,
        };
      }

      const result = await askJev({ state: { ...context, options: options.map((o) => o.name) }, questions, reading: { engagementId, purpose: "showtime-pick" } });
      const byId = new Map(options.map((o) => [o.id, o]));
      for (const t of group) {
        const answer = result.answers[t.slot];
        if (!answer || answer.type !== "choice") continue;
        const confidence = Math.round(answer.confidence * 100);
        const picked = answer.choice === NONE ? null : byId.get(answer.choice) ?? null;
        await storePick(
          engagementId,
          t,
          picked,
          confidence,
          !picked,
          picked
            ? `Picked by Jev from ${options.length} options in the connected account (model ${result.model}).`
            : `Jev found no fit among ${options.length} options in the connected account (model ${result.model}).`
        );
        results.push({ slot: t.slot, picked, confidence, noneFit: !picked });
      }
    } catch (err) {
      console.warn(`[showtime-setup] picking from ${resource} failed for ${engagementId}:`, err instanceof Error ? err.message : err);
    }
  }
  return results;
}

async function storePick(engagementId: string, target: PickTarget, picked: StackOption | null, confidence: number, noneFit: boolean, evidence: string) {
  await upsertClientFact(engagementId, `${PICK_FACT_PREFIX}${target.slot}`, picked ? { id: picked.id, name: picked.name, resource: target.resource } : { id: null, noneFit, resource: target.resource }, {
    source: "jev",
    sourceDetail: target.provider,
    confidence,
    evidence,
  });
}

/**
 * "Is this the business's real sales site?" Asked of the copy the crawl
 * just read, so a Linktree, a parked domain or a login wall gets flagged
 * before anything is built from it.
 */
export async function checkSite(engagementId: string, domain: string): Promise<{ isRealSite: boolean; probability: number } | null> {
  const corpus = await getClientFact(engagementId, "rawVoiceCorpus");
  if (!corpus || typeof corpus.value !== "string" || !corpus.value.trim()) return null;
  try {
    const result = await askJev({
      state: { website: domain, siteCopy: corpus.value.slice(0, 12000) },
      questions: {
        isRealSite: {
          type: "noul",
          instructions: "Is this the business's own main website, describing and selling what it offers?",
          criteria: {
            true: "A real business site: it says what the business sells, to whom, and how to buy or book.",
            false: "A link-in-bio page, a parked or for-sale domain, a login or error page, a placeholder, or someone else's site.",
          },
        },
      },
      reading: { engagementId, purpose: "site-check" },
    });
    const answer = result.answers.isRealSite;
    if (!answer || answer.type !== "noul") return null;
    const verdict = { isRealSite: answer.noul >= 0.5, probability: Math.round(answer.noul * 100) };
    await upsertClientFact(engagementId, "siteCheck", verdict, {
      source: "jev",
      sourceDetail: domain,
      confidence: verdict.probability,
      evidence: `Checked against the copy read from ${domain} (model ${result.model}).`,
    });
    return verdict;
  } catch (err) {
    console.warn(`[showtime-setup] site check failed for ${engagementId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * "Does this connected account belong to the business on the website?"
 * Only asked when the account told us its own name or site (Klaviyo,
 * Mailchimp and GoHighLevel do); a bare token with nothing identifying is
 * left unchecked rather than guessed about.
 */
export async function checkAccountMatches(
  engagementId: string,
  domain: string | null,
  provider: string,
  accountLabel: string | null
): Promise<{ matches: boolean; probability: number } | null> {
  const facts = await getClientFacts(engagementId);
  const accountNames = Object.values(facts)
    .filter((f) => f.source === "account" && f.sourceDetail === provider && f.key === "operatorName" && typeof f.value === "string")
    .map((f) => f.value as string);
  if (accountNames.length === 0 && !accountLabel) return null;
  const corpus = facts.rawVoiceCorpus;
  if (!domain && !(typeof corpus?.value === "string")) return null;

  try {
    const result = await askJev({
      state: {
        website: domain ?? undefined,
        siteCopyStart: typeof corpus?.value === "string" ? corpus.value.slice(0, 3000) : undefined,
        connectedAccountName: accountNames[0] ?? undefined,
        savedConnectionLabel: accountLabel ?? undefined,
      },
      questions: {
        sameBusiness: {
          type: "noul",
          instructions: "Does the connected account belong to the same business as this website?",
          criteria: {
            true: "The account's name or label clearly refers to this business (or its owner or brand).",
            false: "The account's name or label points to a different business.",
          },
        },
      },
      reading: { engagementId, purpose: "account-match" },
    });
    const answer = result.answers.sameBusiness;
    if (!answer || answer.type !== "noul") return null;
    const verdict = { matches: answer.noul >= 0.5, probability: Math.round(answer.noul * 100) };
    await upsertClientFact(engagementId, `accountCheck:${provider}`, verdict, {
      source: "jev",
      sourceDetail: provider,
      confidence: verdict.probability,
      evidence: `Compared the ${provider} account to ${domain ?? "the website"} (model ${result.model}).`,
    });
    return verdict;
  } catch (err) {
    console.warn(`[showtime-setup] account check failed for ${provider} on ${engagementId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * With several saved connections for one tool (three HubSpot accounts in
 * the workspace), which one is this client's? Judged on each connection's
 * label against the business name and website.
 */
export async function matchSavedConnection(
  engagementId: string,
  domain: string | null,
  provider: string,
  saved: { id: string; label: string }[]
): Promise<{ vaultId: string; confidence: number } | null> {
  if (saved.length < 2) return null;
  const context = await businessContext(engagementId, domain);
  if (!context.website && !context.businessName) return null;
  try {
    const criteria: Record<string, string> = Object.fromEntries(saved.slice(0, MAX_OPTIONS).map((s) => [s.id, s.label]));
    criteria[NONE] = "None of these connections is for this business.";
    const result = await askJev({
      state: context,
      questions: {
        connection: { type: "choice", instructions: "Judged by its label, which saved connection belongs to this business?", criteria },
      },
      reading: { engagementId, purpose: "saved-connection-match" },
    });
    const answer = result.answers.connection;
    if (!answer || answer.type !== "choice" || answer.choice === NONE) return null;
    const match = { vaultId: answer.choice, confidence: Math.round(answer.confidence * 100) };
    await upsertClientFact(engagementId, `vaultMatch:${provider}`, match.vaultId, {
      source: "jev",
      sourceDetail: provider,
      confidence: match.confidence,
      evidence: `Matched among ${saved.length} saved ${provider} connections by label (model ${result.model}).`,
    });
    return match;
  } catch (err) {
    console.warn(`[showtime-setup] saved-connection match failed for ${provider} on ${engagementId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
