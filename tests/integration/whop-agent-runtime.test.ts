// tests/integration/whop-agent-runtime.test.ts
//
// Real-database integration tests for the exact failure modes a live
// operator can trigger: two skills enabling around the same moment (the
// webhook-subscription race), a dead credential mid-session (the circuit
// breaker), and a double-submit on Bulk Promo Codes. These hit a real
// Postgres instance (DATABASE_URL) with the actual service functions —
// only the outbound Whop HTTP call itself is mocked, since there is no
// live Whop account to call in CI. Skipped automatically when no
// DATABASE_URL is configured (matches this repo's existing DB-dependent
// test convention).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

vi.mock("@/lib/whop-agent/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whop-agent/client")>();
  let createCallCount = 0;
  let deleteCallCount = 0;
  return {
    ...actual,
    __getCallCounts: () => ({ createCallCount, deleteCallCount }),
    WhopAgentClient: {
      ...actual.WhopAgentClient,
      forEngagement: vi.fn(async (engagementId: string) => ({
        engagementId,
        accountId: "biz_test123",
        pinnedVersionDate: "2024-01-01",
        request: vi.fn(async (endpoint: string) => {
          if (endpoint === "webhooks.create") {
            createCallCount++;
            // Widen the race window artificially — a real network round
            // trip to Whop is exactly this kind of delay in production.
            await new Promise((r) => setTimeout(r, 30 + Math.random() * 20));
            return { id: `hook_${crypto.randomUUID()}`, secret: `ws_test_${crypto.randomUUID()}` };
          }
          if (endpoint === "webhooks.delete") {
            deleteCallCount++;
            return {};
          }
          throw new Error(`Unexpected endpoint in test mock: ${endpoint}`);
        }),
      })),
    },
  };
});

