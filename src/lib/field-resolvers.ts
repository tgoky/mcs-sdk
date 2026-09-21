// src/lib/field-resolvers.ts
//
// Phase 1, piece 2: the generic Jev-scored resolver — held back until
// jev.ts had a confirmed request/response contract (TypeSafe's own docs,
// not a guess) to build against. Reads whatever evidence is already in
// the fact store (a website crawl or an account harvest — Phase 0/1's
// other two pieces), asks Jev every relevant question about it in ONE
// call, and writes each answer back into client_facts with its
// confidence.
//
// This module does NOT decide whether a confidence is "high enough to
// auto-run on" — that's the enable-time/run-time gate
// (getMissingRequiredFields), a separate, later piece. This only ever
// writes a suggestion plus its score; nothing here changes what any
// worker actually reads today.

import { askJev, type JevQuestion, type JevAnswer } from "@/lib/jev";
import { getClientFact, upsertClientFact } from "@/lib/client-facts";

export interface FieldQuestionMap {
  [fieldKey: string]: JevQuestion;
}

function answerToValue(answer: JevAnswer): { value: unknown; confidence: number | null } {
  if (answer.type === "choice") return { value: answer.choice, confidence: answer.confidence };
  if (answer.type === "score") return { value: answer.score, confidence: answer.confidence };
  // Noul has no separate confidence field per TypeSafe's own docs — the
  // probability itself already is the certainty (near 0.5 is uncertain,
  // near 0 or 1 is confident), so it's reused as the confidence too.
  return { value: answer.noul >= 0.5, confidence: answer.noul };
}

/**
 * Resolves several fields that all share the same evidence in ONE Jev
 * call — TypeSafe's own docs are explicit that batching questions against
 * one state barely changes latency or cost, and warn that a
 * one-question-per-call habit is a real anti-pattern, not just a
 * micro-optimization. `evidenceFactKey` names the client_facts row to use
 * as state (e.g. "rawVoiceCorpus"); this skips cleanly, writing nothing,
 * if that fact doesn't exist yet — there's nothing to score against.
 */
export async function resolveFieldsFromEvidence(
  engagementId: string,
  evidenceFactKey: string,
  questions: FieldQuestionMap
): Promise<{ resolved: string[]; skipped: boolean }> {
  const evidence = await getClientFact(engagementId, evidenceFactKey);
  if (!evidence || typeof evidence.value !== "string" || !evidence.value.trim()) {
    return { resolved: [], skipped: true };
  }

  const result = await askJev({ state: evidence.value, questions });

  const resolved: string[] = [];
  for (const [fieldKey, answer] of Object.entries(result.answers)) {
    const { value, confidence } = answerToValue(answer);
    await upsertClientFact(engagementId, fieldKey, value, {
      source: "jev",
      sourceDetail: evidenceFactKey,
      confidence: confidence !== null ? Math.round(confidence * 100) : undefined,
      evidence: `Scored against ${evidenceFactKey} (Jev model ${result.model}).`,
    });
    resolved.push(fieldKey);
  }
  return { resolved, skipped: false };
}

// ── Concrete resolver: pin-down's website-derived Choice fields ─────────
//
// trafficTemperature and castingChoice (EngagementStack.traffic_temperature
// / castingChoice) are both real, closed enums in schema.ts, and both are
// judgment calls a website's own marketing copy carries a real signal for
// — clean Choice candidates. Both are batched into ONE Jev call against
// the same rawVoiceCorpus state, per TypeSafe's own docs: "ask every
// question your code might need... adding questions barely changes the
// response time" — two separate calls against the same evidence would be
// exactly the anti-pattern those docs call out.
//
// offerVertical is deliberately NOT resolved this way: schema.ts's own
// comment confirms vertical is free text with no fixed taxonomy in this
// app today ("Coaching" and "coaching" are already treated as different
// buckets by Leak Map's own benchmark key), and Jev's Choice type requires
// a closed option set. Inventing a taxonomy to force vertical into one
// would be a real product decision, not something to slip in inside a
// resolver.
export async function resolveWebsiteDerivedChoices(engagementId: string) {
  return resolveFieldsFromEvidence(engagementId, "rawVoiceCorpus", {
    trafficTemperature: {
      type: "choice",
      instructions:
        "Based on this website's marketing copy, what temperature best describes how this business's leads typically arrive — how much they already know about the offer before being sold to?",
      criteria: {
        cold: "Outbound or cold-traffic offer — the copy is written to first introduce the problem and the business to someone unfamiliar with them.",
        warm: "The copy assumes some prior familiarity — an email list, a retargeted visitor, or a referred lead who already knows roughly who this business is.",
        hot: "The copy is written for someone who already actively wants this and is close to buying — pricing-forward, direct comparison, or a returning-customer tone.",
      },
    },
    castingChoice: {
      type: "choice",
      instructions:
        "Based on this website's marketing copy, who is most likely to appear on camera for this business's sales calls or video content — who the copy is written in the voice of, or who it credits by name or role?",
      criteria: {
        founder_on_camera: "The copy speaks in the founder's/owner's own voice, or names a single founder as the face of the business.",
        coach_on_camera: "The copy centers a named coach, expert, or practitioner distinct from company branding — a personal-brand-driven offer.",
        animation: "The copy reads as a purely product/software offer with no individual person featured — a team or brand voice, not a person.",
        other: "None of the above clearly fits, or the copy gives no signal either way.",
      },
    },
  });
}

