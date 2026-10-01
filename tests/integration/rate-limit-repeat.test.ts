// tests/integration/rate-limit-repeat.test.ts
//
// The second hit on a key takes the on-conflict path. It used to bind raw
// Dates that postgres-js can't encode, so it threw and the limiter let
// every repeat request through.
import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("rate limiter on repeat hits", () => {
  const subject = crypto.randomUUID();
  const rule = { name: "test-repeat", limit: 2, windowSeconds: 60 };

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { rateLimitBuckets } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, `${rule.name}:${subject}`));
  });

  it("counts every hit and blocks past the limit, then resets after the window", async () => {
    const { hitRateLimit } = await import("@/lib/rate-limit");
    const t0 = new Date();
    const hits = [];
    for (let i = 0; i < 3; i++) hits.push(await hitRateLimit(rule, subject, t0));
    expect(hits.map((h) => [h.allowed, h.count])).toEqual([[true, 1], [true, 2], [false, 3]]);
    expect(hits[2].retryAfterSeconds).toBeGreaterThan(0);

    const later = new Date(t0.getTime() + 61_000);
    const fresh = await hitRateLimit(rule, subject, later);
    expect([fresh.allowed, fresh.count]).toEqual([true, 1]);
  });
});

d("rate limiter clean-up", () => {
  it("deletes windows older than the cutoff and keeps fresh ones", async () => {
    const { hitRateLimit, deleteExpiredRateLimitBuckets } = await import("@/lib/rate-limit");
    const { db } = await import("@/lib/db");
    const { rateLimitBuckets } = await import("@/models/schema");
    const { inArray } = await import("drizzle-orm");
    const old = `old-${crypto.randomUUID()}`;
    const fresh = `fresh-${crypto.randomUUID()}`;
    const now = new Date();
    await hitRateLimit({ name: "test-sweep", limit: 5, windowSeconds: 60 }, old, new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));
    await hitRateLimit({ name: "test-sweep", limit: 5, windowSeconds: 60 }, fresh, now);
    await deleteExpiredRateLimitBuckets(24 * 60 * 60, now);
    const left = await db.select({ key: rateLimitBuckets.key }).from(rateLimitBuckets).where(inArray(rateLimitBuckets.key, [`test-sweep:${old}`, `test-sweep:${fresh}`]));
    expect(left.map((r) => r.key)).toEqual([`test-sweep:${fresh}`]);
    await db.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.key, [`test-sweep:${fresh}`]));
  });
});
