import { callClaudeWithRetry, MODEL } from "@/lib/llm";

export interface ScriptBuilderInput {
  buyer: string;
  brandVoiceProfile?: any;
  offerDetails?: {
    name: string;
    price: string;
    icp: string;
    traffic_temperature: "cold" | "warm" | "hot";
  };
  topCallQuestions?: string[];
  prospectMeets?: string;
  existingProof?: {
    testimonials: Array<{ name: string; role: string; company?: string; quote: string }>;
  };
}

export interface HeroScript {
  title: string;
  targetLengthSeconds: number;
  chapters: Array<{ timestampLabel: string; beat: string; script: string }>;
  recordingPrompt: string;
}

export interface BreakoutScript {
  id: string;
  title: string;
  targetLengthSeconds: number;
  script: string;
  recordingPrompt: string;
  sourceQuestion?: string;
}

export interface ScriptPack {
  heroScript: HeroScript;
  breakoutScripts: BreakoutScript[];
}

/**
 * Pin-Down recovery gap 3 — restores the OG SKILL.md's hero + 3-to-5
 * breakout video script deliverable, which UTP's page-builder.ts never
 * generated (it only ever rendered "recording pending" placeholders — see
 * the video-placeholder divs there). This is the actual content a video
 * producer or the founder/coach on camera works from.
 *
 * Mirrors buildAdCreativeBriefs' generation-only philosophy: this
 * produces scripts the buyer's own recorder/editor turns into video, not
 * something this app renders or hosts as video itself. Called once during
 * Pin-Down onboarding (onboarding-service.ts), same lifecycle as the ad
 * creative briefs and the recovery cadence content.
 *
 * Hero approach and target length reuse the exact same selection logic
 * page-builder.ts already has (cold + complex -> Research Assistance,
 * warm/hot + high price -> Urgency, else FAQ) — duplicated here rather
 * than imported, since page-builder.ts's selectHeroApproach isn't
 * exported and the two call sites have historically drifted in this
 * codebase (see enrollment-service.ts's classifyBookingEvent comment for
 * why that's worth avoiding going forward). Exporting and sharing it is a
 * safe, mechanical follow-up if this drifts.
 */
function selectHeroApproach(
  offer?: ScriptBuilderInput["offerDetails"]
): { approach: "research_assistance" | "urgency" | "faq"; targetLengthSeconds: number } {
  if (!offer) return { approach: "faq", targetLengthSeconds: 105 };
  const price = parseFloat(String(offer.price).replace(/[^0-9.]/g, "")) || 0;
  const complex = price > 5000;
  if (offer.traffic_temperature === "cold" && complex) {
    return { approach: "research_assistance", targetLengthSeconds: 150 };
  }
  if (offer.traffic_temperature !== "cold" && price > 10000) {
    return { approach: "urgency", targetLengthSeconds: 75 };
  }
  return { approach: "faq", targetLengthSeconds: 105 };
}

const APPROACH_BRIEF: Record<string, string> = {
  research_assistance:
    "Frame the call as a working session, not a pitch — the prospect is cold traffic evaluating a complex/high-consideration offer, so the video should lower anxiety by explaining what research/prep the team does before the call, not sell.",
  urgency:
    "The prospect is warm/hot and the offer is high-price — the video should reinforce that they made the right call booking, build anticipation, and set a confident, decisive tone without being pushy.",
  faq: "Standard warm-lead confirmation tone — friendly, clear, sets expectations for what happens on the call.",
};

/**
 * Picks 3 to 5 breakout topics from the buyer's actual top call questions,
 * falling back to generic-but-honest placeholders when fewer than 3
 * questions are on file — never fabricates specific claims about the
 * offer the way the ad-creative-briefs generator avoids fabricating
 * testimonials.
 */
function selectBreakoutTopics(topCallQuestions: string[]): string[] {
  const cleaned = topCallQuestions.filter(Boolean);
  if (cleaned.length >= 3) return cleaned.slice(0, 5);
  const fallbacks = [
    "What happens on the call itself, step by step",
    "Who this is (and isn't) a good fit for",
    "What to bring or prepare before the call",
  ];
  return [...cleaned, ...fallbacks].slice(0, Math.max(3, cleaned.length));
}

