// src/lib/jev.ts
//
// Client for TypeSafe AI's Jev — a "System One" model. Unlike llm.ts's
// callClaude, this never generates text: you send a `state` (the evidence)
// plus one or more typed `questions`, and get back a typed `choice`/
// `score`/`noul` value plus a probability distribution, no JSON prompting
// or parsing layer on either side. Every question needs its own closed set
// of options (Choice), ordered levels (Score), or yes/no framing (Noul) —
// Jev never invents a value, it only scores evidence a caller already
// gathered (crawled site text, account-metadata text) against options the
// caller defines.
//
// Request/response shape below is taken directly from TypeSafe's own
// published docs (docs.typesafe.ai — Quick start, System One, Primitives:
// Choice/Score/Noul, Advanced: structure), not inferred or guessed. This
// replaces an earlier draft of this file that had to guess at the contract
// because nothing in that session could reach the docs or make a real
// call — see git history on this file for what that guesswork looked
// like, kept out of this version now that a confirmed contract exists.
//
// What's still genuinely unverified, and isolated to the two constants
// below so it's a one-line fix, not a rewrite: the exact base URL and
// model-id format when calling THROUGH OpenRouter rather than TypeSafe's
// own API directly. TypeSafe's docs confirm POST https://api.typesafe.ai/
// v1/systemone as their own hosted endpoint with model id "jev-latest".
// OpenRouter's own model-listing pages (openrouter.ai/typesafe/jev-latest)
// suggest routing through OpenRouter uses a provider-prefixed model id
// ("typesafe/jev-latest") — that part is corroborated by OpenRouter's own
// pages, not this session's own test call, since OpenRouter is blocked by
// this sandbox's network egress. Set JEV_TRANSPORT=openrouter (this app's
// own env var, not TypeSafe's) once a real OpenRouter key is in hand and
// confirm the first real call before anything depends on it.

/** Choice/Score/Noul instructions and criteria entries all accept this shape per TypeSafe's own "Advanced: structure" docs. */
export type JevEntry = string | Record<string, unknown> | unknown[] | null;

export interface JevChoiceQuestion {
  type: "choice";
  instructions: JevEntry;
  /** Option name -> description. Up to 255 options per TypeSafe's docs. */
  criteria: Record<string, JevEntry>;
}

export interface JevScoreQuestion {
  type: "score";
  instructions: JevEntry;
  /** Ordered low-to-high level descriptions. 2-10 levels per TypeSafe's docs. */
  criteria: JevEntry[];
}

export interface JevNoulQuestion {
  type: "noul";
  instructions: JevEntry;
  /** Optional — clarifies what counts as yes/no when the boundary is subtle. */
  criteria?: { true?: JevEntry; false?: JevEntry };
}

export type JevQuestion = JevChoiceQuestion | JevScoreQuestion | JevNoulQuestion;

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  /** 0-1, derived from how peaked `probabilities` is — not a guarantee the pick is correct. */
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevScoreAnswer {
  type: "score";
  /** Probability-weighted position along the levels — can fall between two, e.g. 1.43 on a 0-2 scale. */
  score: number;
  confidence: number;
  /** Level index (as a string, e.g. "0", "1") -> the description supplied in criteria. */
  legend: Record<string, JevEntry>;
  probabilities: Record<string, number>;
}

export interface JevNoulAnswer {
  type: "noul";
  /** Probability the answer is yes. No separate confidence field — the value itself carries both, per TypeSafe's own docs (a two-outcome distribution needs no separate spread measure). */
  noul: number;
}

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer;

/** Records the call in jev_readings (lib/jev-readings.ts). */
export interface JevReadingContext {
  engagementId?: string | null;
  /** What the reading is for, e.g. "rep-identity", "web-competitors". */
  purpose: string;
  runId?: string | null;
}

export interface AskJevOptions {
  /** The evidence Jev scores against — crawled text, account-metadata text, or any other already-gathered signal. A string, or a JSON object/array when several related pieces of context matter together (TypeSafe's own "State" docs recommend an object over string-templating multiple facts together). */
  state: string | Record<string, unknown> | unknown[];
  /** Keyed by caller-chosen id — never sent to Jev itself, only used to match answers back to questions. Send every question relevant to this state in one call; TypeSafe's own docs are explicit that adding questions barely changes latency or cost. */
  questions: Record<string, JevQuestion>;
  model?: string;
  /** Logs this call as a reading, for calibration and cost. */
  reading?: JevReadingContext;
}

export interface AskJevResult {
  /** The exact model version that answered (e.g. "jev-1.13.0"), which can differ from the requested alias ("jev-latest"). */
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { inputTokens: number; outputTokens: number };
  /** Fractional cents, NOT rounded — llm.ts's recordRunUsage rounds cost to whole integer cents, which the earlier fact-store review flagged as hiding real cost on any call this cheap (a typical short classification call is under a tenth of a cent). Jev calls are cheaper still, so this returns the unrounded float and leaves any rounding decision to the caller's own storage, rather than repeating that bug. */
  costInCents: number;
}

/**
 * The Jev version every confidence threshold in the app was set against
 * (fact-trust.ts, field-writeback.ts, the resolvers). Pinned so a new
 * release can't quietly shift what "75" means: move it only after
 * re-checking those thresholds against the agreement report
 * (lib/jev-agreement.ts). JEV_MODEL overrides the whole model id.
 */
export const JEV_PINNED_VERSION = "1.13.0";

// TypeSafe's own confirmed direct API (docs.typesafe.ai/introduction/quickstart).
const TYPESAFE_DIRECT_URL = "https://api.typesafe.ai/v1/systemone";
const TYPESAFE_DIRECT_MODEL = `jev-${JEV_PINNED_VERSION}`;
const TYPESAFE_LATEST_MODEL = "jev-latest";

