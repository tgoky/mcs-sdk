import { db } from "@/lib/db";
import { skillRuns } from "@/models/schema";
import { eq, sql } from "drizzle-orm";

// ── Provider config ───────────────────────────────────────────────────────
const USE_OPENROUTER = process.env.USE_OPENROUTER === "true";

const ANTHROPIC_MODELS = {
  SYNTHESIS: "claude-sonnet-5",
  // Native Anthropic API model ID for Haiku 4.5 is date-suffixed.
  FAST: "claude-haiku-4-5-20251001",
} as const;

const OPENROUTER_MODELS = {
  SYNTHESIS: "anthropic/claude-sonnet-5",
  FAST: "anthropic/claude-haiku-4.5",
} as const;

export const MODEL = {
  SYNTHESIS: "SYNTHESIS" as const,
  FAST: "FAST" as const,
};

type ModelKey = keyof typeof MODEL;

// ── Pricing (cents per million tokens) ───────────────────────────────────
// Verified against platform.claude.com/docs/en/about-claude/pricing and
// anthropic.com/claude/sonnet directly.
//
// Sonnet 5 is on introductory pricing ($2/$10 per MTok) through
// 2026-08-31, after which it reverts to standard pricing ($3/$15). If
// you're reading this after that date, update SONNET_5 below to
// { input: 300, output: 1500 }.
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5":            { input: 200, output: 1000 }, // introductory, through 2026-08-31
  "claude-haiku-4-5-20251001":  { input: 100, output: 500  },
};

const OPENROUTER_PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-5":              { input: 200,  output: 1000 }, // matches Anthropic's introductory list price
  "anthropic/claude-haiku-4.5":             { input: 100,  output: 500  },
  "openai/gpt-4o":                          { input: 250,  output: 1000 },
  "google/gemini-2.5-pro":                  { input: 125,  output: 1000 },
  "meta-llama/llama-3.3-8b-instruct:free":  { input: 0,    output: 0    },
};

// ── Call options ──────────────────────────────────────────────────────────
export interface ClaudeCallOptions {
  model: ModelKey;
  system: string;
  userMessage: string;
  maxTokens?: number;
  runId?: string;
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
    throw new Error("ANTHROPIC_API_KEY not set. Add it to your environment variables.");
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

