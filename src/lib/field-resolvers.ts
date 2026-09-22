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
import { callClaude, MODEL } from "@/lib/llm";
import type { ColdOpenIcp } from "@/models/schema";

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

// ── Cold Open derived facts: extract ICPs, Voice, Product Identity ─────
export async function resolveColdOpenDerivedFields(
  engagementId: string
): Promise<{ resolved: string[]; skipped: boolean }> {
  const corpus = await getClientFact(engagementId, "rawVoiceCorpus");
  if (!corpus || typeof corpus.value !== "string" || !corpus.value.trim()) {
    return { resolved: [], skipped: true };
  }

  const existingProduct = await getClientFact(engagementId, "productIdentity");
  const existingIcps = await getClientFact(engagementId, "icps");
  const existingVoice = await getClientFact(engagementId, "voiceProfile");

  if (
    existingProduct && existingProduct.status !== "suggested" &&
    existingIcps && existingIcps.status !== "suggested" &&
    existingVoice && existingVoice.status !== "suggested"
  ) {
    return { resolved: [], skipped: true };
  }

  // 1. Resolve Jev choice for outreach tone
  const toneResult = await askJev({
    state: corpus.value,
    questions: {
      voiceTone: {
        type: "choice",
        instructions: "Based on this website's marketing copy, what tone best characterizes their cold outreach and brand messaging?",
        criteria: {
          Professional: "Corporate, formal, authoritative, and structured copy.",
          Direct: "Concise, results-oriented, pitch-focused copy with zero fluff.",
          Casual: "Conversational, friendly, approachable, and lighthearted copy.",
          Warm: "Empathetic, consultative, relationship-first copy.",
        },
      },
    },
  });

  const toneAnswer = toneResult.answers.voiceTone;
  const detectedTone = toneAnswer && toneAnswer.type === "choice" ? toneAnswer.choice : "Professional";
  const toneConfidence = toneAnswer && toneAnswer.type === "choice" ? Math.round(toneAnswer.confidence * 100) : 80;

  const resolved: string[] = [];

  // 2. Extract structured Product Identity & ICPs via Claude
  try {
    const claudeResult = await callClaude({
      model: MODEL.FAST,
      system: `You analyze website marketing text and extract structured sales data for an outbound Cold Open campaign.
Return ONLY a valid JSON object in the following format:
{
  "productName": "extracted product or company name",
  "productPrice": "pricing details or estimated tier e.g. $499/mo or Custom",
  "productValueProp": "concise 1-sentence value proposition",
  "icps": [
    {
      "slug": "url-safe-slug-e-g-b2b-saas-founders",
      "label": "Human readable ICP Label e.g. B2B SaaS Founders",
      "weight": 0.5
    }
  ],
  "greeting": "Default email greeting e.g. Hi {first_name},",
  "signOff": "Default email sign-off e.g. Best,"
}
Make sure weights across ICPs sum to 1.0. Slug must be lowercase and hyphenated. Do not include markdown code fences or preambles.`,
      userMessage: corpus.value.slice(0, 6000),
      maxTokens: 1000,
    });

    const jsonMatch = claudeResult.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      if (!existingProduct || existingProduct.status === "suggested") {
        const productIdentity = {
          name: String(parsed.productName || "Main Product"),
          url: "",
          price: String(parsed.productPrice || ""),
          valueProp: String(parsed.productValueProp || ""),
        };
        await upsertClientFact(engagementId, "productIdentity", productIdentity, {
          source: "jev",
          sourceDetail: "rawVoiceCorpus",
          confidence: 85,
          evidence: `Extracted product identity from site copy via Claude + Jev.`,
        });
        resolved.push("productIdentity");
      }

      if (!existingIcps || existingIcps.status === "suggested") {
        if (Array.isArray(parsed.icps) && parsed.icps.length > 0) {
          const shapedIcps: ColdOpenIcp[] = parsed.icps.map((item: any, idx: number) => ({
            slug: String(item.slug || `icp-${idx + 1}`).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
            label: String(item.label || `ICP ${idx + 1}`),
            weight: typeof item.weight === "number" ? item.weight : 1 / parsed.icps.length,
          }));
          await upsertClientFact(engagementId, "icps", shapedIcps, {
            source: "jev",
            sourceDetail: "rawVoiceCorpus",
            confidence: 85,
            evidence: `Extracted ${shapedIcps.length} target ICPs from site copy.`,
          });
          resolved.push("icps");
        }
      }

      if (!existingVoice || existingVoice.status === "suggested") {
        const voiceProfile = {
          greeting: String(parsed.greeting || "Hi {first_name},"),
          signOff: String(parsed.signOff || "Best,"),
          tone: detectedTone,
        };
        await upsertClientFact(engagementId, "voiceProfile", voiceProfile, {
          source: "jev",
          sourceDetail: "rawVoiceCorpus",
          confidence: toneConfidence,
          evidence: `Derived brand voice profile with ${detectedTone} tone from site copy.`,
        });
        resolved.push("voiceProfile");
      }
    }
  } catch (err) {
    console.warn(`[field-resolvers] resolveColdOpenDerivedFields extraction failed for ${engagementId}:`, err);
  }

  return { resolved, skipped: resolved.length === 0 };
}