// OpenRouter's provider-prefixed hosting of the same model — see this
// file's header for what's confirmed here vs. not.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/systemone";
const OPENROUTER_MODEL = `typesafe/jev-${JEV_PINNED_VERSION}`;
const OPENROUTER_LATEST_MODEL = "typesafe/jev-latest";

// TypeSafe's published pricing: $0.042 per million input tokens, output
// free. Applied here, not sourced from this session making a real billing
// call — confirm against /v1/models or a real invoice if this number ever
// needs to be precise rather than directional.
const INPUT_PRICE_PER_MILLION_TOKENS_USD = 0.042;

function resolveTransport(): { url: string; apiKey: string; defaultModel: string; latestModel: string } {
  const override = process.env.JEV_MODEL?.trim();
  const useOpenRouter = process.env.JEV_TRANSPORT === "openrouter";
  if (useOpenRouter) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not set. Required for JEV_TRANSPORT=openrouter.");
    return { url: OPENROUTER_URL, apiKey, defaultModel: override || OPENROUTER_MODEL, latestModel: OPENROUTER_LATEST_MODEL };
  }
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY not set. Required to call Jev directly. Set JEV_TRANSPORT=openrouter to use OPENROUTER_API_KEY instead.");
  return { url: TYPESAFE_DIRECT_URL, apiKey, defaultModel: override || TYPESAFE_DIRECT_MODEL, latestModel: TYPESAFE_LATEST_MODEL };
}

// Logged once per process, not per call.
let warnedPinnedMissing = false;
let warnedVersion: string | null = null;

/** A 4xx that names the model: the provider doesn't serve the pinned id. */
function isUnknownModel(status: number, body: string): boolean {
  return (status === 400 || status === 404) && /model/i.test(body);
}

/**
 * Asks Jev every question in one call, against one shared state. Throws on
 * a transport/HTTP failure; callers resolving a field should treat a
 * thrown error the same as "no answer" (fall through to the next resolver
 * source, or ask), never as a confident negative.
 */
export async function askJev(opts: AskJevOptions): Promise<AskJevResult> {
  const started = Date.now();
  let model = opts.model;
  try {
    const result = await callJev(opts, (m) => (model = m));
    if (opts.reading) await logReading(opts, { model: model ?? result.model, result, latencyMs: Date.now() - started });
    return result;
  } catch (err) {
    if (opts.reading) await logReading(opts, { model: model ?? "unknown", error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - started });
    throw err;
  }
}

async function logReading(opts: AskJevOptions, r: { model: string; result?: AskJevResult; error?: string; latencyMs: number }): Promise<void> {
  try {
    const { recordJevReading } = await import("@/lib/jev-readings");
    await recordJevReading({
      ...opts.reading!,
      modelRequested: r.model,
      modelServed: r.result?.model ?? null,
      questionCount: Object.keys(opts.questions).length,
      answers: r.result?.answers ?? null,
      inputTokens: r.result?.usage.inputTokens ?? 0,
      outputTokens: r.result?.usage.outputTokens ?? 0,
      costInCents: r.result?.costInCents ?? 0,
      latencyMs: r.latencyMs,
      error: r.error ?? null,
    });
  } catch (err) {
    console.warn("[jev] couldn't record the reading:", err instanceof Error ? err.message : err);
  }
}

async function callJev(opts: AskJevOptions, onModel: (model: string) => void): Promise<AskJevResult> {
  const { url, apiKey, defaultModel, latestModel } = resolveTransport();
  const post = (model: string) => {
    onModel(model);
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        state: opts.state,
        questions: opts.questions,
      }),
    });
  };

  const requested = opts.model ?? defaultModel;
  let res = await post(requested);

  // The provider doesn't know the pinned id: answer from latest rather than
  // not at all, and say so loudly, since the thresholds were set against
  // the pinned version.
  if (!res.ok && requested !== latestModel && !opts.model) {
    const body = await res.text().catch(() => "");
    if (isUnknownModel(res.status, body)) {
      if (!warnedPinnedMissing) {
        warnedPinnedMissing = true;
        console.error(`[jev] ${requested} isn't served (${res.status}); falling back to ${latestModel}. Pin a served version (JEV_MODEL) and re-check the thresholds.`);
      }
      res = await post(latestModel);
    } else {
      throw new Error(`Jev API error [${res.status}]: ${body.slice(0, 500)}`);
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jev API error [${res.status}]: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    model: string;
    answers: Record<string, { type: "choice" | "score" | "noul" } & Record<string, unknown>>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const answers: Record<string, JevAnswer> = {};
  for (const [key, raw] of Object.entries(data.answers ?? {})) {
    if (raw.type === "choice") {
      answers[key] = { type: "choice", choice: raw.choice as string, confidence: raw.confidence as number, probabilities: raw.probabilities as Record<string, number> };
    } else if (raw.type === "score") {
      answers[key] = { type: "score", score: raw.score as number, confidence: raw.confidence as number, legend: raw.legend as Record<string, JevEntry>, probabilities: raw.probabilities as Record<string, number> };
    } else {
      answers[key] = { type: "noul", noul: raw.noul as number };
    }
  }

  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  if (data.model && !data.model.includes(JEV_PINNED_VERSION) && warnedVersion !== data.model) {
    warnedVersion = data.model;
    console.warn(`[jev] answered by ${data.model}, not the pinned ${JEV_PINNED_VERSION}. Confidence thresholds were set against ${JEV_PINNED_VERSION}.`);
  }

  return {
    model: data.model,
    answers,
    usage: { inputTokens, outputTokens },
    costInCents: (inputTokens / 1_000_000) * INPUT_PRICE_PER_MILLION_TOKENS_USD * 100,
  };
}
