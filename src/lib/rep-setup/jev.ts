// src/lib/rep-setup/jev.ts
//
// Jev's yes/no calls on the uncertain parts of the proposed identity, in
// one batched ask: which extra names really refer to this business (a
// booking host could be a closer or an assistant nobody searches for),
// which domains it owns, which same-name lookalikes are real other
// parties, and which brands are main enough to search daily. Stored as
// one fact; buildRepProposal reads it.

import { askJev, type JevQuestion } from "@/lib/jev";
import { getClientFact, getClientFacts, upsertClientFact } from "@/lib/client-facts";
import type { Decision, RepDecisions } from "./proposal";
import type { RepProposal } from "./types";

const YES_NO = (yes: string, no: string) => ({ true: yes, false: no });
const MAX_QUESTIONS = 40;

export async function loadRepDecisions(engagementId: string): Promise<RepDecisions | null> {
  const f = await getClientFact(engagementId, "repIdentityDecisions");
  return f && f.status !== "rejected" && f.value && typeof f.value === "object" ? (f.value as RepDecisions) : null;
}

/** Asks about everything in the proposal that came from a tool or the
 * site without a person's say-so. Never throws. */
export async function decideRepIdentity(engagementId: string, proposal: RepProposal, website: string | null): Promise<RepDecisions | null> {
  const ask: { group: keyof RepDecisions; key: string; q: JevQuestion }[] = [];
  const name = proposal.operatorName.value;

  for (const a of proposal.aliases) {
    if (a.sources.includes("saved")) continue;
    ask.push({
      group: "aliases",
      key: a.value.toLowerCase(),
      q: {
        type: "noul",
        instructions: `Would people talking about ${name} online use "${a.value}" to mean this business, its founder or someone customers deal with there (found in: ${a.sources.join(", ")})?`,
        criteria: YES_NO("Yes: it's this business, its founder, or a person customers know it by.", "No: an unrelated name, a generic role, a tool or a placeholder."),
      },
    });
  }
  for (const dm of proposal.domains) {
    if (dm.sources.includes("saved") || dm.tier === "done") continue;
    ask.push({
      group: "domains",
      key: dm.value.toLowerCase(),
      q: {
        type: "noul",
        instructions: `Is ${dm.value} a domain ${name}${website ? ` (main site ${website})` : ""} owns and uses (found in: ${dm.sources.join(", ")})?`,
        criteria: YES_NO("Yes: the business's own domain or sending domain.", "No: a third-party, a platform's domain, or unrelated."),
      },
    });
  }
  for (const c of proposal.collisions) {
    ask.push({
      group: "collisions",
      key: c.name.toLowerCase(),
      q: {
        type: "noul",
        instructions: `"${c.name}" (${c.whoTheyAre}). Is this a different business or person from ${name} that people could mix up with it?`,
        criteria: YES_NO("Yes: a separate party with a confusingly similar name.", "No: it's actually this business's own property, or nothing anyone would confuse."),
      },
    });
  }
  for (const e of proposal.entities) {
    if (e.sources.includes("saved") || e.value.toLowerCase() === name.toLowerCase()) continue;
    ask.push({
      group: "priority",
      key: e.value.toLowerCase(),
      q: {
        type: "noul",
        instructions: `Is "${e.value}" a main brand, product or program prospects know ${name} by, worth searching the web for daily?`,
        criteria: YES_NO("Yes: a name customers use and would post about.", "No: a minor feature, a section heading, or a generic term."),
      },
    });
  }
  if (ask.length === 0) return null;

  const facts = await getClientFacts(engagementId);
  const corpus = typeof facts.rawVoiceCorpus?.value === "string" ? (facts.rawVoiceCorpus.value as string).slice(0, 8000) : undefined;
  const questions: Record<string, JevQuestion> = {};
  const index = ask.slice(0, MAX_QUESTIONS);
  index.forEach((a, i) => (questions[`q${i}`] = a.q));

  try {
    const result = await askJev({ state: { business: name, website: website ?? undefined, siteCopy: corpus }, questions, reading: { engagementId, purpose: "rep-identity" } });
    const out: RepDecisions = {};
    index.forEach((a, i) => {
      const ans = result.answers[`q${i}`];
      if (!ans || ans.type !== "noul") return;
      const keep = ans.noul >= 0.5;
      const decision: Decision = { keep, confidence: Math.round((keep ? ans.noul : 1 - ans.noul) * 100) };
      (out[a.group] ??= {})[a.key] = decision;
    });
    const confidences = Object.values(out).flatMap((g) => Object.values((g ?? {}) as Record<string, Decision>).map((x) => x.confidence));
    await upsertClientFact(engagementId, "repIdentityDecisions", out, {
      source: "jev",
      sourceDetail: "repSetup",
      confidence: confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : undefined,
      evidence: `Jev's calls on ${index.length} names, domains and lookalikes (model ${result.model}).`,
    });
    return out;
  } catch (err) {
    console.warn(`[rep-setup] Jev decisions failed for ${engagementId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
