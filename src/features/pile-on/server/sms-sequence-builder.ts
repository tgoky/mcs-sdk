import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { appendComplianceFooter } from "@/lib/platforms/sms";

export interface SmsSequenceInput {
  buyer: string;
  brandVoiceProfile?: any;
  offerDetails?: {
    name: string;
    price: string;
    icp: string;
    traffic_temperature: "cold" | "warm" | "hot";
  };
  topObjections?: string[];
  complianceFooterVariant?: "standard" | "custom";
  complianceFooterCustom?: string;
}

export interface SmsMessage {
  id: string;
  offsetMinutes: number; // relative to booking creation — 0, then spaced ahead of the call
  body: string;
}

/**
 * Pile-On recovery gap 1 — SMS content generation.
 *
 * Mirrors script-builder.ts's generation-only philosophy: this produces
 * the 2-3 SMS bodies the buyer's account actually sends (via
 * src/inngest/pile-on-sms.ts for Twilio/GHL, or via HubSpot's tag-based
 * path), not something this function sends itself. Generated once during
 * Pin-Down onboarding, same lifecycle as the ad creative briefs and hero/
 * breakout scripts.
 *
 * Offsets are minutes-based rather than days-based (unlike Win-Back's
 * multi-week recovery cadence) because Pile-On's SMS sequence lives
 * entirely inside the pre-call window — hours, not weeks — between
 * booking and the call itself.
 */
export async function buildSmsSequence(input: SmsSequenceInput, runId?: string): Promise<SmsMessage[]> {
  const system = `You write SMS copy for a pre-call confirmation sequence, for ${input.buyer}.
Match this brand voice as closely as SMS's terse format allows:
${JSON.stringify(input.brandVoiceProfile ?? {})}

Offer: ${JSON.stringify(input.offerDetails ?? {})}
Top objections on file (use at most one, only if it fits naturally — don't force it): ${JSON.stringify(input.topObjections ?? [])}

Write exactly 3 SMS messages for the pre-call sequence:
1. Immediate booking confirmation — warm, short, sets the date/time expectation (assume the actual date/time is merge-tagged in by the platform, don't invent one).
2. A reminder/value-reinforcement message sent partway through the wait, reinforcing why the call is worth keeping.
3. A final reminder shortly before the call, with a clear "see you soon" close.

Hard rules:
- Each message under 320 characters (2 SMS segments), ideally under 160 (1 segment).
- No emoji unless the brand voice explicitly reads as casual/playful.
- Never fabricate a specific stat or claim not present in the offer/voice data above.
- Do not include a STOP/HELP compliance line yourself — that's appended separately.
- Plain text only, no markdown.

Return ONLY a JSON array, no prose, no markdown fences:
[{"body": "message 1 text"}, {"body": "message 2 text"}, {"body": "message 3 text"}]`;

  const result = await callClaudeWithRetry({
    model: MODEL.FAST,
    system,
    userMessage: "Generate the 3 SMS messages now.",
    maxTokens: 800,
    runId,
  });

  let parsed: Array<{ body: string }>;
  try {
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`SMS sequence generation returned non-JSON output: ${result.text.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("SMS sequence generation returned an empty or invalid array.");
  }

  // Offsets: immediate, +waiting-period-midpoint (24h as a sane default
  // for most pre-call windows — actual send timing is capped against the
  // call time itself by pile-on-sms.ts, which never fires a message after
  // the call has started), and a short-before-call reminder.
  const offsets = [0, 24 * 60, 60];

  return parsed.slice(0, 3).map((m, i) => ({
    id: `sms_${i + 1}`,
    offsetMinutes: offsets[i] ?? offsets[offsets.length - 1],
    body: appendComplianceFooter(m.body, input.complianceFooterVariant, input.complianceFooterCustom),
  }));
}