// ── Reputation-derived facts: verify prefill extractions ───────────────
//
// competitors / entities / seedPanelPrompts are LIST fields extracted by
// discovery-prefill's Claude pass. This function scores those proposed
// lists against rawVoiceCorpus using Jev's `score` question type so that
// field-writeback.ts can gate auto-promotion on a real quality x peakedness
// metric (>= 75).
//
// Deliberately uses object-based state per TypeSafe guidelines and skips
// any field where human action (status !== "suggested") has already been
// taken.
export async function verifyReputationExtractions(
  engagementId: string
): Promise<{ verified: string[]; skipped: boolean }> {
  const corpus = await getClientFact(engagementId, "rawVoiceCorpus");
  if (!corpus || typeof corpus.value !== "string" || !corpus.value.trim()) {
    return { verified: [], skipped: true };
  }

  // Only score candidates in "suggested" status — human-confirmed, edited,
  // or rejected facts are respected and left untouched.
  const candidates: { factKey: string; list: string[] }[] = [];
  for (const factKey of ["competitors", "entities", "seedPanelPrompts"]) {
    const fact = await getClientFact(engagementId, factKey);
    if (fact && fact.status === "suggested" && Array.isArray(fact.value) && fact.value.length > 0) {
      candidates.push({ factKey, list: fact.value as string[] });
    }
  }
  if (candidates.length === 0) return { verified: [], skipped: true };

  const state: Record<string, unknown> = { siteCopy: corpus.value };
  for (const { factKey, list } of candidates) {
    state[`proposed${factKey.charAt(0).toUpperCase()}${factKey.slice(1)}`] = list;
  }

  const VERIFICATION_LEVELS = [
    "Fabricated — none of the entries are named or implied in the site copy",
    "Mostly wrong — at most one entry is real; the rest are fabricated, misread, or the wrong kind of thing",
    "Mixed — roughly half the entries are real and correctly scoped",
    "Mostly right — nearly all entries are real and correctly scoped, minor gaps or one weak entry",
    "Fully right — every entry is real, correctly scoped, and nothing obvious is missing",
  ];

  const questions: FieldQuestionMap = {};
  for (const { factKey } of candidates) {
    questions[`${factKey}Verification`] = {
      type: "score",
      instructions:
        factKey === "seedPanelPrompts"
          ? "Score how well the proposed prompts match what a real prospective customer of THIS business would ask an AI engine (ChatGPT/Claude/Perplexity) about it, judged against the site copy."
          : `Score how accurately the proposed ${factKey} list reflects what the site copy names or clearly implies. Entries must be real, correctly scoped, and the kind of thing a prospective customer would actually weigh against this business.`,
      criteria: VERIFICATION_LEVELS,
    };
  }

  const result = await askJev({ state, questions });

  const verified: string[] = [];
  for (const { factKey, list } of candidates) {
    const answer = result.answers[`${factKey}Verification`];
    if (!answer || answer.type !== "score") continue;

    // Quality (rubric level 0-1) x peakedness (distribution certainty)
    const quality = answer.score / (VERIFICATION_LEVELS.length - 1);
    const combined = quality * answer.confidence;

    await upsertClientFact(engagementId, factKey, list, {
      source: "jev",
      sourceDetail: "rawVoiceCorpus",
      confidence: Math.round(combined * 100),
      evidence: `Prefill-extracted list scored ${answer.score.toFixed(2)}/${VERIFICATION_LEVELS.length - 1} by Jev against site copy (peakedness ${(answer.confidence * 100).toFixed(0)}%; model ${result.model}).`,
    });
    verified.push(factKey);
  }
  return { verified, skipped: false };
}