import { callClaudeWithRetry, MODEL } from "@/lib/llm";

export type RecoveryWindowDays = 14 | 21 | 30 | 45 | 60;

interface TouchSlot {
  id: string;
  offsetDays: number;
  purpose: string;
}

interface CadencePlan {
  emails: TouchSlot[];
  sms: TouchSlot[];
}

/**
 * Window-scaled touch maps, ported from recovery_sequence.md's "30-day
 * default cadence map" and its scaling table for 14/21/45/60-day windows.
 */
const CADENCE_PLANS: Record<RecoveryWindowDays, CadencePlan> = {
  14: {
    emails: [
      { id: "E1", offsetDays: 1, purpose: "Soft re-open" },
      { id: "E2", offsetDays: 4, purpose: "Quiet reminder" },
      { id: "E4", offsetDays: 8, purpose: "Direct ask" },
      { id: "E5", offsetDays: 13, purpose: "Last call" },
    ],
    sms: [
      { id: "S1", offsetDays: 1, purpose: "Quick text" },
      { id: "S2", offsetDays: 5, purpose: "Status check" },
      { id: "S3", offsetDays: 11, purpose: "Final SMS" },
    ],
  },
  21: {
    emails: [
      { id: "E1", offsetDays: 1, purpose: "Soft re-open" },
      { id: "E2", offsetDays: 4, purpose: "Quiet reminder" },
      { id: "E3", offsetDays: 9, purpose: "Useful resource" },
      { id: "E4", offsetDays: 14, purpose: "Direct ask" },
      { id: "E5", offsetDays: 20, purpose: "Last call" },
    ],
    sms: [
      { id: "S1", offsetDays: 1, purpose: "Quick text" },
      { id: "S2", offsetDays: 7, purpose: "Status check" },
      { id: "S3", offsetDays: 17, purpose: "Final SMS" },
    ],
  },
  30: {
    emails: [
      { id: "E1", offsetDays: 1, purpose: "Soft re-open" },
      { id: "E2", offsetDays: 4, purpose: "Quiet reminder" },
      { id: "E3", offsetDays: 11, purpose: "Useful resource" },
      { id: "E4", offsetDays: 17, purpose: "Direct ask" },
      { id: "E5", offsetDays: 27, purpose: "Last call" },
    ],
    sms: [
      { id: "S1", offsetDays: 1, purpose: "Quick text" },
      { id: "S2", offsetDays: 7, purpose: "Status check" },
      { id: "S3", offsetDays: 21, purpose: "Final SMS" },
    ],
  },
  45: {
    emails: [
      { id: "E1", offsetDays: 1, purpose: "Soft re-open" },
      { id: "E2", offsetDays: 5, purpose: "Quiet reminder" },
      { id: "E3", offsetDays: 13, purpose: "Useful resource" },
      { id: "E4", offsetDays: 25, purpose: "Direct ask" },
      { id: "E5", offsetDays: 41, purpose: "Last call" },
    ],
    sms: [
      { id: "S1", offsetDays: 1, purpose: "Quick text" },
      { id: "S2", offsetDays: 9, purpose: "Status check" },
      { id: "S3", offsetDays: 22, purpose: "Final SMS" },
      { id: "S4", offsetDays: 38, purpose: "Late-window nudge" },
    ],
  },
  60: {
    emails: [
      { id: "E1", offsetDays: 1, purpose: "Soft re-open" },
      { id: "E2", offsetDays: 5, purpose: "Quiet reminder" },
      { id: "E3", offsetDays: 13, purpose: "Useful resource" },
      { id: "E4", offsetDays: 25, purpose: "Direct ask" },
      { id: "E5", offsetDays: 41, purpose: "Last call" },
      { id: "E6", offsetDays: 56, purpose: "Final note before window close" },
    ],
    sms: [
      { id: "S1", offsetDays: 1, purpose: "Quick text" },
      { id: "S2", offsetDays: 11, purpose: "Status check" },
      { id: "S3", offsetDays: 28, purpose: "Late-window nudge" },
      { id: "S4", offsetDays: 50, purpose: "Final SMS" },
    ],
  },
};

const GHOST_DEFAULT_VOICE_GUARDRAILS = `
Ghost-default messaging rules — the copy must read cleanly whether the
prospect ghosted the call or actively cancelled it:
- Never blame the prospect for missing the call.
- Never imply the prospect "owes" a response.
- Never reference the rep's frustration or the rep's calendar.
- Always center the prospect's option to come back if useful, no pressure.
- Plain operator language, no marketing fluff, no guilt-tripping, no
  detective work about why they missed it.`.trim();

export interface CadenceBuilderInput {
  buyer: string;
  windowDays: RecoveryWindowDays;
  brandVoiceProfile?: any;
  offerDetails?: { name: string; icp: string };
  rescheduleUrlMergeField: string; // e.g. "{{reschedule_url}}" — platform-specific merge syntax
  firstNameMergeField: string; // e.g. "{{first_name}}"
  prospectMeets?: string;
}

