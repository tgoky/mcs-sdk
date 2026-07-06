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
  const system = `You are an ad creative strategist writing CREATIVE BRIEFS (not finished ad
scripts) for ${input.buyer}. A brief tells a copywriter/video editor what
to make — a hook, an angle, talking points, a suggested visual format, and
a CTA — not the final word-for-word ad copy itself.

Match the tone described in this brand voice profile as closely as
possible: ${JSON.stringify(input.brandVoiceProfile ?? {})}

Offer: ${JSON.stringify(input.offerDetails ?? {})}
Top call questions on file: ${JSON.stringify(input.topCallQuestions ?? [])}
Top objections on file: ${JSON.stringify(input.topObjections ?? [])}
Existing proof on file: ${JSON.stringify(input.existingProof?.testimonials ?? [])}

Generate exactly one brief per pillar below. If the relevant source data
above is empty for a pillar (e.g., no testimonials on file for
success_proof), write a brief that's honest about needing that input
rather than fabricating a specific claim, testimonial, or statistic.

Pillars:
${PILLARS.map((p) => `- ${p.id}: ${p.description}`).join("\n")}

For each brief:
- hook: the first line/visual beat that stops the scroll — specific, not generic.
- angle: 1-2 sentences on the core message/emotional angle.
- talkingPoints: 3-4 concrete points the creative should hit, in order.
- suggestedFormat: a concrete format suggestion (e.g. "UGC-style testimonial, handheld", "Founder talking-head, direct to camera", "Text-overlay stat hook with voiceover", "Before/after split-screen").
- cta: the exact call-to-action line to close on.

Return ONLY a JSON object with this exact shape, no prose, no markdown fences:
{ "briefs": [{"pillar": "common_questions", "hook": "...", "angle": "...", "talkingPoints": ["...", "..."], "suggestedFormat": "...", "cta": "..."}, ...] }
Include all 4 pillars, in the order listed above.`;

  const result = await callClaudeWithRetry({
    model: MODEL.SYNTHESIS,
    system,
    userMessage: "Generate the 4 ad creative briefs now.",
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

  const briefs: AdCreativeBrief[] = PILLARS.map((pillar, i) => {
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

  return { briefs };
}