  // ✅ Atomic increment instead of overwrite
  if (opts.runId) {
    await db
      .update(skillRuns)
      .set({
        costInCents: sql`COALESCE(${skillRuns.costInCents}, 0) + ${costInCents}`,
        tokenUsage: sql`
          jsonb_build_object(
            'input_tokens', COALESCE((${skillRuns.tokenUsage}->>'input_tokens')::int, 0) + ${inputTokens},
            'output_tokens', COALESCE((${skillRuns.tokenUsage}->>'output_tokens')::int, 0) + ${outputTokens}
          )
        `,
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
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app",
      "X-Title": "Mudd Ventures Unified Interface",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
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
  const text: string = data.choices?.[0]?.message?.content ?? "";
  const inputTokens: number = data.usage?.prompt_tokens ?? 0;
  const outputTokens: number = data.usage?.completion_tokens ?? 0;

  const pricing = OPENROUTER_PRICING[modelString] ?? { input: 0, output: 0 };
  const costInCents = Math.round(
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );

  // ✅ Atomic increment instead of overwrite
  if (opts.runId) {
    await db
      .update(skillRuns)
      .set({
        costInCents: sql`COALESCE(${skillRuns.costInCents}, 0) + ${costInCents}`,
        tokenUsage: sql`
          jsonb_build_object(
            'input_tokens', COALESCE((${skillRuns.tokenUsage}->>'input_tokens')::int, 0) + ${inputTokens},
            'output_tokens', COALESCE((${skillRuns.tokenUsage}->>'output_tokens')::int, 0) + ${outputTokens}
          )
        `,
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

// ── Web-search-enabled call ─────────────────────────────────────────────
export interface ClaudeSearchCallOptions {
  system: string;
  userMessage: string;
  maxTokens?: number;
  maxSearches?: number; // default 3
  runId?: string;
}

export interface ClaudeSearchResult extends ClaudeResult {
  searchesUsed: number;
  citedUrls: string[];
}

export async function callClaudeWithWebSearch(opts: ClaudeSearchCallOptions): Promise<ClaudeSearchResult> {
  if (USE_OPENROUTER) {
    return callViaOpenRouterWithSearch(opts);
  }
  return callViaAnthropicWithSearch(opts);
}

async function callViaAnthropicWithSearch(opts: ClaudeSearchCallOptions): Promise<ClaudeSearchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set. Add it to your environment variables.");
  }

  const modelString = ANTHROPIC_MODELS.SYNTHESIS; 
  const maxSearches = opts.maxSearches ?? 3;

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
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error [${res.status}]: ${body}`);
  }

  const data = await res.json();
  const blocks: any[] = data.content ?? [];

  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const searchesUsed = blocks.filter((b) => b.type === "server_tool_use" && b.name === "web_search").length;

  const citedUrls: string[] = [];
  for (const block of blocks) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (result.url) citedUrls.push(result.url);
      }
    }
  }

  const inputTokens: number = data.usage?.input_tokens ?? 0;
  const outputTokens: number = data.usage?.output_tokens ?? 0;
  const pricing = ANTHROPIC_PRICING[modelString] ?? { input: 0, output: 0 };
  const tokenCostInCents = Math.round(
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
  );
  const costInCents = tokenCostInCents + searchesUsed;

  if (opts.runId) {
    await db
      .update(skillRuns)
      .set({
        costInCents: sql`COALESCE(${skillRuns.costInCents}, 0) + ${costInCents}`,
        tokenUsage: sql`
          jsonb_build_object(
            'input_tokens', COALESCE((${skillRuns.tokenUsage}->>'input_tokens')::int, 0) + ${inputTokens},
            'output_tokens', COALESCE((${skillRuns.tokenUsage}->>'output_tokens')::int, 0) + ${outputTokens}
          )
        `,
      })
      .where(eq(skillRuns.id, opts.runId));
  }

  return { text, inputTokens, outputTokens, costInCents, provider: "anthropic", modelUsed: modelString, searchesUsed, citedUrls };
}

async function callViaOpenRouterWithSearch(opts: ClaudeSearchCallOptions): Promise<ClaudeSearchResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY not set. Add it to your environment variables, or set USE_OPENROUTER=false to use Anthropic direct."
    );
  }

  const modelString = OPENROUTER_MODELS.SYNTHESIS;
  const maxResults = opts.maxSearches ?? 3;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app",
      "X-Title": "Mudd Ventures Unified Interface",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelString,
      max_tokens: opts.maxTokens ?? 1500,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.userMessage },
      ],
      // ✅ Migrated to active OpenRouter Server Tools architecture
      tools: [
        {
          type: "openrouter:web_search",
          parameters: {
            max_results: maxResults,
            engine: "auto" // Automatically hooks into Claude's native web tools pipeline
          }
        }
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter API error [${res.status}]: ${body}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message ?? {};
  const text: string = message.content ?? "";

  const citedUrls: string[] = (message.annotations ?? [])
    .filter((a: any) => a.type === "url_citation" && a.url_citation?.url)
    .map((a: any) => a.url_citation.url);

  const inputTokens: number = data.usage?.prompt_tokens ?? 0;
  const outputTokens: number = data.usage?.completion_tokens ?? 0;
  const pricing = OPENROUTER_PRICING[modelString] ?? { input: 0, output: 0 };
  const tokenCostInCents = Math.round(
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
  );

  const searchesUsed = citedUrls.length > 0 ? 1 : 0;
  const costInCents = tokenCostInCents + searchesUsed;

  if (opts.runId) {
    await db
      .update(skillRuns)
      .set({
        costInCents: sql`COALESCE(${skillRuns.costInCents}, 0) + ${costInCents}`,
        tokenUsage: sql`
          jsonb_build_object(
            'input_tokens', COALESCE((${skillRuns.tokenUsage}->>'input_tokens')::int, 0) + ${inputTokens},
            'output_tokens', COALESCE((${skillRuns.tokenUsage}->>'output_tokens')::int, 0) + ${outputTokens}
          )
        `,
      })
      .where(eq(skillRuns.id, opts.runId));
  }

  return { text, inputTokens, outputTokens, costInCents, provider: "openrouter", modelUsed: modelString, searchesUsed, citedUrls };
}