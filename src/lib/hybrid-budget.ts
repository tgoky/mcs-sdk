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

// Calendly requires a 2xx response within 10 seconds of delivering the
// webhook or it counts as a failed delivery and retries (with exponential
// backoff, for up to 24 hours) — see Calendly's webhook docs. The previous
// default here (10_000ms) was Calendly's ENTIRE budget, with zero margin
// left for the work that already runs earlier in the same request before
// this function is ever called: signature verification, the webhookEvents
// idempotency insert, startRun, and (for the pile-on caller specifically)
// a real ESP enrollment API call — all synchronous, all inside the same
// webhook handler, all eating into the same 10-second clock. 6 seconds
// here leaves roughly 4 seconds of headroom for that earlier work, which
// is generous for a few DB round trips plus one ESP call but not
// bulletproof under a slow day. Idempotency (see webhookEvents in
// booking-event/route.ts) means a Calendly retry triggered by exceeding
// this can't double-enroll anyone — worst case is a delayed ack and an
// extra retry, not incorrect data — but a hanging ESP call upstream of
// this function can still blow the total budget regardless of what this
// constant is set to. Moving the whole webhook body off the request
// thread via inngest.send() (as booking-event/route.ts's own comments
// already flag as the further step) is the real fix for that; this
// constant only controls the part actually inside this module's control.
const DEFAULT_RECEIVER_BUDGET_MS = 6_000;
const DEFAULT_GENERATION_BUDGET_MS = 60_000;

export async function runHybridWithBudget(opts: RunHybridWithBudgetOptions): Promise<HybridBudgetResult> {
  const receiverBudgetMs = opts.receiverBudgetMs ?? DEFAULT_RECEIVER_BUDGET_MS;
  const generationBudgetMs = opts.generationBudgetMs ?? DEFAULT_GENERATION_BUDGET_MS;
  const startedAt = Date.now();

  const receiverController = new AbortController();
  const receiverTimeout = setTimeout(() => receiverController.abort(), receiverBudgetMs);

  // 🌟 THE FIX: Instantiate the generation controller globally within the execution context
  const generationController = new AbortController();
  const onReceiverAbort = () => generationController.abort();
  
  // Directly pipeline parent truncation signals down to the child thread
  receiverController.signal.addEventListener("abort", onReceiverAbort);

  try {
    const attempt = (async (): Promise<void> => {
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
    // 🌟 THE FIX: Force immediate background fetch tear down if the execution block errors out
    generationController.abort();
    return { outcome: "fallback", latencyMs: Date.now() - startedAt, error: e.message };
  } finally {
    clearTimeout(receiverTimeout);
    receiverController.signal.removeEventListener("abort", onReceiverAbort);
  }
}