/**
 * Shared core for "generate a personalization via Claude, deliver it, but
 * never let either step block the caller past a hard budget" — the exact
 * pattern the transfer analysis calls for on both Pile-On's hybrid first
 * email (gap 3) and Win-Back's hybrid first recovery message (gap 5, "same
 * recipe as Pile-On gap 3, applied to Win-Back's message-1 slot").
 *
 * Extracted here instead of duplicated so the two skills' hybrid-
 * personalizer.ts files stay thin wrappers (their own prompt copy + which
 * log table to write to) rather than two copies of the same
 * AbortController/timeout plumbing that could drift out of sync.
 *
 * Two budgets, enforced for real (not just raced-and-abandoned):
 *   - receiverBudgetMs: the whole attempt (generation + delivery) must
 *     resolve within this or it's treated as a fallback.
 *   - generationBudgetMs: the Claude call specifically. In practice the
 *     receiver budget is tighter and usually fires first, but both are
 *     enforced independently so a change to one doesn't silently change
 *     the other's behavior.
 * Both use real AbortSignal cancellation via llm.ts's `signal` option
 * (see llm.ts) rather than a Promise.race that lets the underlying fetch
 * keep running in the background after the caller gives up.
 */

import { callClaude, MODEL } from "@/lib/llm";

export interface HybridBudgetResult {
  outcome: "hybrid" | "fallback";
  latencyMs: number;
  error?: string;
}

export interface RunHybridWithBudgetOptions {
  system: string;
  userMessage: string;
  maxTokens?: number;
  runId?: string;
  receiverBudgetMs?: number;
  generationBudgetMs?: number;
  /** Called with the generated text once available; failures here also count as a fallback. */
  deliver: (text: string) => Promise<void>;
}

const DEFAULT_RECEIVER_BUDGET_MS = 10_000;
const DEFAULT_GENERATION_BUDGET_MS = 60_000;

export async function runHybridWithBudget(opts: RunHybridWithBudgetOptions): Promise<HybridBudgetResult> {
  const receiverBudgetMs = opts.receiverBudgetMs ?? DEFAULT_RECEIVER_BUDGET_MS;
  const generationBudgetMs = opts.generationBudgetMs ?? DEFAULT_GENERATION_BUDGET_MS;
  const startedAt = Date.now();

  const receiverController = new AbortController();
  const receiverTimeout = setTimeout(() => receiverController.abort(), receiverBudgetMs);

  try {
    const attempt = (async (): Promise<void> => {
      const generationController = new AbortController();
      const generationTimeout = setTimeout(() => generationController.abort(), generationBudgetMs);

      let text: string;
      try {
        const result = await callClaude({
          model: MODEL.SYNTHESIS,
          system: opts.system,
          userMessage: opts.userMessage,
          maxTokens: opts.maxTokens ?? 200,
          runId: opts.runId,
          signal: generationController.signal,
        });
        text = result.text;
      } finally {
        clearTimeout(generationTimeout);
      }

      await opts.deliver(text);
    })();

    // The receiver-level abort doesn't stop `attempt`'s own internal work
    // once it's past the generation call — it only stops us from waiting
    // on it past the receiver budget. See pile-on/server/hybrid-
    // personalizer.ts's module comment for why a late-arriving delivery
    // after a reported "fallback" is harmless, not a bug.
    await Promise.race([
      attempt,
      new Promise<never>((_, reject) => {
        receiverController.signal.addEventListener("abort", () =>
          reject(new Error(`Receiver budget (${receiverBudgetMs}ms) exceeded`))
        );
      }),
    ]);

    return { outcome: "hybrid", latencyMs: Date.now() - startedAt };
  } catch (e: any) {
    return { outcome: "fallback", latencyMs: Date.now() - startedAt, error: e.message };
  } finally {
    clearTimeout(receiverTimeout);
  }
}
