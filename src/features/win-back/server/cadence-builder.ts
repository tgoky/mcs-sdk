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
 * Fixed monthly touch plan for lost-deal long-term nurture: 9 touches
 * across 9 months (the middle of the audit spec's "6 to 12 month" range —
 * long enough to be genuinely low-velocity, short enough that generated
 * copy referencing "today's" offer context doesn't go stale for a full
 * year before anyone revisits it). Unlike the recovery cadence, there's
 * no window-size variant here — a "lost" deal isn't scored by urgency the
 * way an active recovery window is.
 */
const LONG_TERM_NURTURE_PLAN: TouchSlot[] = [
  { id: "N1", offsetDays: 30, purpose: "No-pressure check-in" },
  { id: "N2", offsetDays: 60, purpose: "Useful resource or insight" },
  { id: "N3", offsetDays: 90, purpose: "Light re-open" },
  { id: "N4", offsetDays: 120, purpose: "Social proof / case study" },
  { id: "N5", offsetDays: 150, purpose: "Useful resource or insight" },
  { id: "N6", offsetDays: 180, purpose: "Light re-open" },
  { id: "N7", offsetDays: 210, purpose: "Social proof / case study" },
  { id: "N8", offsetDays: 240, purpose: "Useful resource or insight" },
  { id: "N9", offsetDays: 270, purpose: "Final light re-open" },
];

export interface LongTermNurtureInput {
  buyer: string;
  brandVoiceProfile?: any;
  offerDetails?: { name: string; icp: string };
  rescheduleUrlMergeField: string;
  firstNameMergeField: string;
  prospectMeets?: string;
}

/**
 * Generates the long-term "lost deal" nurture sequence — same
 * single-call, structured-JSON approach as buildRecoveryCadence, and same
 * content-generation-only philosophy: this returns copy for the buyer to
 * load into their own platform's automation builder, it does not send
 * anything itself. Called by the lost-deal sweep once per engagement (not
 * once per lost prospect — the copy doesn't need to vary by who went
 * cold, same as the recovery cadence being engagement-level).
 */
export async function buildLongTermNurture(
  input: LongTermNurtureInput,
  runId?: string
): Promise<{ emails: CadenceAsset[] }> {
  const system = `You are the copywriting engine for a long-term, low-velocity nurture
sequence for prospects who went all the way through ${input.buyer}'s active
recovery window without rebooking a call, and are now considered a "lost"
deal for now — not gone forever.

${GHOST_DEFAULT_VOICE_GUARDRAILS}

This is explicitly LOW-PRESSURE, LONG-HORIZON messaging — monthly cadence,
not a recovery push. No urgency language, no countdown framing, no
"last chance" energy anywhere in this sequence. Assume the reader has not
thought about this offer in weeks; each email should stand alone without
requiring memory of the previous one.

Brand voice profile: ${JSON.stringify(input.brandVoiceProfile ?? {})}
Offer context: ${JSON.stringify(input.offerDetails ?? {})}
The prospect will be meeting with: ${input.prospectMeets ?? "our team"}

Use exactly this merge syntax verbatim in the copy where relevant:
- First name: ${input.firstNameMergeField}
- Reschedule link: ${input.rescheduleUrlMergeField}

Email guidance by id:
- N1 (No-pressure check-in): brief, no ask beyond "here if useful."
- N2/N5/N8 (Useful resource or insight): reference that a useful resource will be linked here (write "[resource link]" as a placeholder, do not invent a real URL) — teach something, no pitch.
- N3/N6 (Light re-open): mention the reschedule link once, framed as an option, not a push.
- N4/N7 (Social proof / case study): reference a result achieved by someone with a similar starting point (write "[case study link]" as a placeholder) — no fabricated specific numbers or names.
- N9 (Final light re-open): closes the sequence, reschedule link included, warm and open-ended, no "this is your last email" framing.

Return ONLY a JSON object with this exact shape, no prose, no markdown fences:
{ "emails": [{"id": "N1", "subject": "...", "body": "..."}, ...] }
Include every email id listed below, in order.`;

  const userMessage = `Generate the sequence for this touch plan:
Emails: ${LONG_TERM_NURTURE_PLAN.map((e) => `${e.id} (${e.purpose})`).join(", ")}`;

  const result = await callClaudeWithRetry({
    model: MODEL.SYNTHESIS,
    system,
    userMessage,
    maxTokens: 3000,
    runId,
  });

  let parsed: { emails: Array<{ id: string; subject: string; body: string }> };
  try {
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Long-term nurture generation returned non-JSON output: ${result.text.slice(0, 200)}`
    );
  }

  const emails: CadenceAsset[] = LONG_TERM_NURTURE_PLAN.map((slot) => {
    const match = parsed.emails.find((e) => e.id === slot.id);
    if (!match) throw new Error(`Long-term nurture generation missing email ${slot.id}`);
    return { id: slot.id, offsetDays: slot.offsetDays, subject: match.subject, body: match.body };
  });

  return { emails };
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
