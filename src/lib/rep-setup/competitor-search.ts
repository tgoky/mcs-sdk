// src/lib/rep-setup/competitor-search.ts
//
// Competitors from the web, for Reputation Manager's setup. Most sites never
// name their competitors, so reading the client's own site (the prefill's
// suggestedCompetitors) usually finds none. This asks Claude to search the
// web for the businesses a customer would weigh against this one, keeps
// only names it found on a page it actually searched, then has Jev make a
// yes/no call on each ("would a customer compare these?") with the web's
// own evidence, not the client's site copy. Nothing is saved to the
// identity graph here: the names are a fact the review shows, each with
// its own confidence, until the person saves.

import { callClaudeWithWebSearch } from "@/lib/llm";
import { askJev, type JevQuestion } from "@/lib/jev";
import { getClientFact, upsertClientFact } from "@/lib/client-facts";
import { WEB_COMPETITORS_FACT, type WebCompetitor } from "./types";

export { WEB_COMPETITORS_FACT, type WebCompetitor };

const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CANDIDATES = 8;

export interface CompetitorSearchInput {
  business: string;
  domain: string | null;
  offer?: string | null;
  category?: string | null;
  location?: string | null;
  /** Search again even if a recent result is stored. */
  force?: boolean;
  runId?: string;
}

export type CompetitorSearchOutcome = { status: "found" | "none" | "reused" | "failed"; count: number; detail?: string };

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Pulls the first JSON object out of a model reply (fenced or not). */
function parseCandidates(text: string): { name: string; url: string | null; sourceUrl: string; why: string }[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (parsed as { competitors?: unknown }).competitors;
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => c as Record<string, unknown>)
    .filter((c) => typeof c.name === "string" && c.name.trim() && typeof c.sourceUrl === "string" && /^https?:\/\//i.test(c.sourceUrl))
    .map((c) => ({
      name: String(c.name).trim().slice(0, 120),
      url: typeof c.url === "string" && /^https?:\/\//i.test(c.url) ? c.url.trim() : null,
      sourceUrl: String(c.sourceUrl).trim(),
      why: typeof c.why === "string" ? c.why.trim().slice(0, 240) : "",
    }));
}

/**
 * Keeps names found on a page the search really returned (by host, since a
 * model can quote a page's address slightly differently), drops the client
 * itself and repeats. With no citations to check against (a provider that
 * doesn't return them), a name still needs its own http(s) source.
 */
