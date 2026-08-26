import { db } from "@/lib/db";
import { skillRuns } from "@/models/schema";
import { eq, sql } from "drizzle-orm";

// Provider config
const USE_OPENROUTER = process.env.USE_OPENROUTER === "true";

const ANTHROPIC_MODELS = {
  SYNTHESIS: "claude-sonnet-5",
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

// Pricing (cents per million tokens)
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5":           { input: 200, output: 1000 },
  "claude-haiku-4-5-20251001": { input: 100, output: 500  },
};

const OPENROUTER_PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-5":             { input: 200, output: 1000 },
  "anthropic/claude-haiku-4.5":            { input: 100, output: 500  },
  "openai/gpt-4o":                         { input: 250, output: 1000 },
  "google/gemini-2.5-pro":                 { input: 125, output: 1000 },
  "meta-llama/llama-3.3-8b-instruct:free": { input: 0,   output: 0    },
};

// Database usage tracker helper
async function recordRunUsage(
  runId: string,
  costInCents: number,
  inputTokens: number,
  outputTokens: number
) {
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
    .where(eq(skillRuns.id, runId));
}

// Call options
export interface ClaudeCallOptions {
  model: ModelKey;
  system: string;
  userMessage: string;
  maxTokens?: number;
  runId?: string;
  signal?: AbortSignal;
}

export interface ClaudeResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costInCents: number;
  provider: "anthropic" | "openrouter";
  modelUsed: string;
}

// Core call
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
    signal: opts.signal,
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
    await recordRunUsage(opts.runId, costInCents, inputTokens, outputTokens);
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
    signal: opts.signal,
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

  if (opts.runId) {
    await recordRunUsage(opts.runId, costInCents, inputTokens, outputTokens);
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

// Tool-calling
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | unknown; is_error?: boolean };

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

export interface ClaudeToolCallOptions {
  model: ModelKey;
  system: string;
  messages: ClaudeMessage[];
  tools: ClaudeTool[];
  maxTokens?: number;
  signal?: AbortSignal;
  runId?: string;
}

export interface ClaudeToolCallResult {
  content: ClaudeContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | string;
  inputTokens: number;
  outputTokens: number;
  costInCents: number;
}

// Tool-calling conversion helpers
function toolResultToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((b: any) => b?.text ?? "").filter(Boolean).join("\n");
  }
  return JSON.stringify(content ?? "");
}

function convertAnthropicMessagesToOpenAI(messages: ClaudeMessage[]) {
  const out: any[] = [];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      if (!msg.content.trim()) continue;
      out.push({ role: msg.role, content: msg.content });
      continue;
    }

    const textParts: string[] = [];
    const toolCalls: any[] = [];
    const toolResults: any[] = [];

    for (const block of msg.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        });
      } else if (block.type === "tool_result") {
        toolResults.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: toolResultToText(block.content),
        });
      }
    }

    if (toolResults.length > 0) {
      out.push(...toolResults);
      const rest = textParts.filter(Boolean).join("\n");
      if (rest) out.push({ role: "user", content: rest });
    } else if (msg.role === "assistant") {
      if (textParts.length === 0 && toolCalls.length === 0) continue;
      out.push({
        role: "assistant",
        content: textParts.length > 0 ? textParts.join("\n") : null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    } else {
      const content = textParts.join("\n");
      if (!content) continue;
      out.push({ role: msg.role, content });
    }
  }

  return out;
}

export async function callClaudeWithTools(opts: ClaudeToolCallOptions): Promise<ClaudeToolCallResult> {
  if (USE_OPENROUTER) {
    return callViaOpenRouterWithTools(opts);
  }
  return callViaAnthropicWithTools(opts);
}

