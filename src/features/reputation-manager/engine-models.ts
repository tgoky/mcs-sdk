import type { RepEngineId } from "@/models/schema";

/**
 * Which OpenRouter model string answers for each of the 5 engines the
 * tripwire panel checks. Deliberately read from env vars, not hardcoded
 * — checked OpenRouter's actual live catalog before building this
 * (openrouter.ai/api/v1/models) and the model landscape turns over fast
 * enough (new flagship releases roughly monthly per provider, as of
 * this writing) that a slug baked into source would go stale within
 * weeks of any deploy, silently breaking that engine's checks with no
 * compile-time signal.
 *
 * Update these in your deployment's environment (Vercel/Railway env
 * vars), not in code, when a provider ships a new model you want this
 * pointed at. No redeploy needed for that specific change.
 */
const ENV_KEYS: Record<RepEngineId, string> = {
  chatgpt: "REP_ENGINE_MODEL_CHATGPT",
  claude: "REP_ENGINE_MODEL_CLAUDE",
  perplexity: "REP_ENGINE_MODEL_PERPLEXITY",
  grok: "REP_ENGINE_MODEL_GROK",
  gemini: "REP_ENGINE_MODEL_GEMINI",
};

export const REP_ENGINE_IDS: RepEngineId[] = ["chatgpt", "claude", "perplexity", "grok", "gemini"];

export const REP_ENGINE_LABELS: Record<RepEngineId, string> = {
  chatgpt: "ChatGPT (OpenAI)",
  claude: "Claude (Anthropic)",
  perplexity: "Perplexity",
  grok: "Grok (xAI)",
  gemini: "Gemini (Google)",
};

/** Returns the configured OpenRouter model string for one engine, or
 * null if it hasn't been set — an unconfigured engine is skipped by the
 * panel run rather than causing the whole run to fail (see
 * engine-panel-service.ts), so a client can start with however many
 * engines actually have a key/model configured, not all 5 or none. */
export function resolveEngineModel(engineId: RepEngineId): string | null {
  const value = process.env[ENV_KEYS[engineId]];
  return value && value.trim().length > 0 ? value.trim() : null;
}
