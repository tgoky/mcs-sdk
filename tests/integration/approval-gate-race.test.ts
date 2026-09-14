// tests/integration/approval-gate-race.test.ts
//
// A double-click on "Approve" — the most ordinary real-world interaction
// there is — sends two concurrent requests for the same pending action id.
// decidePendingAction's check-then-act (SELECT status, then UPDATE +
// execute) has no locking between the read and the write, so both requests
// can see status: "pending" before either commits its update. For a Whop
// Agent action like whop_bulk_promo_codes_confirm, whose executor
// (executeBulkPromoCodesConfirm -> runBulkPromoCodes) mints a *fresh*
// runId — and therefore fresh per-code idempotency keys — on every call,
// a second execution isn't a harmless no-op: it would create the entire
// promo-code batch a second time on the live Whop account.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("approval-gate — double-click / concurrent-decision race", () => {
  const engagementId = `test-eng-approval-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-approval-${crypto.randomUUID()}`;
  const whopUserId = `test-user-approval-${crypto.randomUUID()}`;

  beforeAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces } = await import("@/models/schema");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, pendingActions, skillRuns } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(pendingActions).where(eq(pendingActions.engagementId, engagementId));
    await db.delete(skillRuns).where(eq(skillRuns.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("two concurrent approvals of the same pending action execute the underlying action exactly once", async () => {
    const { db } = await import("@/lib/db");
    const { pendingActions } = await import("@/models/schema");
    const { inngest } = await import("@/lib/inngest");

    const sendSpy = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as unknown as ReturnType<typeof inngest.send> extends Promise<infer T> ? T : never);

    const [row] = await db
      .insert(pendingActions)
      .values({
        engagementId,
        actionType: "whop_bulk_promo_codes_confirm",
        payload: { specs: [{ code: "RACE10", planIds: ["plan_test"], discountPercentage: 10 }] },
        status: "pending",
      })
      .returning();

    const { decidePendingAction } = await import("@/lib/approval-gate");

    const [a, b] = await Promise.all([
      decidePendingAction(row.id, "approved", "tester-a"),
      decidePendingAction(row.id, "approved", "tester-b"),
    ]);

    // Exactly one of the two concurrent callers should have actually
    // triggered execution; the other must see it as already decided
    // rather than silently re-running the executor.
    const outcomes = [a, b];
    const executedCount = outcomes.filter((o) => "executed" in o && o.executed).length;
    const alreadyDecidedCount = outcomes.filter((o) => !o.ok).length;

    expect(executedCount).toBe(1);
    expect(alreadyDecidedCount).toBe(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);

    sendSpy.mockRestore();
  });
});