export interface CadenceAsset {
  id: string;
  offsetDays: number;
  subject?: string;
  body: string;
}

/**
 * Generates the full win-back cadence (window-scaled emails + SMS) as a
 * single Claude call returning structured JSON, rather than one call per
 * touch — cheaper, and keeps voice/tone consistent across the sequence
 * since the model sees the whole arc at once.
 */
export async function buildRecoveryCadence(
  input: CadenceBuilderInput,
  runId?: string
): Promise<{ emails: CadenceAsset[]; sms: CadenceAsset[] }> {
  const plan = CADENCE_PLANS[input.windowDays];

  const system = `You are the copywriting engine for Win-Back, a recovery cadence for
prospects who cancelled or no-showed a sales call for ${input.buyer}.

${GHOST_DEFAULT_VOICE_GUARDRAILS}

Brand voice profile: ${JSON.stringify(input.brandVoiceProfile ?? {})}
Offer context: ${JSON.stringify(input.offerDetails ?? {})}
The prospect will be meeting with: ${input.prospectMeets ?? "our team"}

Use exactly this merge syntax verbatim in the copy where relevant:
- First name: ${input.firstNameMergeField}
- Reschedule link: ${input.rescheduleUrlMergeField}

Email guidance by id:
- E1 (Soft re-open): open with "we did not connect" or "we missed you", offer reschedule, low-stakes signoff.
- E2 (Quiet reminder): 3-5 sentences, the reschedule link is the centerpiece.
- E3 (Useful resource): reference that a useful resource will be linked here (do not invent a real URL — write "[resource link]" as a placeholder), soft re-engagement, no hard ask.
- E4 (Direct ask): more direct — either they still want the conversation or they don't, reschedule link included.
- E5 / E6 (Last call): clean, short, last touch, implicitly frames that occasional updates may continue.

SMS guidance: each message is under 160 characters including the merge
fields, ends with "Reply STOP to opt out", first-name merge only where it
fits naturally.

Return ONLY a JSON object with this exact shape, no prose, no markdown
fences:
{
  "emails": [{"id": "E1", "subject": "...", "body": "..."}, ...],
  "sms": [{"id": "S1", "body": "..."}, ...]
}
Include every email id and sms id listed below, in order.`;

  const userMessage = `Generate the cadence for this touch plan:
Emails: ${plan.emails.map((e) => `${e.id} (${e.purpose})`).join(", ")}
SMS: ${plan.sms.map((s) => `${s.id} (${s.purpose})`).join(", ")}`;

  const result = await callClaudeWithRetry({
    model: MODEL.SYNTHESIS,
    system,
    userMessage,
    maxTokens: 2500,
    runId,
  });

  let parsed: { emails: Array<{ id: string; subject: string; body: string }>; sms: Array<{ id: string; body: string }> };
  try {
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Win-back cadence generation returned non-JSON output: ${result.text.slice(0, 200)}`
    );
  }

  const emails: CadenceAsset[] = plan.emails.map((slot) => {
    const match = parsed.emails.find((e) => e.id === slot.id);
    if (!match) throw new Error(`Cadence generation missing email ${slot.id}`);
    return { id: slot.id, offsetDays: slot.offsetDays, subject: match.subject, body: match.body };
  });

  const sms: CadenceAsset[] = plan.sms.map((slot) => {
    const match = parsed.sms.find((s) => s.id === slot.id);
    if (!match) throw new Error(`Cadence generation missing SMS ${slot.id}`);
    return { id: slot.id, offsetDays: slot.offsetDays, body: match.body };
  });

  return { emails, sms };
}

/**
 * Enforces daily_send_tolerance against the generated plan: if two touches
 * land on the same day and the buyer's tolerance is 1, the later touch
 * (by convention, SMS over email — matches recovery_sequence.md's example
 * of S1 moving to Day 2) is pushed to the next day. Returns adjusted
 * copies, does not mutate the input arrays.
 */
export function enforceDailySendTolerance(
  emails: CadenceAsset[],
  sms: CadenceAsset[],
  dailySendTolerance = 2
): { emails: CadenceAsset[]; sms: CadenceAsset[]; adjustments: string[] } {
  if (dailySendTolerance >= 2) {
    return { emails, sms, adjustments: [] };
  }

  const adjustments: string[] = [];
  const emailDays = new Set(emails.map((e) => e.offsetDays));
  const adjustedSms = sms.map((s) => {
    if (emailDays.has(s.offsetDays)) {
      adjustments.push(
        `${s.id} moved from Day ${s.offsetDays} to Day ${s.offsetDays + 1} to respect daily_send_tolerance=1 (email already scheduled that day).`
      );
      return { ...s, offsetDays: s.offsetDays + 1 };
    }
    return s;
  });

  return { emails, sms: adjustedSms, adjustments };
}
