// tests/integration/stack-stale-write.test.ts
//
// Background runs (booking poller, Pin-Down onboarding, Win-Back cadence,
// the approval gate, ...) used to write back the whole engagements.stack
// from a copy read when they started, undoing any setting saved in the
// meantime. They now write only the keys they changed.
import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("engagements.stack stale writes", () => {
  const engagementId = `test-eng-stack-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-stack-${crypto.randomUUID()}`;
  const whopUserId = `test-user-stack-${crypto.randomUUID()}`;

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("a writer holding a stale copy keeps a setting saved after it read", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { stackChanges, stackPatchSql, patchEngagementStack } = await import("@/lib/engagement-stack");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({
      engagementId, whopUserId, workspaceId, buyer: "Test Buyer",
      stack: { booking_platform: "calendly", webhook_last_error: "old error" } as never,
    });

    // A long run reads the stack...
    const [{ stack: staleCopy }] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId));
    // ...the user saves a setting meanwhile...
    await patchEngagementStack(engagementId, { timezone: "America/New_York" } as never);
    // ...then the run writes back its copy with its own change, and the poller clears its error.
    await db.update(engagements).set({ stack: stackChanges(staleCopy, { ...(staleCopy as object), webhook_subscription_id: "sub_1" } as never) }).where(eq(engagements.engagementId, engagementId));
    await db.update(engagements).set({ stack: stackPatchSql({ webhook_last_error: undefined } as never) }).where(eq(engagements.engagementId, engagementId));

    const [{ stack }] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId));
    expect(stack).toEqual({ booking_platform: "calendly", timezone: "America/New_York", webhook_subscription_id: "sub_1" });
  });
});
