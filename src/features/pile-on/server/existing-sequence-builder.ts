import { KlaviyoClient, HubSpotClient } from "@/lib/platforms/email";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";

/**
 * Pile-On recovery gap 4 — existing-sequence audit.
 *
 * The OG SKILL.md's Discovery phase, when it found a buyer already
 * running a pre-call sequence, crawled every email (subject, body, send
 * delay, exit conditions, historical open/click where readable), scored
 * it against the four content pillars, and produced a keep/replace/merge/
 * drop recommendation per email — never silently overwriting what was
 * there. UTP dropped this entirely.
 *
 * Only Klaviyo and HubSpot expose a flows/workflows read API this can use
 * (per the transfer analysis: "some platforms restrict" read access at
 * flow granularity) — ActiveCampaign, ConvertKit, and Mailchimp aren't
 * attempted here; the audit reports `supported: false` with a reason for
 * those rather than pretending to have read something it didn't.
 *
 * Open/click rates are NOT pulled here — Klaviyo's Flow Values Reports
 * API and HubSpot's workflow analytics both require additional scopes/
 * endpoints beyond what this app's existing credential setup requests,
 * and guessing at engagement numbers would be worse than omitting them.
 * openRate/clickRate are always null today; the field exists in the
 * schema so a future pass can fill it in without another migration.
 */

const CONTENT_PILLARS = ["common_questions", "deeper_questions", "success_proof", "objections"] as const;

export interface ExistingSequenceAuditResult {
  auditedAt: string;
  platform: string;
  supported: boolean;
  unsupportedReason?: string;
  emails: Array<{
    subject: string;
    sendDelayDays: number | null;
    openRate: number | null;
    clickRate: number | null;
    pillarScores: Record<string, number>;
    recommendation: "keep" | "replace" | "merge" | "drop" | "investigate_before_changing";
    reasoning: string;
  }>;
  recommendedWorkflowLabel: string;
}

interface RawEmail {
  subject: string;
  bodyPreview: string;
  sendDelayDays: number | null;
}

async function findExistingSequenceEmails(
  emailPlatform: string,
  apiKey: string
): Promise<{ supported: true; emails: RawEmail[] } | { supported: false; reason: string }> {
  const nameHints = ["pre-call", "precall", "booking", "confirmation", "pile-on", "pile on"];

  switch (emailPlatform) {
    case "klaviyo": {
      const client = new KlaviyoClient(apiKey);
      const flows = await client.findFlowsByNameContains(nameHints);
      if (flows.length === 0) {
        return { supported: false, reason: "No live Klaviyo flow found matching common pre-call/booking naming — the operator may need to point this at a specific flow manually." };
      }
      // Take the first match — if the buyer has multiple, this is a
      // starting point for the operator to confirm, not a guarantee of
      // picking the exact right one.
      const emails = await client.getFlowEmailActions(flows[0].id);
      if (emails.length === 0) {
        return { supported: false, reason: `Found flow "${flows[0].name}" but couldn't read any email actions from it.` };
      }
      return { supported: true, emails };
    }

    case "hubspot": {
      const client = new HubSpotClient(apiKey);
      const workflows = await client.findWorkflowsByNameContains(nameHints);
      if (workflows.length === 0) {
        return { supported: false, reason: "No HubSpot workflow found matching common pre-call/booking naming — the operator may need to point this at a specific workflow manually." };
      }
      const emails = await client.getWorkflowEmailActions(workflows[0].id);
      if (emails.length === 0) {
        return { supported: false, reason: `Found workflow "${workflows[0].name}" but couldn't read any email actions from it (HubSpot's workflow action schema varies by account/version).` };
      }
      return { supported: true, emails };
    }

    default:
      return {
        supported: false,
        reason: `${emailPlatform} doesn't expose a flow/workflow read API this app can use for an automated audit — review the existing sequence manually before activating Pile-On.`,
      };
  }
}

/**
 * Scores each existing email against the four content pillars and
 * produces a keep/replace/merge/drop recommendation. Emails that look
 * deliberately different from the system default (a distinctive
 * structure, an unusual send timing, content that doesn't map cleanly to
 * any pillar) are flagged "investigate_before_changing" rather than
 * scored as a straightforward delta — the OG SKILL.md's explicit
 * instruction was to flag those as worth a conversation, not silently
 * recommend replacing something that might be deliberate.
 */