async function callViaAnthropicWithTools(opts: ClaudeToolCallOptions): Promise<ClaudeToolCallResult> {
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
      messages: opts.messages,
      tools: opts.tools,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error [${res.status}]: ${body}`);
  }

  const data = await res.json();
  const content: ClaudeContentBlock[] = data.content ?? [];
  const inputTokens: number = data.usage?.input_tokens ?? 0;
  const outputTokens: number = data.usage?.output_tokens ?? 0;
  const pricing = ANTHROPIC_PRICING[modelString] ?? { input: 0, output: 0 };
  const costInCents = Math.round((inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output);

  if (opts.runId) {
    await recordRunUsage(opts.runId, costInCents, inputTokens, outputTokens);
  }

  return { content, stopReason: data.stop_reason ?? "end_turn", inputTokens, outputTokens, costInCents };
}

async function callViaOpenRouterWithTools(opts: ClaudeToolCallOptions): Promise<ClaudeToolCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set. Add it to your environment variables.");

  const modelString = OPENROUTER_MODELS[opts.model];

  const openAiMessages: any[] = [];
  if (opts.system?.trim()) {
    openAiMessages.push({ role: "system", content: opts.system });
  }
  openAiMessages.push(...convertAnthropicMessagesToOpenAI(opts.messages));

  const openAiTools = opts.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

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
      messages: openAiMessages,
      tools: openAiTools,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter API error [${res.status}]: ${body}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const contentBlocks: ClaudeContentBlock[] = [];

  if (message.content) {
    contentBlocks.push({ type: "text", text: message.content });
  }

  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      const rawArgs = tc.function?.arguments ?? "{}";
      let parsedInput: Record<string, unknown>;
      try {
        parsedInput = typeof rawArgs === "string" ? JSON.parse(rawArgs) : (rawArgs ?? {});
      } catch {
        console.warn(`[llm] Unparseable tool args for "${tc.function?.name}":`, rawArgs);
        parsedInput = {};
      }
      contentBlocks.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function?.name ?? "",
        input: parsedInput,
      });
    }
  }

  const inputTokens: number = data.usage?.prompt_tokens ?? 0;
  const outputTokens: number = data.usage?.completion_tokens ?? 0;

  const FINISH_TO_STOP: Record<string, string> = {
    stop: "end_turn",
    length: "max_tokens",
    tool_calls: "tool_use",
    content_filter: "end_turn",
  };
  const stopReason = (FINISH_TO_STOP[choice.finish_reason] ?? "end_turn") as ClaudeToolCallResult["stopReason"];

  const pricing = OPENROUTER_PRICING[modelString] ?? { input: 0, output: 0 };
  const costInCents = Math.round(
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );

  if (opts.runId) {
    await recordRunUsage(opts.runId, costInCents, inputTokens, outputTokens);
  }

  return { content: contentBlocks, stopReason, inputTokens, outputTokens, costInCents };
}

// Retry wrapper
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

// Web-search-enabled call
export interface ClaudeSearchCallOptions {
  system: string;
  userMessage: string;
  maxTokens?: number;
  maxSearches?: number;
  runId?: string;
  signal?: AbortSignal;
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
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error [${res.status}]: ${body}`);
  }

  const data = await res.json();
  interface AnthropicSearchContentBlock {
    type: string;
    text?: string;
    name?: string;
    content?: Array<{ url?: string }>;
  }
  const blocks: AnthropicSearchContentBlock[] = data.content ?? [];
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
    await recordRunUsage(opts.runId, costInCents, inputTokens, outputTokens);
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
      plugins: [
        {
          id: "web",
          max_results: maxResults,
        },
      ],
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter API error [${res.status}]: ${body}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message ?? {};
  const text: string = message.content ?? "";
  interface OpenRouterAnnotation {
    type: string;
    url_citation?: { url?: string };
  }
  const citedUrls: string[] = ((message.annotations ?? []) as OpenRouterAnnotation[])
    .filter((a) => a.type === "url_citation" && !!a.url_citation?.url)
    .map((a) => a.url_citation!.url!);
  const inputTokens: number = data.usage?.prompt_tokens ?? 0;
  const outputTokens: number = data.usage?.completion_tokens ?? 0;
  const pricing = OPENROUTER_PRICING[modelString] ?? { input: 0, output: 0 };
  const tokenCostInCents = Math.round(
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
  );
  const searchesUsed = citedUrls.length > 0 ? 1 : 0;
  const costInCents = tokenCostInCents + searchesUsed;

  if (opts.runId) {
    await recordRunUsage(opts.runId, costInCents, inputTokens, outputTokens);
  }
  return { text, inputTokens, outputTokens, costInCents, provider: "openrouter", modelUsed: modelString, searchesUsed, citedUrls };
}