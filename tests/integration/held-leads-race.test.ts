// tests/integration/held-leads-race.test.ts
//
// releaseHeldLead used to SELECT the lead, check status === "held" in
// JS, and only later UPDATE it — a check-then-act gap with no lock
// between the read and the write. Two concurrent calls for the same
// leadId (a double-click on Approve — the most ordinary real-world UI
// interaction there is) could both read "held" before either committed,
// and both go on to push the same lead to the ESP. Fixed with a plain
// conditional UPDATE ... WHERE status = 'held' as the atomic claim.
import { describe, it, expect, afterEach, vi } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

vi.mock("@/features/cold-open/server/esp/factory", () => ({
  createEspAdapter: vi.fn(() => ({
    pushLead: vi.fn(async () => ({ status: "dry_run" as const, detail: { mocked: true } })),
  })),
}));

d("releaseHeldLead — double-click race on the same held lead", () => {
  const engagementId = `test-eng-held-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-held-${crypto.randomUUID()}`;
  const whopUserId = `test-user-held-${crypto.randomUUID()}`;
  let leadId: string;

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, coldOpenLeads, coldOpenConfig } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(coldOpenLeads).where(eq(coldOpenLeads.engagementId, engagementId));
    await db.delete(coldOpenConfig).where(eq(coldOpenConfig.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("two concurrent approve calls on the same held lead push it exactly once", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, coldOpenLeads, coldOpenConfig } = await import("@/models/schema");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });
    await db.insert(coldOpenConfig).values({
      engagementId,
      sendPlatform: { platform: "instantly" },
      dailySendSettings: { volume: 10, localHour: 9, copyMode: "upload", liveSendEnabled: false },
    });

    const [row] = await db
      .insert(coldOpenLeads)
      .values({
        engagementId,
        runId: crypto.randomUUID(),
        email: "prospect@example.com",
        domain: "example.com",
        companyName: "Example Co",
        campaignId: "campaign_1",
        status: "held",
        statusDetail: { copy: { subject: "s", body1: "b1", body2: "b2", body3: "b3" } },
      })
      .returning();
    leadId = row.id;

    const { createEspAdapter } = await import("@/features/cold-open/server/esp/factory");
    const { releaseHeldLead } = await import("@/features/cold-open/server/held-leads");

    const [a, b] = await Promise.all([
      releaseHeldLead(engagementId, leadId, "approve"),
      releaseHeldLead(engagementId, leadId, "approve"),
    ]);

    const outcomes = [a, b];
    const succeeded = outcomes.filter((o) => "ok" in o && o.ok);
    const failed = outcomes.filter((o) => "error" in o);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const adapterFactory = createEspAdapter as unknown as ReturnType<typeof vi.fn>;
    const adapterInstance = adapterFactory.mock.results[0]?.value;
    expect(adapterFactory).toHaveBeenCalledTimes(1); // only the winner ever built an adapter / pushed
    expect(adapterInstance.pushLead).toHaveBeenCalledTimes(1);

    const { eq } = await import("drizzle-orm");
    const [finalRow] = await db.select().from(coldOpenLeads).where(eq(coldOpenLeads.id, leadId));
    expect(finalRow.status).toBe("dry_run"); // never left stuck in "claiming"
  });
});