export async function buildScriptPack(input: ScriptBuilderInput, runId?: string): Promise<ScriptPack> {
  const { approach, targetLengthSeconds } = selectHeroApproach(input.offerDetails);
  const host = input.prospectMeets ?? "our team";
  const breakoutTopics = selectBreakoutTopics(input.topCallQuestions ?? []);
  const testimonials = (input.existingProof?.testimonials ?? []).filter((t) => t.name && t.role && t.quote);

  const system = `You are a direct-response video scriptwriter writing SCRIPTS (word-for-word,
not just an outline) for a post-booking confirmation page, for ${input.buyer}.
${host} will be on camera.

Match the tone in this brand voice profile as closely as possible:
${JSON.stringify(input.brandVoiceProfile ?? {})}

Offer: ${JSON.stringify(input.offerDetails ?? {})}
Approach for the hero video: ${approach} — ${APPROACH_BRIEF[approach]}
Target hero length: ~${targetLengthSeconds} seconds (roughly ${Math.round(targetLengthSeconds / 6)}-${Math.round(
    (targetLengthSeconds * 1.3) / 6
  )} words at a natural talking pace).
Existing proof on file: ${JSON.stringify(testimonials)}

Write ONE hero script broken into 3-4 chapters (each chapter is a distinct
beat: e.g. "Welcome + what to expect", "Why this call matters",
"What happens next"), and ONE breakout script per topic below (each a
tight, single-question answer, 30-60 seconds).

Breakout topics (write exactly one script per topic, in this order):
${breakoutTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Rules:
- Word-for-word script text, not a bullet outline — this is read/performed
  on camera as written.
- Speak AS ${host} to the prospect directly ("you"), never third person.
- Never fabricate a specific stat, testimonial, or claim not present in
  the existing proof data above — if you want to reference proof and none
  is on file, speak generally about outcomes instead.
- No stage directions in the script text itself; put those in the
  recordingPrompt field instead.

Return ONLY a JSON object with this exact shape, no prose, no markdown fences:
{
  "heroScript": {
    "title": "string",
    "chapters": [{"timestampLabel": "e.g. 0:00-0:20", "beat": "short label", "script": "word-for-word script for this chapter"}],
    "recordingPrompt": "1-2 sentences of framing/setting/wardrobe/energy guidance for whoever records this"
  },
  "breakoutScripts": [
    {"title": "string", "script": "word-for-word script", "recordingPrompt": "1 sentence of framing guidance", "sourceQuestion": "the exact topic string this answers"}
  ]
}
Include exactly ${breakoutTopics.length} breakoutScripts, one per topic listed above, in the same order.`;

  const result = await callClaudeWithRetry({
    model: MODEL.SYNTHESIS,
    system,
    userMessage: "Generate the hero script and all breakout scripts now.",
    maxTokens: 4000,
    runId,
  });

  let parsed: {
    heroScript: { title: string; chapters: Array<{ timestampLabel: string; beat: string; script: string }>; recordingPrompt: string };
    breakoutScripts: Array<{ title: string; script: string; recordingPrompt: string; sourceQuestion?: string }>;
  };
  try {
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Script pack generation returned non-JSON output: ${result.text.slice(0, 200)}`);
  }

  if (!parsed.heroScript || !Array.isArray(parsed.breakoutScripts)) {
    throw new Error("Script pack generation returned an incomplete shape (missing heroScript or breakoutScripts).");
  }

  return {
    heroScript: {
      title: parsed.heroScript.title,
      targetLengthSeconds,
      chapters: parsed.heroScript.chapters ?? [],
      recordingPrompt: parsed.heroScript.recordingPrompt ?? "",
    },
    breakoutScripts: parsed.breakoutScripts.map((b, i) => ({
      id: `breakout_${i + 1}`,
      title: b.title,
      targetLengthSeconds: 45,
      script: b.script,
      recordingPrompt: b.recordingPrompt ?? "",
      sourceQuestion: b.sourceQuestion ?? breakoutTopics[i],
    })),
  };
}