export function vetCandidates(
  candidates: { name: string; url: string | null; sourceUrl: string; why: string }[],
  citedUrls: string[],
  self: { business: string; domain: string | null }
): { name: string; url: string | null; sourceUrl: string; why: string }[] {
  const citedHosts = new Set(citedUrls.map(hostOf).filter((h): h is string => Boolean(h)));
  const selfHost = hostOf(self.domain);
  const selfName = self.business.trim().toLowerCase();
  const seen = new Set<string>();
  const out: { name: string; url: string | null; sourceUrl: string; why: string }[] = [];
  for (const c of candidates) {
    const key = c.name.toLowerCase();
    if (seen.has(key) || key === selfName) continue;
    if (selfHost && hostOf(c.url) === selfHost) continue;
    const sourceHost = hostOf(c.sourceUrl);
    if (!sourceHost) continue;
    if (citedHosts.size > 0 && !citedHosts.has(sourceHost)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

/** Searches, vets and has Jev check the competitors. Never throws. */
export async function findWebCompetitors(engagementId: string, input: CompetitorSearchInput): Promise<CompetitorSearchOutcome> {
  if (!input.force) {
    const stored = await getClientFact(engagementId, WEB_COMPETITORS_FACT).catch(() => null);
    if (stored && stored.status !== "rejected" && Date.now() - new Date(stored.updatedAt).getTime() < FRESH_MS) {
      const n = Array.isArray(stored.value) ? stored.value.length : 0;
      return { status: "reused", count: n };
    }
  }

  const about = [
    `Business: ${input.business}`,
    input.domain ? `Website: ${input.domain}` : null,
    input.offer ? `What it sells: ${input.offer}` : null,
    input.category ? `Google category: ${input.category}` : null,
    input.location ? `Location: ${input.location}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let search: Awaited<ReturnType<typeof callClaudeWithWebSearch>>;
  try {
    search = await callClaudeWithWebSearch({
      runId: input.runId,
      maxSearches: 4,
      maxTokens: 1500,
      system:
        "You find a business's real competitors: other businesses a prospective customer would realistically compare it with or choose instead, " +
        "for the same kind of customer and need. Search the web (for example \"<name> alternatives\", \"<name> vs\", and the best options in its category " +
        "and area). Only name businesses you actually saw on a page you searched, and give that page's address as sourceUrl. Never invent one. Leave out " +
        "the business itself, directories, marketplaces and review sites. Fewer, right answers beat many. An empty list is a valid answer. Respond with ONLY " +
        'a JSON object, no preamble, no code fences: {"competitors": [{"name": "string", "url": "their own site or null", "sourceUrl": "the page you found them on", ' +
        '"why": "one short sentence on why a customer would compare them"}]}',
      userMessage: about,
    });
  } catch (err) {
    console.warn(`[competitor-search] search failed for ${engagementId}:`, err instanceof Error ? err.message : err);
    return { status: "failed", count: 0, detail: "The web search didn't answer." };
  }

  const candidates = vetCandidates(parseCandidates(search.text), search.citedUrls, { business: input.business, domain: input.domain });
  if (candidates.length === 0) {
    await upsertClientFact(engagementId, WEB_COMPETITORS_FACT, [], {
      source: "llm",
      sourceDetail: "web_search",
      evidence: `Searched the web (${search.searchesUsed} searches); no competitor was named on a page it found.`,
    }).catch(() => undefined);
    return { status: "none", count: 0 };
  }

  // Jev: one yes/no per name, judged on what the search found about it.
  const questions: Record<string, JevQuestion> = {};
  candidates.forEach((c, i) => {
    questions[`c${i}`] = {
      type: "noul",
      instructions: `Would a prospective customer of ${input.business} realistically compare it with "${c.name}", or choose "${c.name}" instead, for the same need?`,
      criteria: {
        true: "Yes: a direct alternative for the same kind of customer and need.",
        false: "No: a different market, a supplier or partner, a directory or review site, or the business itself.",
      },
    };
  });

  let checked: WebCompetitor[];
  let model: string | null = null;
  try {
    const result = await askJev({ state: { business: input.business, website: input.domain ?? undefined, offer: input.offer ?? undefined, category: input.category ?? undefined, candidates }, questions, reading: { engagementId, purpose: "web-competitors", runId: input.runId } });
    model = result.model;
    checked = candidates.flatMap((c, i): WebCompetitor[] => {
      const ans = result.answers[`c${i}`];
      if (!ans || ans.type !== "noul") return [{ ...c, confidence: null }];
      // A "no" is dropped; a "yes" keeps how sure Jev was.
      return ans.noul >= 0.5 ? [{ ...c, confidence: Math.round(ans.noul * 100) }] : [];
    });
  } catch (err) {
    // Jev unavailable: keep the vetted names, unscored, so they show as unsure.
    console.warn(`[competitor-search] Jev check failed for ${engagementId}:`, err instanceof Error ? err.message : err);
    checked = candidates.map((c) => ({ ...c, confidence: null }));
  }

  const scored = checked.map((c) => c.confidence).filter((c): c is number => c !== null);
  await upsertClientFact(engagementId, WEB_COMPETITORS_FACT, checked, {
    source: model ? "jev" : "llm",
    sourceDetail: "web_search",
    // The weakest name decides how far the list as a whole is trusted.
    confidence: scored.length === checked.length && scored.length > 0 ? Math.min(...scored) : undefined,
    evidence: `Found by web search (${search.searchesUsed} searches)${model ? `, each checked by Jev (model ${model})` : ""}.`,
  }).catch((err) => console.warn(`[competitor-search] couldn't store competitors for ${engagementId}:`, err));

  return checked.length ? { status: "found", count: checked.length } : { status: "none", count: 0 };
}
