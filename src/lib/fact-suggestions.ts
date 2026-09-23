// src/lib/fact-suggestions.ts
//
// What a dossier GET hands its form for fields backed by client_facts:
// a fact that passes field-writeback's trust rule may pre-fill the field
// (it's either scraped/account data, a human's own answer, or a Jev score
// at or above the auto-apply threshold); anything else is returned
// separately as a suggestion the form shows beside the field, with where
// it came from and how confident the score was, for the human to use or
// reject. Nothing below the threshold is ever shown as if it were an
// answer.

import type { ClientFact } from "@/lib/client-facts";
import { isFactTrusted } from "@/lib/field-writeback";

export interface FactSuggestion {
  value: unknown;
  source: ClientFact["source"];
  sourceDetail: string | null;
  /** 0-100 when scored; null when the value hasn't been scored at all. */
  confidence: number | null;
  evidence: string | null;
  /** Set for suggestions that follow from a rule (what's connected, where
   * the hero video is hosted) rather than a guess — nothing to score. */
  derived?: boolean;
  /** Overrides the "suggested from ..." wording when the source alone
   * doesn't say it well. */
  label?: string;
}

export function splitFacts(
  facts: Record<string, ClientFact>,
  keys: readonly string[]
): { trusted: Record<string, unknown>; suggestions: Record<string, FactSuggestion> } {
  const trusted: Record<string, unknown> = {};
  const suggestions: Record<string, FactSuggestion> = {};
  for (const key of keys) {
    const fact = facts[key];
    if (!fact || fact.status === "rejected") continue;
    if (isFactTrusted(fact)) {
      trusted[key] = fact.value;
    } else {
      suggestions[key] = {
        value: fact.value,
        source: fact.source,
        sourceDetail: fact.sourceDetail,
        confidence: fact.confidence,
        evidence: fact.evidence,
      };
    }
  }
  return { trusted, suggestions };
}
