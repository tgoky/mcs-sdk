import { db } from "@/lib/db";
import { skillRuns } from "@/models/schema";
import { eq } from "drizzle-orm";

// ── Provider config ───────────────────────────────────────────────────────
// Set USE_OPENROUTER=true in env to route through OpenRouter.
// Default: Anthropic direct.
const USE_OPENROUTER = process.env.USE_OPENROUTER === "true";

// Anthropic model strings (used when USE_OPENROUTER=false)
const ANTHROPIC_MODELS = {
  SYNTHESIS: "claude-sonnet-4-6",
  FAST: "claude-haiku-4-5-20251001",
} as const;

// OpenRouter model strings — same capability tiers, routed through OpenRouter.
// Swap these freely without touching any other file.
const OPENROUTER_MODELS = {
  // Keep on Anthropic via OpenRouter (same models, single billing account):
  SYNTHESIS: "anthropic/claude-sonnet-4-6",
  FAST: "anthropic/claude-haiku-4-5",
  // Or switch to other providers:
  // SYNTHESIS: "openai/gpt-4o",
  // SYNTHESIS: "google/gemini-2.5-pro",
  // FAST: "meta-llama/llama-3.3-8b-instruct:free",
} as const;

export const MODEL = {
  // Synthesis: briefs, email copy, voice extraction, audit reports
  SYNTHESIS: "SYNTHESIS" as const,
  // Fast: alert messages, short classifications, parsing tasks
  FAST: "FAST" as const,
};

type ModelKey = keyof typeof MODEL;

// ── Pricing (cents per million tokens) ───────────────────────────────────
// Used for cost telemetry written back to skillRuns.costInCents.
// Update if provider pricing changes.
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6":        { input: 300,  output: 1500 },
  "claude-haiku-4-5-20251001":{ input: 25,   output: 125  },
};

// OpenRouter passes through usage — use the same pricing when routing
// to the same underlying Anthropic models.
// For other models via OpenRouter, adjust here.
const OPENROUTER_PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4-6": { input: 300,  output: 1500 },
  "anthropic/claude-haiku-4-5":  { input: 25,   output: 125  },
  "openai/gpt-4o":               { input: 250,  output: 1000 },
  "google/gemini-2.5-pro":       { input: 125,  output: 1000 },
  "meta-llama/llama-3.3-8b-instruct:free": { input: 0, output: 0 },
};

// ── Call options ──────────────────────────────────────────────────────────
export interface ClaudeCallOptions {
  model: ModelKey;
  system: string;
  userMessage: string;
  maxTokens?: number;
  runId?: string; // if provided, writes cost telemetry back to skillRuns
}

export interface ClaudeResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costInCents: number;
  provider: "anthropic" | "openrouter";
  modelUsed: string;
}

// ── Core call ─────────────────────────────────────────────────────────────
export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeResult> {
  if (USE_OPENROUTER) {
    return callViaOpenRouter(opts);
  }
  return callViaAnthropic(opts);
}

async function callViaAnthropic(opts: ClaudeCallOptions): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Add it to your environment variables."
    );
  }

  const modelString = ANTHROPIC_MODELS[opts.model];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelString,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: "user", content: opts.userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error [${res.status}]: ${body}`);
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  const inputTokens: number = data.usage?.input_tokens ?? 0;
  const outputTokens: number = data.usage?.output_tokens ?? 0;

  const pricing = ANTHROPIC_PRICING[modelString] ?? { input: 0, output: 0 };
  const costInCents = Math.round(
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );

  if (opts.runId) {
    await db
      .update(skillRuns)
      .set({
        tokenUsage: { input_tokens: inputTokens, output_tokens: outputTokens },
        costInCents,
      })
      .where(eq(skillRuns.id, opts.runId));
  }

  return {
    text,
    inputTokens,
    outputTokens,
    costInCents,
    provider: "anthropic",
    modelUsed: modelString,
  };
}

async function callViaOpenRouter(opts: ClaudeCallOptions): Promise<ClaudeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY not set. Add it to your environment variables, " +
      "or set USE_OPENROUTER=false to use Anthropic direct."
    );
  }

  const modelString = OPENROUTER_MODELS[opts.model];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      // Required by OpenRouter for attribution + rate limit tracking
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://app.muddventures.com",
      "X-Title": "Mudd Ventures Unified Interface",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // OpenRouter uses OpenAI message format — system goes in messages array
      model: modelString,
      max_tokens: opts.maxTokens ?? 1500,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter API error [${res.status}]: ${body}`);
  }

  const data = await res.json();

  // OpenRouter returns OpenAI-format response
  const text: string = data.choices?.[0]?.message?.content ?? "";

  // Token usage — OpenRouter uses OpenAI naming (prompt_tokens, completion_tokens)
  const inputTokens: number = data.usage?.prompt_tokens ?? 0;
  const outputTokens: number = data.usage?.completion_tokens ?? 0;

  const pricing = OPENROUTER_PRICING[modelString] ?? { input: 0, output: 0 };
  const costInCents = Math.round(
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );

  if (opts.runId) {
    await db
      .update(skillRuns)
      .set({
        tokenUsage: { input_tokens: inputTokens, output_tokens: outputTokens },
        costInCents,
      })
      .where(eq(skillRuns.id, opts.runId));
  }

  return {
    text,
    inputTokens,
    outputTokens,
    costInCents,
    provider: "openrouter",
    modelUsed: modelString,
  };
}

// ── Retry wrapper ─────────────────────────────────────────────────────────
export async function callClaudeWithRetry(
  opts: ClaudeCallOptions,
  retries = 1
): Promise<ClaudeResult> {
  try {
    return await callClaude(opts);
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 1000));
      return callClaudeWithRetry(opts, retries - 1);
    }
    throw err;
  }
}
