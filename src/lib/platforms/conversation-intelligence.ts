// src/lib/platforms/conversation-intelligence.ts
//
// Tier 4 #24 — conversation intelligence hooks.
//
// Scoped to Recall.ai specifically, not a generic multi-provider
// abstraction — see EngagementStack.conversation_intelligence_provider's
// comment for why. Every endpoint, payload shape, and the webhook
// signature scheme below was checked against Recall's live docs
// (docs.recall.ai) at the time this was written, not assumed from
// training data — same discipline credential-health.ts's VALIDATORS map
// already documents for booking platforms. Two things an operator MUST
// verify before relying on this in production, flagged here rather than
// silently assumed:
//   1. `recall_region` must match the operator's actual Recall workspace
//      region (shown in their Recall dashboard) — every Recall endpoint
//      is region-hosted and a mismatched region 404s outright.
//   2. Recall's bot-status-change webhook URL is configured once, per
//      Recall WORKSPACE, in Recall's own dashboard — not per bot, and not
//      per engagement. If Mudd Ventures runs one shared Recall workspace
//      across every operator, that one dashboard webhook URL points at
//      POST /api/webhooks/recall for every tenant; the handler resolves
//      which engagement a given bot belongs to from
//      conversationIntelligenceSessions, not from anything in the URL.
//
// Data retention note: this app never stores the raw transcript. Only
// Claude's structured extraction (objection phrases, a short summary) is
// persisted, on conversationIntelligenceSessions — see
// extractObjectionsFromTranscript below.
import crypto from "crypto";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";

export type RecallRegion = "us-east-1" | "us-west-2" | "eu-central-1" | "ap-northeast-1";

export interface RecallCredential {
  apiKey: string;
  region: RecallRegion;
}

function baseUrl(region: RecallRegion): string {
  return `https://${region}.recall.ai/api/v1`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Schedules a bot to join an upcoming meeting. Uses `join_at` (Recall's
 * scheduled-bot mode) rather than dispatching immediately — per Recall's
 * docs, join_at must be at least 10 minutes in the future; callers should
 * only call this for calls comfortably past that threshold (see the
 * brief-service.ts call site's check).
 */
export async function createRecallBot(
  cred: RecallCredential,
  meetingUrl: string,
  joinAt: Date,
  botName = "Notetaker"
): Promise<{ botId: string }> {
  const res = await fetchWithTimeout(`${baseUrl(cred.region)}/bot/`, {
    method: "POST",
    headers: { Authorization: `Token ${cred.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: botName,
      join_at: joinAt.toISOString(),
      transcription_options: { provider: "meeting_captions" },
    }),
  });
  if (!res.ok) {
    throw new Error(`Recall bot creation failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return { botId: json.id };
}

export async function retrieveRecallBot(cred: RecallCredential, botId: string): Promise<any> {
  const res = await fetchWithTimeout(`${baseUrl(cred.region)}/bot/${botId}/`, {
    method: "GET",
    headers: { Authorization: `Token ${cred.apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Recall bot retrieval failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/**
 * Fetches and flattens the transcript to plain text. Recall's transcript
 * download is a JSON array of speaker-attributed segments — the exact
 * field names have shifted across Recall API versions (v1.10 vs v1.11 per
 * their docs), so this parses defensively: it looks for the most common
 * shape (an array of objects with a `words` array of `{text}` per word,
 * or a flat `text`/`transcript` string per segment) and falls back to
 * JSON.stringify-ing anything it doesn't recognize rather than throwing —
 * a slightly-malformed transcript is still useful input to the
 * extraction prompt below; failing outright on a shape mismatch isn't
 * worth losing the whole call's signal over.
 */
export async function fetchTranscriptText(cred: RecallCredential, botId: string): Promise<string | null> {
  const bot = await retrieveRecallBot(cred, botId);
  const recording = bot.recordings?.[0];
  const downloadUrl = recording?.media_shortcuts?.transcript?.data?.download_url;
  if (!downloadUrl) return null;

  const res = await fetchWithTimeout(downloadUrl, { method: "GET" }, 30_000);
  if (!res.ok) return null;

  let parsed: any;
  try {
    parsed = await res.json();
  } catch {
    return await res.text();
  }

  if (!Array.isArray(parsed)) return JSON.stringify(parsed).slice(0, 50_000);

  const lines = parsed.map((segment: any) => {
    const speaker = segment.speaker ?? segment.participant?.name ?? "Speaker";
    const text =
      segment.text ??
      segment.transcript ??
      (Array.isArray(segment.words) ? segment.words.map((w: any) => w.text ?? w.word ?? "").join(" ") : "");
    return `${speaker}: ${text}`;
  });
  return lines.join("\n").slice(0, 50_000); // cap — this only ever feeds an LLM extraction prompt, not stored verbatim
}

export interface ObjectionExtractionResult {
  objections: string[];
  summary: string;
}

/**
 * The only thing from a transcript this app persists — see the module
 * header's data-retention note. Deliberately asks for short, reusable
 * objection PHRASES (feeds straight into topObjections, which Pile-On's
 * ad-creative-briefs and Pre-Call Read's brief synthesis both already
 * consume) rather than a call-by-call narrative.
 */
export async function extractObjectionsFromTranscript(transcriptText: string, runId?: string): Promise<ObjectionExtractionResult> {
  const system = `You are analyzing a sales call transcript to extract recurring prospect objections.

Read the transcript below (speaker-attributed, auto-transcribed — expect some noise/misattribution) and identify objections or hesitations the PROSPECT raised, not things the rep said.

Return ONLY a JSON object, no prose, no markdown fences:
{
  "objections": ["short reusable objection phrase", "..."],
  "summary": "1-2 sentence summary of how the call went overall"
}

Rules:
- Objection phrases should be short and reusable across future briefs/ad copy (e.g. "Worried about the time commitment", not a verbatim quote).
- 0-6 objections. Return an empty array if the prospect raised none.
- Never fabricate an objection not actually present in the transcript.`;

  const result = await callClaudeWithRetry({
    model: MODEL.SYNTHESIS,
    system,
    userMessage: transcriptText,
    maxTokens: 800,
    runId,
  });

  try {
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      objections: Array.isArray(parsed.objections) ? parsed.objections.filter(Boolean) : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch {
    return { objections: [], summary: "Extraction returned non-JSON output — see conversationIntelligenceSessions.extractionSummary for the raw model response." };
  }
}

// ── Svix webhook signature verification ─────────────────────────────────
// Recall's status-change webhooks are Svix-signed. Verified against
// Svix's own documented scheme (docs.svix.com/receiving/verifying-
// payloads/how-manual): signed_content = `${svix_id}.${svix_timestamp}.${body}`,
// HMAC-SHA256 keyed on the base64-decoded portion of the secret after
// its "whsec_" prefix, output base64-encoded, compared against each
// space-delimited "v1,<sig>" entry in the svix-signature header.
export function verifyRecallWebhookSignature(
  workspaceVerificationSecret: string,
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
  svixSignatureHeader: string
): boolean {
  const fiveMinutes = 60 * 5;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(svixTimestamp)) > fiveMinutes) return false;

  const secretBytes = Buffer.from(workspaceVerificationSecret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  const candidates = svixSignatureHeader
    .split(" ")
    .map((entry) => entry.split(",")[1])
    .filter(Boolean) as string[];

  return candidates.some((candidate) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
