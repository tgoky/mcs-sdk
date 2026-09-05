import { callClaudeWithRetry, MODEL } from "@/lib/llm";

export interface AdCreativeBrief {
  id: string;
  pillar: "common_questions" | "deeper_questions" | "success_proof" | "objections";
  hook: string;
  angle: string;
  talkingPoints: string[];
  suggestedFormat: string;
  cta: string;
}

export interface AdCreativeBriefsInput {
  buyer: string;
  brandVoiceProfile?: any;
  offerDetails?: { name: string; price: string; icp: string; traffic_temperature: string };
  topCallQuestions?: string[];
  topObjections?: string[];
  existingProof?: { testimonials: Array<{ name: string; role: string; company?: string; quote: string }> };
}

const PILLARS: Array<{ id: AdCreativeBrief["pillar"]; description: string }> = [
  { id: "common_questions", description: "Addresses the single most-asked question prospects have before booking a call — the surface-level, easy-to-answer one." },
  { id: "deeper_questions", description: "Addresses a more nuanced, considered question — the kind someone asks after they've already done some research, not their first question." },
  { id: "success_proof", description: "Leads with a concrete result or testimonial, not a claim about the offer itself." },
  { id: "objections", description: "Meets the single most common reason a qualified prospect hesitates to book, head-on." },
];

/**
 * Fixed, human-written stand-in for the success_proof brief when there's
 * no real testimonial to build it around. Previously the model was asked
 * to write this brief anyway with instructions to "be honest about
 * needing that input rather than fabricating a claim" — technically
 * correct, but what it actually produced was bracketed, prompt-engineer-
 * style text like "[NEEDS INPUT: a specific result...]" landing directly
 * in the buyer's hook field, reading like a broken template instead of a
 * next step. This is deterministic instead: no model call for this
 * pillar at all when there's nothing to work with, so the copy is
 * controlled and always makes sense to the person reading it.
 */
const NEEDS_PROOF_BRIEF: Omit<AdCreativeBrief, "id"> = {
  pillar: "success_proof",
  hook: "This brief needs a real result to lead with.",
  angle:
    "A success-proof ad leads with something a real client actually said or achieved — not a general claim about the offer. Add a testimonial or a specific before/after result under Client Details → Voice & proof, then regenerate this brief.",
  talkingPoints: [],
  suggestedFormat: "",
  cta: "",
};

/**
 * Generates one structured ad creative brief per content pillar — a brief
 * a copywriter or video editor works FROM, not finished ad copy itself.
 * Same generation-only philosophy as buildRecoveryCadence/buildLongTermNurture:
 * this produces something the buyer loads into their own ad platform
 * (Meta Ads Manager, TikTok Ads, etc.) and has a real editor/creator
 * produce, not something this app publishes itself.
 *
 * Deliberately exactly 4 briefs (one per pillar) rather than the original
 * spec's "3 to 5" range: a 1:1 pillar mapping is unambiguous, and "3 to 5
 * across 4 pillars" leaves genuinely underspecified which pillar(s) get a
 * second brief — better to ship a clear, defensible interpretation than
 * guess at that.
 *
 * Directly reuses topCallQuestions/topObjections/existingProof — fields
 * this app's onboarding already collects for other purposes, and a close
 * match for 3 of the 4 pillars' actual input data.
 */
