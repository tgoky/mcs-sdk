// src/lib/fact-trust.ts
//
// The one rule every setup screen uses to decide how to show something the
// app found on its own. Before this, each dossier route drew its own line
// (splitFacts here, CAMPAIGN_MATCH_APPLY_THRESHOLD there, "only a trusted
// fact pre-fills" somewhere else), so the same Jev score could read as an
// answer on one screen and a question on another.
//
//   done    - shown as settled: a human's own answer, scraped or account
//             data, or a Jev score at or above field-writeback's apply
//             threshold (isFactTrusted is the source of truth for that).
//   likely  - shown as "we think", one click to keep: an unscored Claude
//             reading, a rule-based suggestion from what's connected, or a
//             Jev score in the middle band.
//   ask     - shown as the question: nothing usable found, a rejected
//             value, or a Jev score too weak to put in front of anyone as
//             an answer.
//
// Nothing here writes anything. It only sorts what's already stored.

import type { ClientFact } from "@/lib/client-facts";
import { isFactTrusted } from "@/lib/field-writeback";

export type TrustTier = "done" | "likely" | "ask";

/** Below this, a Jev score is a question, not a "we think". The top of the
 * band is field-writeback's own apply threshold (75), through
 * isFactTrusted, so the two can't drift apart. */
export const LIKELY_CONFIDENCE_FLOOR = 45;

export function factTier(fact: ClientFact | null | undefined): TrustTier {
  if (!fact || fact.status === "rejected") return "ask";
  if (isEmptyValue(fact.value)) return "ask";
  if (isFactTrusted(fact)) return "done";
  if (fact.source === "jev") return (fact.confidence ?? 0) >= LIKELY_CONFIDENCE_FLOOR ? "likely" : "ask";
  // An unscored Claude reading or a default: worth showing, not worth
  // presenting as settled.
  return "likely";
}

/** Tier for a 0-100 confidence that didn't come from a stored fact (a
 * saved-connection match, a list pick scored in the same request). */
export function confidenceTier(confidence: number | null | undefined, applyThreshold = 75): TrustTier {
  const c = confidence ?? 0;
  if (c >= applyThreshold) return "done";
  if (c >= LIKELY_CONFIDENCE_FLOOR) return "likely";
  return "ask";
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
