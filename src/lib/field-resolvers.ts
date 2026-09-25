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
import type { ColdOpenIcp, ColdOpenSizingBound } from "@/models/schema";
import { getPrimaryDomainForEngagement } from "@/lib/client-profile";
import { VERTICALS, isListedVertical, verticalLabel } from "@/lib/verticals";

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

  const result = await askJev({ state: evidence.value, questions, reading: { engagementId, purpose: `resolve:${evidenceFactKey}` } });

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
        "Based on this website's marketing copy, what temperature best describes how this business's leads typically arrive. How much they already know about the offer before being sold to?",
      criteria: {
        cold: "Outbound or cold-traffic offer. The copy is written to first introduce the problem and the business to someone unfamiliar with them.",
        warm: "The copy assumes some prior familiarity. An email list, a retargeted visitor, or a referred lead who already knows roughly who this business is.",
        hot: "The copy is written for someone who already actively wants this and is close to buying: pricing-forward, direct comparison, or a returning-customer tone.",
      },
    },
    castingChoice: {
      type: "choice",
      instructions:
        "Based on this website's marketing copy, who is most likely to appear on camera for this business's sales calls or video content. Who the copy is written in the voice of, or who it credits by name or role?",
      criteria: {
        founder_on_camera: "The copy speaks in the founder's/owner's own voice, or names a single founder as the face of the business.",
        coach_on_camera: "The copy centers a named coach, expert, or practitioner distinct from company branding. A personal-brand-driven offer.",
        animation: "The copy reads as a purely product/software offer with no individual person featured. A team or brand voice, not a person.",
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
    "Fabricated: none of the entries are named or implied in the site copy",
    "Mostly wrong: at most one entry is real; the rest are fabricated, misread, or the wrong kind of thing",
    "Mixed: roughly half the entries are real and correctly scoped",
    "Mostly right: nearly all entries are real and correctly scoped, minor gaps or one weak entry",
    "Fully right: every entry is real, correctly scoped, and nothing obvious is missing",
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

  const result = await askJev({ state, questions, reading: { engagementId, purpose: "verify-reputation" } });

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

// ── Website-read single values: score before they can auto-apply ───────
//
// discover-client writes Claude's readings of the site copy (operator name,
// offer name, price, ICP) as source "llm", which field-writeback never
// trusts. This scores each one against the same copy and rewrites it as a
// "jev" fact carrying the real score, so only a well-supported reading
// crosses the auto-apply threshold. offerVertical is classified rather
// than scored: Jev picks from the fixed list in verticals.ts, so a
// confident answer is always one of the shared benchmark groups.

const SINGLE_VALUE_LEVELS = [
  "Fabricated: the copy doesn't support this value at all",
  "Mostly wrong: loosely related to the copy but misread or the wrong kind of thing",
  "Plausible: consistent with the copy but only weakly or indirectly supported",
  "Mostly right: clearly supported by the copy, with minor imprecision",
  "Exactly right: the copy states this directly",
];

const WEBSITE_READING_PROMPTS: Record<string, string> = {
  operatorName: "Score how accurately the proposed business name matches how the site copy names the business itself.",
  offerName: "Score how accurately the proposed offer name matches the main offer the site copy is selling.",
  offerPrice: "Score how accurately the proposed price matches a price the site copy actually states. An invented price is fabricated.",
  offerIcp: "Score how accurately the proposed ideal customer matches who the site copy is written for.",
};

export async function verifyWebsiteReadings(
  engagementId: string
): Promise<{ verified: string[]; skipped: boolean }> {
  const corpus = await getClientFact(engagementId, "rawVoiceCorpus");
  if (!corpus || typeof corpus.value !== "string" || !corpus.value.trim()) {
    return { verified: [], skipped: true };
  }

  const candidates: { factKey: string; value: string }[] = [];
  for (const factKey of Object.keys(WEBSITE_READING_PROMPTS)) {
    const fact = await getClientFact(engagementId, factKey);
    if (fact && fact.source === "llm" && fact.status === "suggested" && typeof fact.value === "string" && fact.value.trim()) {
      candidates.push({ factKey, value: fact.value });
    }
  }

  // Classify the vertical when there's no answer from the list yet: no
  // fact, or an unscored reading / free-text account value that isn't a
  // listed id. A listed account value or a human's answer is left alone.
  const verticalFact = await getClientFact(engagementId, "offerVertical");
  const classifyVertical =
    !verticalFact ||
    (verticalFact.status === "suggested" && !(verticalFact.source !== "llm" && isListedVertical(String(verticalFact.value))));

  if (candidates.length === 0 && !classifyVertical) return { verified: [], skipped: true };

  const state: Record<string, unknown> = { siteCopy: corpus.value };
  const questions: FieldQuestionMap = {};
  for (const { factKey, value } of candidates) {
    state[`proposed${factKey.charAt(0).toUpperCase()}${factKey.slice(1)}`] = value;
    questions[`${factKey}Verification`] = { type: "score", instructions: WEBSITE_READING_PROMPTS[factKey], criteria: SINGLE_VALUE_LEVELS };
  }
  if (classifyVertical) {
    questions.offerVertical = {
      type: "choice",
      instructions: "Which vertical best describes the business this site copy is selling for? Pick the closest fit.",
      criteria: Object.fromEntries(VERTICALS.map((v) => [v.id, `${v.label}: ${v.description}`])),
    };
  }

  const result = await askJev({ state, questions, reading: { engagementId, purpose: "verify-website" } });

  const verified: string[] = [];
  const verticalAnswer = result.answers.offerVertical;
  if (classifyVertical && verticalAnswer && verticalAnswer.type === "choice" && isListedVertical(verticalAnswer.choice)) {
    await upsertClientFact(engagementId, "offerVertical", verticalAnswer.choice, {
      source: "jev",
      sourceDetail: "rawVoiceCorpus",
      confidence: Math.round(verticalAnswer.confidence * 100),
      evidence: `Vertical "${verticalLabel(verticalAnswer.choice)}" chosen by Jev from the fixed list, based on site copy (model ${result.model}).`,
    });
    verified.push("offerVertical");
  }

  for (const { factKey, value } of candidates) {
    const answer = result.answers[`${factKey}Verification`];
    if (!answer || answer.type !== "score") continue;
    const quality = answer.score / (SINGLE_VALUE_LEVELS.length - 1);
    await upsertClientFact(engagementId, factKey, value, {
      source: "jev",
      sourceDetail: "rawVoiceCorpus",
      confidence: Math.round(quality * answer.confidence * 100),
      evidence: `Read from site copy by Claude, scored ${answer.score.toFixed(2)}/${SINGLE_VALUE_LEVELS.length - 1} by Jev (peakedness ${(answer.confidence * 100).toFixed(0)}%; model ${result.model}).`,
    });
    verified.push(factKey);
  }
  return { verified, skipped: false };
}

// ── Cold Open derived facts: extract ICPs, Voice, Product Identity ─────
//
// Same two-step shape as verifyReputationExtractions above: Claude extracts
// candidates from the site copy, then Jev scores those candidates against
// the same copy, and the score is what gets stored as confidence. Claude's
// own output never carries a confidence of its own — a made-up number here
// would pass field-writeback's auto-apply threshold with no real check.

const PRODUCT_IDENTITY_LEVELS = [
  "Fabricated: the name and value proposition aren't supported by the site copy",
  "Mostly wrong: at most one of the name or value proposition matches the copy; the rest is guessed or misread",
  "Mixed: about half is supported by the copy; the rest is guessed",
  "Mostly right: the name and value proposition match the copy; the price is missing, approximate, or weakly supported",
  "Fully right: the name, the price (or its honest absence) and the value proposition all match the copy",
];

// Team-size bands Jev picks from for each ICP — the fixed options keep the
// answer to what the copy can actually support, instead of an invented
// exact number.
const TEAM_SIZE_BANDS: Record<string, { min?: number; max?: number; description: string }> = {
  solo: { min: 1, max: 1, description: "Solo operators. One person running the business." },
  "2-10": { min: 2, max: 10, description: "Small teams of roughly 2 to 10 people." },
  "11-50": { min: 11, max: 50, description: "Growing companies of roughly 11 to 50 people." },
  "51-200": { min: 51, max: 200, description: "Mid-sized companies of roughly 51 to 200 people." },
  "201-1000": { min: 201, max: 1000, description: "Larger companies of roughly 201 to 1,000 people." },
  "1000+": { min: 1001, description: "Enterprises with more than 1,000 people." },
  unclear: { description: "The copy gives no real signal about company size for this audience." },
};

const DISQUALIFIER_LEVELS = [
  "Fabricated: none of these exclusions are supported by the copy",
  "Mostly wrong: at most one exclusion is supported; the rest are guesses",
  "Mixed: about half the exclusions are supported by the copy",
  "Mostly right: nearly all exclusions follow from who the copy says this is (and isn't) for",
  "Fully right: every exclusion follows directly from the copy",
];

const ICP_LEVELS = [
  "Fabricated: none of these audiences are who the site copy is written for",
  "Mostly wrong: at most one audience matches who the copy addresses; the rest are guesses",
  "Mixed: roughly half the audiences match who the copy addresses",
  "Mostly right: nearly all audiences match who the copy addresses, with minor gaps or one weak entry",
  "Fully right: every audience is clearly who the copy is written for, and no obvious one is missing",
];

export function scoreToConfidence(answer: JevAnswer | undefined, levels: number): number | undefined {
  if (!answer || answer.type !== "score") return undefined;
  const quality = answer.score / (levels - 1);
  return Math.round(quality * answer.confidence * 100);
}

export async function resolveColdOpenDerivedFields(
  engagementId: string
): Promise<{ resolved: string[]; skipped: boolean }> {
  const corpus = await getClientFact(engagementId, "rawVoiceCorpus");
  if (!corpus || typeof corpus.value !== "string" || !corpus.value.trim()) {
    return { resolved: [], skipped: true };
  }
  const siteCopy = corpus.value;

  // Human-touched facts (confirmed / edited / rejected) are never re-suggested.
  const isOpen = (fact: Awaited<ReturnType<typeof getClientFact>>) => !fact || fact.status === "suggested";
  const [existingProduct, existingIcps, existingVoice, existingSizing] = await Promise.all([
    getClientFact(engagementId, "productIdentity"),
    getClientFact(engagementId, "icps"),
    getClientFact(engagementId, "voiceProfile"),
    getClientFact(engagementId, "sizingBounds"),
  ]);
  const wantProduct = isOpen(existingProduct);
  const wantIcps = isOpen(existingIcps);
  const wantVoice = isOpen(existingVoice);
  // Sizing is keyed to the ICP slugs extracted in this same pass, so it's
  // only proposed alongside a fresh ICP suggestion.
  const wantSizing = isOpen(existingSizing) && wantIcps;
  if (!wantProduct && !wantIcps && !wantVoice && !wantSizing) {
    return { resolved: [], skipped: true };
  }

  // 1. Claude extracts candidates. Missing values stay missing — no
  //    placeholder names, prices, or ICPs are invented to fill gaps.
  let parsed: {
    productName?: unknown;
    productPrice?: unknown;
    productValueProp?: unknown;
    icps?: unknown;
    greeting?: unknown;
    signOff?: unknown;
  } | null = null;
  try {
    const claudeResult = await callClaude({
      model: MODEL.FAST,
      system: `You analyze website marketing text and extract structured sales data for an outbound Cold Open campaign.
Return ONLY a valid JSON object in the following format:
{
  "productName": "the product or company name exactly as the copy presents it, or null if unclear",
  "productPrice": "the price exactly as stated in the copy (e.g. $499/mo), or null if the copy doesn't state one",
  "productValueProp": "concise 1-sentence value proposition drawn from the copy, or null if unclear",
  "icps": [
    {
      "slug": "url-safe-slug-e-g-b2b-saas-founders",
      "label": "Human readable ICP Label e.g. B2B SaaS Founders",
      "weight": 0.5,
      "disqualifiers": ["kinds of prospects the copy says this is NOT for, e.g. 'B2C', 'pre-revenue'; empty if the copy doesn't say"]
    }
  ],
  "greeting": "Email greeting in the copy's tone e.g. Hi {first_name},",
  "signOff": "Email sign-off in the copy's tone e.g. Best,"
}
Only include ICPs the copy is clearly written for; return an empty list if none are clear. Only list disqualifiers the copy actually states or clearly implies. Weights across ICPs sum to 1.0. Slugs are lowercase and hyphenated. Never guess a price. Do not include markdown code fences or preambles.`,
      userMessage: siteCopy.slice(0, 6000),
      maxTokens: 1000,
    });
    const jsonMatch = claudeResult.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn(`[field-resolvers] resolveColdOpenDerivedFields extraction failed for ${engagementId}:`, err);
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : "");

  const productName = str(parsed?.productName);
  const productValueProp = str(parsed?.productValueProp);
  const productPrice = str(parsed?.productPrice);
  const domain = await getPrimaryDomainForEngagement(engagementId);
  const productCandidate =
    wantProduct && productName && productValueProp
      ? { name: productName, url: domain ? `https://${domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}` : "", price: productPrice, valueProp: productValueProp }
      : null;

  const rawIcps = Array.isArray(parsed?.icps) ? (parsed?.icps as Array<Record<string, unknown>>) : [];
  const labelledIcps = rawIcps.filter((item) => str(item?.label));
  const icpCandidate: ColdOpenIcp[] | null =
    wantIcps && labelledIcps.length > 0
      ? labelledIcps.map((item, idx) => ({
          slug: (str(item.slug) || str(item.label)).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || `icp-${idx + 1}`,
          label: str(item.label),
          weight: typeof item.weight === "number" && item.weight > 0 ? item.weight : 1 / labelledIcps.length,
        }))
      : null;

  // 2. Jev scores the candidates against the same copy, and picks the tone,
  //    in one call.
  const questions: FieldQuestionMap = {};
  const state: Record<string, unknown> = { siteCopy };
  if (productCandidate) {
    state.proposedProductIdentity = { name: productCandidate.name, price: productCandidate.price || null, valueProp: productCandidate.valueProp };
    questions.productIdentityVerification = {
      type: "score",
      instructions:
        "Score how accurately the proposed product identity (name, price, value proposition) reflects what the site copy actually says. A missing price is correct when the copy states none; an invented price is wrong.",
      criteria: PRODUCT_IDENTITY_LEVELS,
    };
  }
  if (icpCandidate) {
    state.proposedIcps = icpCandidate.map((i) => i.label);
    questions.icpsVerification = {
      type: "score",
      instructions:
        "Score how accurately the proposed ideal customer profiles reflect who the site copy is actually written for and selling to.",
      criteria: ICP_LEVELS,
    };
  }
  // Sizing is proposed per ICP only when the ICPs themselves were just
  // extracted — the slugs must match what's suggested alongside them.
  const sizingIcps = wantSizing && icpCandidate ? icpCandidate : [];
  const disqualifiersBySlug: Record<string, string[]> = {};
  for (const [idx, icp] of sizingIcps.entries()) {
    const raw = labelledIcps[idx]?.disqualifiers;
    disqualifiersBySlug[icp.slug] = Array.isArray(raw) ? raw.map(str).filter(Boolean) : [];
    questions[`teamSize_${icp.slug}`] = {
      type: "choice",
      instructions: `Based on the site copy, what size are the companies in this target audience: "${icp.label}"?`,
      criteria: Object.fromEntries(Object.entries(TEAM_SIZE_BANDS).map(([band, b]) => [band, b.description])),
    };
  }
  const anyDisqualifiers = Object.values(disqualifiersBySlug).some((d) => d.length > 0);
  if (anyDisqualifiers) {
    state.proposedDisqualifiers = disqualifiersBySlug;
    questions.disqualifiersVerification = {
      type: "score",
      instructions: "Score how well the proposed per-audience exclusions follow from what the site copy says the offer is and isn't for.",
      criteria: DISQUALIFIER_LEVELS,
    };
  }

  if (wantVoice) {
    questions.voiceTone = {
      type: "choice",
      instructions: "Based on this website's marketing copy, what tone best characterizes their cold outreach and brand messaging?",
      criteria: {
        Professional: "Corporate, formal, authoritative, and structured copy.",
        Direct: "Concise, results-oriented, pitch-focused copy with zero fluff.",
        Casual: "Conversational, friendly, approachable, and lighthearted copy.",
        Warm: "Empathetic, consultative, relationship-first copy.",
      },
    };
  }
  if (Object.keys(questions).length === 0) {
    return { resolved: [], skipped: true };
  }

  // Jev only scores what Claude read. If it fails, the reading is still
  // written, unscored, so it shows as a suggestion to check instead of
  // leaving the setup blank.
  let result: Awaited<ReturnType<typeof askJev>> | null = null;
  try {
    result = await askJev({ state, questions, reading: { engagementId, purpose: "cold-open-derived" } });
  } catch (err) {
    console.warn(`[field-resolvers] resolveColdOpenDerivedFields: Jev failed for ${engagementId}, keeping Claude's reading unscored:`, err instanceof Error ? err.message : err);
  }
  const answers = result?.answers ?? {};
  const model = result?.model ?? "none";
  const resolved: string[] = [];

  if (productCandidate) {
    const answer = answers.productIdentityVerification;
    await upsertClientFact(engagementId, "productIdentity", productCandidate, {
      source: result ? "jev" : "llm",
      sourceDetail: "rawVoiceCorpus",
      confidence: scoreToConfidence(answer, PRODUCT_IDENTITY_LEVELS.length),
      evidence:
        answer && answer.type === "score"
          ? `Claude-extracted product identity scored ${answer.score.toFixed(2)}/${PRODUCT_IDENTITY_LEVELS.length - 1} by Jev against site copy (peakedness ${(answer.confidence * 100).toFixed(0)}%; model ${model}).`
          : "Claude-extracted product identity; Jev returned no score, so it stays a suggestion.",
    });
    resolved.push("productIdentity");
  }

  if (icpCandidate) {
    const answer = answers.icpsVerification;
    await upsertClientFact(engagementId, "icps", icpCandidate, {
      source: result ? "jev" : "llm",
      sourceDetail: "rawVoiceCorpus",
      confidence: scoreToConfidence(answer, ICP_LEVELS.length),
      evidence:
        answer && answer.type === "score"
          ? `Claude-extracted ICPs scored ${answer.score.toFixed(2)}/${ICP_LEVELS.length - 1} by Jev against site copy (peakedness ${(answer.confidence * 100).toFixed(0)}%; model ${model}).`
          : "Claude-extracted ICPs; Jev returned no score, so they stay a suggestion.",
    });
    resolved.push("icps");
  }

  if (sizingIcps.length > 0) {
    const bounds: Record<string, ColdOpenSizingBound> = {};
    const confidences: number[] = [];
    for (const icp of sizingIcps) {
      const band = answers[`teamSize_${icp.slug}`];
      const bandDef = band && band.type === "choice" ? TEAM_SIZE_BANDS[band.choice] : undefined;
      if (band && band.type === "choice" && bandDef && band.choice !== "unclear") confidences.push(Math.round(band.confidence * 100));
      bounds[icp.slug] = {
        ...(band && band.type === "choice" && bandDef && band.choice !== "unclear" ? { teamSizeMin: bandDef.min, teamSizeMax: bandDef.max } : {}),
        disqualifyIf: disqualifiersBySlug[icp.slug] ?? [],
      };
    }
    const disqConfidence = scoreToConfidence(answers.disqualifiersVerification, DISQUALIFIER_LEVELS.length);
    if (disqConfidence !== undefined) confidences.push(disqConfidence);
    const hasContent = Object.values(bounds).some((b) => b.teamSizeMin !== undefined || b.disqualifyIf.length > 0);
    if (hasContent) {
      await upsertClientFact(engagementId, "sizingBounds", bounds, {
        source: "jev",
        sourceDetail: "rawVoiceCorpus",
        // The weakest part decides: one confident band doesn't vouch for a
        // guessed exclusion list.
        confidence: confidences.length > 0 ? Math.min(...confidences) : undefined,
        evidence: `Team-size bands chosen by Jev per ICP; exclusions proposed by Claude and scored by Jev (model ${model}).`,
      });
      resolved.push("sizingBounds");
    }
  }

  const toneAnswer = answers.voiceTone;
  const toneChosen = toneAnswer && toneAnswer.type === "choice" ? toneAnswer : null;
  // No tone from Jev, no voice profile: a default tone is never stored as
  // read from the site (the setup screen offers its own marked default).
  if (wantVoice && toneChosen) {
    const extractedGreeting = str(parsed?.greeting);
    const extractedSignOff = str(parsed?.signOff);
    const greetingNote =
      extractedGreeting && extractedSignOff
        ? "greeting and sign-off extracted by Claude"
        : "greeting/sign-off not found in the copy, so the generic defaults are used";
    await upsertClientFact(
      engagementId,
      "voiceProfile",
      {
        // The greeting word only: Cold Open adds the first name and comma.
        greeting: extractedGreeting.replace(/\{+\s*first_?name\s*\}+/gi, "").replace(/[,:!\s]+$/, "").trim() || "Hi",
        signOff: extractedSignOff || "Best,",
        tone: toneChosen.choice,
      },
      {
        source: "jev",
        sourceDetail: "rawVoiceCorpus",
        confidence: Math.round(toneChosen.confidence * 100),
        evidence: `Tone "${toneChosen.choice}" chosen by Jev from site copy (model ${model}); ${greetingNote}.`,
      }
    );
    resolved.push("voiceProfile");
  }

  return { resolved, skipped: resolved.length === 0 };
}

// ── Deep site readings: score and pick ─────────────────────────────────
//
// The deep crawl (discovery-prefill.ts) reads much more than the offer:
// every tier, testimonials, FAQs, objections, booking links. Testimonials
// and FAQ questions are already checked word for word against the page;
// what's inferred or ambiguous goes through Jev here, choosing only among
// what the site actually shows:
//   - objections: scored as a list against the copy, like the reputation
//     lists above, so a list Claude stretched never reaches the briefs
//   - the main offer: with several tiers, which one people book a call
//     about (that's the one the confirmation page and briefs are about)
//   - the sales-call booking link: with several, which one books it

const OBJECTION_LEVELS = [
  "Fabricated: none of these worries follow from what the copy addresses",
  "Mostly wrong: at most one is a worry the copy actually answers",
  "Mixed: about half are worries the copy answers or clearly implies",
  "Mostly right: nearly all are worries the copy answers or clearly implies",
  "Fully right: every one is a worry the copy directly answers",
];

export async function resolveDeepSiteReadings(engagementId: string): Promise<{ resolved: string[]; skipped: boolean }> {
  const corpus = await getClientFact(engagementId, "rawVoiceCorpus");
  if (!corpus || typeof corpus.value !== "string" || !corpus.value.trim()) return { resolved: [], skipped: true };
  const siteCopy = corpus.value.slice(0, 40_000);

  const [objections, tiers, links, offerName] = await Promise.all([
    getClientFact(engagementId, "siteObjections"),
    getClientFact(engagementId, "offerTiers"),
    getClientFact(engagementId, "bookingLinks"),
    getClientFact(engagementId, "offerName"),
  ]);
  const open = (f: Awaited<ReturnType<typeof getClientFact>>) => Boolean(f) && f!.status === "suggested";

  const objectionList = open(objections) && Array.isArray(objections!.value) ? (objections!.value as string[]) : [];
  const tierList =
    Array.isArray(tiers?.value) && tiers!.status !== "rejected" ? (tiers!.value as { name: string; price?: string }[]).filter((t) => t?.name) : [];
  const linkList =
    Array.isArray(links?.value) && links!.status !== "rejected" ? (links!.value as { url: string; event?: string; platform: string }[]).filter((l) => l?.url) : [];
  // Only pick the main offer when a person hasn't settled it.
  const pickOffer = tierList.length >= 2 && (!offerName || offerName.status === "suggested");

  const questions: FieldQuestionMap = {};
  const state: Record<string, unknown> = { siteCopy };
  if (objectionList.length) {
    state.proposedObjections = objectionList;
    questions.objectionsVerification = {
      type: "score",
      instructions: "Score how well these proposed prospect worries match what the site copy actually answers or clearly implies.",
      criteria: OBJECTION_LEVELS,
    };
  }
  if (pickOffer) {
    questions.mainOffer = {
      type: "choice",
      instructions: "Which of these offers is the one prospects book a sales call about (usually the main, highest-touch offer)?",
      criteria: Object.fromEntries(tierList.slice(0, 50).map((t, i) => [String(i), `${t.name}${t.price ? ` (${t.price})` : ""}`])),
    };
  }
  if (linkList.length >= 2) {
    questions.salesCallLink = {
      type: "choice",
      instructions: "Which of these booking links books the sales or strategy call (not a support, onboarding or internal meeting)?",
      criteria: Object.fromEntries(linkList.slice(0, 50).map((l, i) => [String(i), `${l.url}${l.event ? ` (event: ${l.event})` : ""}`])),
    };
  }

  const resolved: string[] = [];
  // A single booking link is simply the one, no question needed.
  if (linkList.length === 1) {
    await upsertClientFact(engagementId, "salesCallBookingLink", linkList[0], {
      source: "website",
      sourceDetail: "bookingLinks",
      evidence: "The only booking link on the site.",
    });
    resolved.push("salesCallBookingLink");
  }
  if (Object.keys(questions).length === 0) return { resolved, skipped: resolved.length === 0 };

  const result = await askJev({ state, questions, reading: { engagementId, purpose: "deep-site-readings" } });

  const objectionScore = scoreToConfidence(result.answers.objectionsVerification, OBJECTION_LEVELS.length);
  if (objectionScore !== undefined) {
    await upsertClientFact(engagementId, "siteObjections", objectionList, {
      source: "jev",
      sourceDetail: "rawVoiceCorpus",
      confidence: objectionScore,
      evidence: `Read from the site by Claude, scored against the copy by Jev (model ${result.model}).`,
    });
    resolved.push("siteObjections");
  }

  const offerAnswer = result.answers.mainOffer;
  if (pickOffer && offerAnswer && offerAnswer.type === "choice") {
    const tier = tierList[Number(offerAnswer.choice)];
    if (tier) {
      const confidence = Math.round(offerAnswer.confidence * 100);
      const evidence = `Chosen by Jev as the offer people book a call about, from ${tierList.length} offers on the site (model ${result.model}).`;
      await upsertClientFact(engagementId, "offerName", tier.name, { source: "jev", sourceDetail: "offerTiers", confidence, evidence });
      if (tier.price) await upsertClientFact(engagementId, "offerPrice", tier.price, { source: "jev", sourceDetail: "offerTiers", confidence, evidence });
      resolved.push("offerName");
    }
  }

  const linkAnswer = result.answers.salesCallLink;
  if (linkAnswer && linkAnswer.type === "choice") {
    const link = linkList[Number(linkAnswer.choice)];
    if (link) {
      await upsertClientFact(engagementId, "salesCallBookingLink", link, {
        source: "jev",
        sourceDetail: "bookingLinks",
        confidence: Math.round(linkAnswer.confidence * 100),
        evidence: `Chosen by Jev from ${linkList.length} booking links on the site (model ${result.model}).`,
      });
      resolved.push("salesCallBookingLink");
    }
  }

  return { resolved, skipped: resolved.length === 0 };
}
