// tests/integration/error-alert-throttle.test.ts
//
// The Slack error-alert throttle was a map in memory, so each running copy
// of the app alerted once for the same error. Two fresh module instances
// stand in for two copies here.
import { describe, it, expect, vi, afterAll } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("error alerts across copies of the app", () => {
  const fp = `test-fp-${crypto.randomUUID()}`;

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { rateLimitBuckets } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, `error-alert:${fp}`));
  });

  it("alerts once for the same error, whichever copy sees it first", async () => {
    const copyA = await import("@/lib/error-reporting");
    vi.resetModules();
    const copyB = await import("@/lib/error-reporting");
    expect(copyA).not.toBe(copyB);

    const results = [await copyA.shouldAlertAcrossCopies(fp), await copyB.shouldAlertAcrossCopies(fp), await copyA.shouldAlertAcrossCopies(fp)];
    expect(results).toEqual([true, false, false]);
  });
});