d("Whop Agent — real-database race and failure-mode checks", () => {
  const engagementId = `test-eng-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-${crypto.randomUUID()}`;
  const whopUserId = `test-user-${crypto.randomUUID()}`;

  beforeAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, whopAgentConnections } = await import("@/models/schema");

    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });
    await db.insert(whopAgentConnections).values({
      engagementId,
      credentialType: "bot",
      whopAccountId: "biz_test123",
      pinnedVersionDate: "2024-01-01",
      circuitBreakerState: "closed",
    });

    const { encryptSecret } = await import("@/lib/credentials");
    const { credentialsRefs } = await import("@/models/schema");
    const { encryptedValue, iv, keyVersion } = encryptSecret("fake_bot_api_key_for_testing");
    await db.insert(credentialsRefs).values({
      engagementId,
      provider: "whop_bot_api_key",
      refKey: "whop_bot_api_key",
      encryptedValue,
      iv,
      keyVersion,
    });
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, whopWebhookRegistry, whopAgentConnections, credentialsRefs, skillRuns, pendingActions } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(whopWebhookRegistry).where(eq(whopWebhookRegistry.engagementId, engagementId));
    await db.delete(credentialsRefs).where(eq(credentialsRefs.engagementId, engagementId));
    await db.delete(whopAgentConnections).where(eq(whopAgentConnections.engagementId, engagementId));
    await db.delete(pendingActions).where(eq(pendingActions.engagementId, engagementId));
    await db.delete(skillRuns).where(eq(skillRuns.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("two concurrent ensureAgentWebhookSubscription calls for the same event set never leave two live rows", async () => {
    const { ensureAgentWebhookSubscription } = await import("@/features/whop-agent/server/webhook-subscription-service");
    const { db } = await import("@/lib/db");
    const { whopWebhookRegistry } = await import("@/models/schema");
    const { and, eq } = await import("drizzle-orm");

    const events = ["membership.went_valid", "membership.cancel_at_period_end_changed"];

    // Two "skills enabling at the same time" calls, genuinely concurrent —
    // not sequential awaits — so both pass the pre-insert SELECT before
    // either has inserted, the exact race window the fix targets.
    const [a, b] = await Promise.all([
      ensureAgentWebhookSubscription(engagementId, events),
      ensureAgentWebhookSubscription(engagementId, events),
    ]);

    // Both callers must get back a usable webhook id, and it must be the
    // SAME one — the loser defers to the winner rather than returning its
    // own now-deleted subscription.
    expect(a.whopWebhookId).toBe(b.whopWebhookId);

    const rows = await db
      .select()
      .from(whopWebhookRegistry)
      .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.createdByAgent, true)));

    expect(rows).toHaveLength(1);
    expect(rows[0].whopWebhookId).toBe(a.whopWebhookId);
  });

  it("a third call for the SAME event set after the row exists is a no-op read, not a new subscription", async () => {
    const { ensureAgentWebhookSubscription } = await import("@/features/whop-agent/server/webhook-subscription-service");
    const { db } = await import("@/lib/db");
    const { whopWebhookRegistry } = await import("@/models/schema");
    const { and, eq } = await import("drizzle-orm");

    const events = ["membership.went_valid", "membership.cancel_at_period_end_changed"];
    const result = await ensureAgentWebhookSubscription(engagementId, events);

    const rows = await db
      .select()
      .from(whopWebhookRegistry)
      .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.createdByAgent, true)));

    expect(rows).toHaveLength(1);
    expect(result.whopWebhookId).toBe(rows[0].whopWebhookId);
  });

  it("a credential error trips the circuit breaker, and every subsequent call is refused without hitting Whop again", async () => {
    const clientModule = await import("@/lib/whop-agent/client");
    const { db } = await import("@/lib/db");
    const { whopAgentConnections } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");

    // Reset to closed for this test's own engagement — a fresh id so the
    // previous tests' state can't interfere.
    const breakerEngagementId = `test-eng-breaker-${crypto.randomUUID()}`;
    const { engagements } = await import("@/models/schema");
    await db.insert(engagements).values({ engagementId: breakerEngagementId, whopUserId, workspaceId, buyer: "Breaker Test" });
    await db.insert(whopAgentConnections).values({
      engagementId: breakerEngagementId,
      credentialType: "bot",
      whopAccountId: "biz_test123",
      circuitBreakerState: "closed",
    });
    const { encryptSecret } = await import("@/lib/credentials");
    const { credentialsRefs } = await import("@/models/schema");
    const { encryptedValue, iv, keyVersion } = encryptSecret("fake_bot_api_key_for_testing");
    await db.insert(credentialsRefs).values({
      engagementId: breakerEngagementId,
      provider: "whop_bot_api_key",
      refKey: "whop_bot_api_key",
      encryptedValue,
      iv,
      keyVersion,
    });

    // Real client (not the mocked forEngagement above) with a mocked
    // fetch — exercises the actual request() classification + tripBreaker
    // logic, not a stand-in.
    const actualClientModule = await vi.importActual<typeof import("@/lib/whop-agent/client")>("@/lib/whop-agent/client");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 })
    );

    const client = await actualClientModule.WhopAgentClient.forEngagement(breakerEngagementId);
    await expect(client.request("accounts.get", "/v1/accounts")).rejects.toThrow();

    const [row] = await db.select().from(whopAgentConnections).where(eq(whopAgentConnections.engagementId, breakerEngagementId));
    expect(row.circuitBreakerState).toBe("open");
    expect(row.circuitBreakerReason).toBeTruthy();

    // A brand-new client construction for the same engagement must now
    // refuse before ever calling fetch again.
    fetchSpy.mockClear();
    await expect(actualClientModule.WhopAgentClient.forEngagement(breakerEngagementId)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    await db.delete(credentialsRefs).where(eq(credentialsRefs.engagementId, breakerEngagementId));
    await db.delete(whopAgentConnections).where(eq(whopAgentConnections.engagementId, breakerEngagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, breakerEngagementId));

    void clientModule;
  });

  it("a batch over the confirmation threshold queues for approval and issues zero live writes", async () => {
    const { runBulkPromoCodes } = await import("@/features/whop-agent/server/bulk-promo-codes-service");
    const specs = Array.from({ length: 26 }, (_, i) => ({
      code: `TEST${i}`,
      planIds: ["plan_test"],
      discountPercentage: 10,
    }));

    const result = await runBulkPromoCodes(engagementId, specs, { dryRun: false });
    expect(result.status).toBe("queued_for_confirmation");
    expect(result.pendingActionId).toBeTruthy();
    expect(result.created).toHaveLength(0);
  });

  it("double-submitting the same live batch dispatches two independent Inngest runs rather than crashing", async () => {
    const { inngest } = await import("@/lib/inngest");
    const sendSpy = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as unknown as ReturnType<typeof inngest.send> extends Promise<infer T> ? T : never);

    const { runBulkPromoCodes } = await import("@/features/whop-agent/server/bulk-promo-codes-service");
    const specs = [{ code: "DOUBLESUBMIT", planIds: ["plan_test"], discountPercentage: 10 }];

    const [first, second] = await Promise.all([
      runBulkPromoCodes(engagementId, specs, { dryRun: false }),
      runBulkPromoCodes(engagementId, specs, { dryRun: false }),
    ]);

    // Section 8.2 dry-run-by-default only applies once per skill per
    // engagement (clearDryRunForSkill runs inside the Inngest function,
    // not this decision step) — both calls here pass `dryRun: false`
    // explicitly, so both should queue their own run rather than one
    // silently overwriting the other's runId.
    expect(first.status).toBe("queued_live");
    expect(second.status).toBe("queued_live");
    expect(first.runId).not.toBe(second.runId);
    expect(sendSpy).toHaveBeenCalledTimes(2);

    sendSpy.mockRestore();
  });
});
