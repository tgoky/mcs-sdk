// tests/helpers/inngest-fn.ts
//
// Runs an Inngest function's handler directly, with step.run executing
// inline and step.sendEvent recorded, so a cron's fan-out can be checked
// without an Inngest server.
import { vi } from "vitest";

export function fakeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => unknown) => JSON.parse(JSON.stringify((await fn()) ?? null))),
    sendEvent: vi.fn(async () => undefined),
  };
}

export async function runInngestHandler(fn: unknown, ctx: Record<string, unknown>) {
  const handler = (fn as { fn: (ctx: Record<string, unknown>) => Promise<unknown> }).fn;
  return handler(ctx);
}

export function inngestOptions(fn: unknown): Record<string, unknown> {
  return (fn as { opts: Record<string, unknown> }).opts;
}
