// src/features/cold-open/server/reply-classifier.ts
//
// Per-reply disposition classifier. Port of the Cold Open skill pack's
// classify/reply_classifier.py, using this app's own callClaude helper
// (src/lib/llm.ts, Haiku via the "FAST" model key) instead of a direct
// Anthropic SDK call against a buyer-local ANTHROPIC_API_KEY.
//
// Order of decision per reply:
//   1. Deterministic heuristics, zero cost, high confidence:
//      - explicit opt-out language        -> unsubscribe (never risk missing one)
//      - OOO / autoresponder / bounce     -> auto_reply
//   2. Empty body (some feeds omit it)    -> unclassified (human queue)
//   3. Haiku classification over the taxonomy, grounded in product identity.
//      Invalid/parse-failed output -> unclassified.
//
// unclassified is a routing outcome, not a taxonomy category: it lands in
// the human queue. A misrouted "interested" costs the buyer a deal; a
// queue visit costs a click.

import { callClaude } from "@/lib/llm";

export const UNCLASSIFIED = "unclassified" as const;

export type ColdOpenDisposition = "interested" | "not_now" | "not_a_fit" | "objection" | "auto_reply" | "unsubscribe" | typeof UNCLASSIFIED;

export const DEFAULT_TAXONOMY: Record<Exclude<ColdOpenDisposition, typeof UNCLASSIFIED>, string> = {
  interested: "Wants to talk or asks a real question.",
  not_now: "Positive but timing off.",
  not_a_fit: "Explicit no / wrong person.",
  objection: "Pushback worth a human reply.",
  auto_reply: "OOO / bounce / autoresponder.",
  unsubscribe: "Opt-out; suppress.",
};

const OPT_OUT_RE = /unsubscribe|remove me|take me off|stop email|stop contact|opt me out|do not (?:email|contact) me|never contact/i;
const AUTO_RE =
  /out of (?:the )?office|auto[- ]?repl|automatic repl|autorespond|on (?:vacation|leave|pto)|parental leave|maternity leave|delivery (?:has )?failed|undeliverab|mail delivery subsystem|no longer with|currently away/i;

const SYSTEM_PROMPT = `You classify ONE inbound reply to a cold email into exactly one disposition category. You are given the seller's product context and the category definitions.

Rules:
- Choose exactly one category key from the provided list. Never invent a key.
- "interested" requires actual buying interest or a genuine question about the offer — a polite brush-off is not interest.
- Pushback with engagement ("we already use X", "too expensive") is "objection". A flat no is "not_a_fit".
- When genuinely torn between two categories, pick the one that gets a human to look at it sooner.
- confidence: high | medium | low. summary: one short sentence, plain words.

Return STRICT JSON only: {"disposition": "<key>", "confidence": "...", "summary": "..."}`;

export interface ReplyClassification {
  disposition: ColdOpenDisposition;
  confidence: "high" | "medium" | "low";
  summary: string;
  method: "heuristic" | "empty_body" | "llm" | "error";
}

export async function classifyReply(
  reply: { subject?: string; bodyText: string },
  productIdentity?: { name?: string; valueProp?: string } | null,
  taxonomy: Record<string, string> = DEFAULT_TAXONOMY
): Promise<ReplyClassification> {
  const text = (reply.bodyText ?? "").trim();
  const subject = (reply.subject ?? "").trim();
  const probe = `${subject}\n${text}`;

  if (OPT_OUT_RE.test(probe)) {
    return { disposition: "unsubscribe", confidence: "high", summary: "Explicit opt-out language.", method: "heuristic" };
  }
  if (AUTO_RE.test(probe)) {
    return { disposition: "auto_reply", confidence: "high", summary: "Autoresponder / OOO / bounce pattern.", method: "heuristic" };
  }
  if (!text) {
    return { disposition: UNCLASSIFIED, confidence: "low", summary: "Reply body missing from the feed — needs eyes.", method: "empty_body" };
  }

  const categories = Object.entries(taxonomy).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  const userMessage =
    `SELLER PRODUCT: ${productIdentity?.name ?? "(unknown)"} — ${productIdentity?.valueProp ?? "(unknown)"}\n\n` +
    `CATEGORIES:\n${categories}\n\n` +
    `REPLY SUBJECT: ${subject || "(none)"}\n` +
    `REPLY BODY:\n${text.slice(0, 4000)}\n\nClassify. JSON only.`;

  try {
    const result = await callClaude({ model: "FAST", system: SYSTEM_PROMPT, userMessage, maxTokens: 200 });
    const jsonText = result.text.trim().replace(/^```json\s*|\s*```$/g, "");
    const data = JSON.parse(jsonText);
    const disposition = String(data.disposition ?? "").trim();
    if (!(disposition in taxonomy)) {
      return { disposition: UNCLASSIFIED, confidence: "low", summary: `model returned unknown category '${disposition}'.`, method: "llm" };
    }
    return {
      disposition: disposition as ColdOpenDisposition,
      confidence: (["high", "medium", "low"].includes(data.confidence) ? data.confidence : "medium") as "high" | "medium" | "low",
      summary: String(data.summary ?? "").slice(0, 300),
      method: "llm",
    };
  } catch (err) {
    return { disposition: UNCLASSIFIED, confidence: "low", summary: `classifier error: ${err instanceof Error ? err.message : String(err)}`, method: "error" };
  }
}