async function scoreEmailsAgainstPillars(
  emails: RawEmail[],
  offerDetails?: any,
  brandVoiceProfile?: any
): Promise<ExistingSequenceAuditResult["emails"]> {
  const system = `You are auditing an existing pre-call email sequence against four content
pillars a well-built Pile-On sequence should cover across its emails:
- common_questions: answers frequently asked questions about the call/offer
- deeper_questions: addresses more nuanced/considered questions a serious prospect would have
- success_proof: any social proof, outcomes, or credibility signals
- objections: proactively addresses likely objections

Offer context: ${JSON.stringify(offerDetails ?? {})}
Target brand voice: ${JSON.stringify(brandVoiceProfile ?? {})}

Existing emails (in send order):
${emails.map((e, i) => `Email ${i + 1} (send delay: ${e.sendDelayDays ?? "unknown"} days)\nSubject: ${e.subject}\nBody preview: ${e.bodyPreview}`).join("\n\n")}

For each email, score 0-10 on each of the four pillars (how well THIS EMAIL covers that pillar,
not the sequence as a whole), and give ONE recommendation:
- "keep": already covers its pillar(s) well, no changes needed
- "replace": weak/off-brand, the new system-generated sequence should replace it
- "merge": has some good content worth folding into the new sequence, but isn't strong enough to keep as-is
- "drop": redundant with another email or off-topic, not worth carrying forward
- "investigate_before_changing": this email looks deliberately different from a standard pre-call
  email (unusual structure, unusual timing, something that suggests an intentional choice) — flag
  for a human conversation rather than recommending a change outright.

Return ONLY a JSON array, one object per email in the same order, no prose, no markdown fences:
[{"pillarScores": {"common_questions": 0-10, "deeper_questions": 0-10, "success_proof": 0-10, "objections": 0-10}, "recommendation": "keep"|"replace"|"merge"|"drop"|"investigate_before_changing", "reasoning": "1-2 sentences, specific to this email"}]`;

  const result = await callClaudeWithRetry({
    model: MODEL.SYNTHESIS,
    system,
    userMessage: "Score each email now.",
    maxTokens: 2000,
  });

  let scored: Array<{ pillarScores: Record<string, number>; recommendation: string; reasoning: string }>;
  try {
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    scored = JSON.parse(cleaned);
  } catch {
    // Fail safe: every email gets flagged for manual review rather than
    // silently dropping the audit if the model output didn't parse.
    scored = emails.map(() => ({
      pillarScores: Object.fromEntries(CONTENT_PILLARS.map((p) => [p, 0])),
      recommendation: "investigate_before_changing",
      reasoning: "Automated scoring failed to parse — review this email manually.",
    }));
  }

  return emails.map((e, i) => ({
    subject: e.subject,
    sendDelayDays: e.sendDelayDays,
    openRate: null,
    clickRate: null,
    pillarScores: scored[i]?.pillarScores ?? Object.fromEntries(CONTENT_PILLARS.map((p) => [p, 0])),
    recommendation: (scored[i]?.recommendation as any) ?? "investigate_before_changing",
    reasoning: scored[i]?.reasoning ?? "",
  }));
}

export async function auditExistingPileOnSequence(
  emailPlatform: string,
  apiKey: string,
  context: { offerDetails?: any; brandVoiceProfile?: any }
): Promise<ExistingSequenceAuditResult> {
  const now = new Date().toISOString();
  const found = await findExistingSequenceEmails(emailPlatform, apiKey);

  if (!found.supported) {
    return {
      auditedAt: now,
      platform: emailPlatform,
      supported: false,
      unsupportedReason: found.reason,
      emails: [],
      recommendedWorkflowLabel: "showtime_pile_on_v1",
    };
  }

  const scoredEmails = await scoreEmailsAgainstPillars(found.emails, context.offerDetails, context.brandVoiceProfile);

  return {
    auditedAt: now,
    platform: emailPlatform,
    supported: true,
    emails: scoredEmails,
    // The OG SKILL.md's exact pattern: build the new sequence under a
    // distinct workflow name with mutually exclusive enrollment filters
    // so the two can't double-fire. Building that parallel flow happens
    // in the ESP's own UI (flows/workflows aren't creatable through any
    // of these platforms' APIs in a way stable enough to automate here) —
    // this label is what the operator names it, surfaced in the
    // dashboard as the recommended action.
    recommendedWorkflowLabel: "showtime_pile_on_v1",
  };
}