export async function buildAdCreativeBriefs(
  input: AdCreativeBriefsInput,
  runId?: string
): Promise<{ briefs: AdCreativeBrief[] }> {
  const hasProof = (input.existingProof?.testimonials?.length ?? 0) > 0;
  // success_proof is the one pillar whose entire premise doesn't exist
  // without real input — the other three (questions, objections) always
  // have something reasonable to say even from an empty list. Excluded
  // from the model call entirely when there's nothing to work with; see
  // NEEDS_PROOF_BRIEF above for what fills its slot instead.
  const pillarsToGenerate = hasProof ? PILLARS : PILLARS.filter((p) => p.id !== "success_proof");

  const system = `You are an ad creative strategist writing CREATIVE BRIEFS (not finished ad
scripts) for ${input.buyer}. A brief tells a copywriter/video editor what
to make — a hook, an angle, talking points, a suggested visual format, and
a CTA — not the final word-for-word ad copy itself.

Match the tone described in this brand voice profile as closely as
possible: ${JSON.stringify(input.brandVoiceProfile ?? {})}

Offer: ${JSON.stringify(input.offerDetails ?? {})}
Top call questions on file: ${JSON.stringify(input.topCallQuestions ?? [])}
Top objections on file: ${JSON.stringify(input.topObjections ?? [])}
${hasProof ? `Existing proof on file: ${JSON.stringify(input.existingProof?.testimonials ?? [])}` : ""}

Generate exactly one brief per pillar below, using only the real data
given above — never fabricate a specific claim, testimonial, or statistic
that isn't backed by it.

Pillars:
${pillarsToGenerate.map((p) => `- ${p.id}: ${p.description}`).join("\n")}

For each brief:
- hook: the first line/visual beat that stops the scroll — specific, not generic.
- angle: 1-2 sentences on the core message/emotional angle.
- talkingPoints: 3-4 concrete points the creative should hit, in order.
- suggestedFormat: a concrete format suggestion (e.g. "UGC-style testimonial, handheld", "Founder talking-head, direct to camera", "Text-overlay stat hook with voiceover", "Before/after split-screen").
- cta: the exact call-to-action line to close on.

Return ONLY a JSON object with this exact shape, no prose, no markdown fences:
{ "briefs": [{"pillar": "${pillarsToGenerate[0].id}", "hook": "...", "angle": "...", "talkingPoints": ["...", "..."], "suggestedFormat": "...", "cta": "..."}, ...] }
Include all ${pillarsToGenerate.length} pillar(s) listed above, in the order listed.`;

  const result = await callClaudeWithRetry({
    model: MODEL.SYNTHESIS,
    system,
    userMessage: `Generate the ${pillarsToGenerate.length} ad creative brief(s) now.`,
    maxTokens: 2500,
    runId,
  });

  let parsed: { briefs: Array<Omit<AdCreativeBrief, "id">> };
  try {
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Ad creative brief generation returned non-JSON output: ${result.text.slice(0, 200)}`);
  }

  const generatedBriefs: AdCreativeBrief[] = pillarsToGenerate.map((pillar, i) => {
    const match = parsed.briefs.find((b: any) => b.pillar === pillar.id) ?? parsed.briefs[i];
    if (!match) throw new Error(`Ad creative brief generation missing pillar ${pillar.id}`);
    return {
      id: `brief_${pillar.id}`,
      pillar: pillar.id,
      hook: match.hook,
      angle: match.angle,
      talkingPoints: match.talkingPoints ?? [],
      suggestedFormat: match.suggestedFormat,
      cta: match.cta,
    };
  });

  const generatedByPillar = new Map(generatedBriefs.map((b) => [b.pillar, b]));
  const briefs: AdCreativeBrief[] = PILLARS.map(
    (pillar) => generatedByPillar.get(pillar.id) ?? { id: `brief_${pillar.id}`, ...NEEDS_PROOF_BRIEF }
  );

  return { briefs };
}

/**
 * Regenerates ONLY the objections brief, using a fresh topObjections list.
 * Exists for the conversation-intelligence loop: a new objection mined
 * from a live call should update the Objections brief without touching
 * the other 3 pillars, which have nothing to do with call transcripts and
 * would otherwise silently drift (a fresh Claude call reworking all 4
 * pillars together tends to rephrase things that didn't need to change,
 * on top of costing 4x the tokens for 1 pillar's worth of new input).
 *
 * Callers splice the returned brief into the stored briefs array in place
 * of the existing "objections" entry — this function only ever produces
 * that one brief, it never returns or assumes anything about the other 3.
 */
export async function regenerateObjectionsBrief(
  input: AdCreativeBriefsInput,
  runId?: string
): Promise<AdCreativeBrief> {
  const pillar = PILLARS.find((p) => p.id === "objections")!;

  const system = `You are an ad creative strategist writing a single CREATIVE BRIEF (not a
finished ad script) for ${input.buyer}. A brief tells a copywriter/video
editor what to make — a hook, an angle, talking points, a suggested
visual format, and a CTA — not the final word-for-word ad copy itself.

Match the tone described in this brand voice profile as closely as
possible: ${JSON.stringify(input.brandVoiceProfile ?? {})}

Offer: ${JSON.stringify(input.offerDetails ?? {})}
Top objections on file, including any just mined from a live sales call:
${JSON.stringify(input.topObjections ?? [])}

Write ONE brief for this pillar: ${pillar.description}
Prioritize the most recently-added objection(s) in the list above if
several are present — that's the freshest signal of what's actually
costing deals right now.

- hook: the first line/visual beat that stops the scroll — specific, not generic.
- angle: 1-2 sentences on the core message/emotional angle.
- talkingPoints: 3-4 concrete points the creative should hit, in order.
- suggestedFormat: a concrete format suggestion (e.g. "UGC-style testimonial, handheld", "Founder talking-head, direct to camera", "Text-overlay stat hook with voiceover", "Before/after split-screen").
- cta: the exact call-to-action line to close on.

Return ONLY a JSON object with this exact shape, no prose, no markdown fences:
{"hook": "...", "angle": "...", "talkingPoints": ["...", "..."], "suggestedFormat": "...", "cta": "..."}`;

  const result = await callClaudeWithRetry({
    model: MODEL.SYNTHESIS,
    system,
    userMessage: "Generate the objections brief now.",
    maxTokens: 800,
    runId,
  });

  let match: Omit<AdCreativeBrief, "id" | "pillar">;
  try {
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    match = JSON.parse(cleaned);
  } catch {
    throw new Error(`Objections brief regeneration returned non-JSON output: ${result.text.slice(0, 200)}`);
  }

  return {
    id: "brief_objections",
    pillar: "objections",
    hook: match.hook,
    angle: match.angle,
    talkingPoints: match.talkingPoints ?? [],
    suggestedFormat: match.suggestedFormat,
    cta: match.cta,
  };
}
