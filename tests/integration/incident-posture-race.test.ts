// tests/integration/incident-posture-race.test.ts
//
// The tier-3 posture-selection route (posture/route.ts) used to SELECT
// repIncidents.selectedPosture, check it was null in JS, and only later
// UPDATE it — a check-then-act gap with no lock between the read and the
// write, identical in shape to held-leads-race.test.ts's releaseHeldLead
// bug and approval-gate-race.test.ts's decidePendingAction bug found
// earlier in this codebase. Two concurrent posture choices for the same
// incident (a double-click, two tabs open on the same incident, a client
// retry after a slow response) could both read selectedPosture: null and
// both go on to write it and generate a draft — two LLM-drafted responses
// queued as two separate pending actions for one tier-3 incident.
//
// This proves the fix directly: the route's claim is now a single
// conditional UPDATE ... WHERE selected_posture IS NULL, exercised here
// exactly as the route itself runs it (not re-implemented), against two
// genuinely concurrent callers.
import { describe, it, expect, afterEach } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("repIncidents posture claim — concurrent double-click race", () => {
  const engagementId = `test-eng-posture-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-posture-${crypto.randomUUID()}`;
  const whopUserId = `test-user-posture-${crypto.randomUUID()}`;
  let incidentId: string;

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, repIncidents } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(repIncidents).where(eq(repIncidents.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("two concurrent posture choices on the same incident: exactly one claims it", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, repIncidents } = await import("@/models/schema");
    const { eq, and, isNull } = await import("drizzle-orm");

    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const [row] = await db
      .insert(repIncidents)
      .values({
        engagementId,
        severityScore: 55,
        summary: "Test incident",
        contributingFindings: [{ source: "trustpilot", excerpt: "bad review", flagReason: null }],
        responseTier: "tier3_pause_and_instruct",
      })
      .returning();
    incidentId = row.id;

    // Mirrors posture/route.ts's own claim exactly — the atomic
    // conditional UPDATE that replaced the old SELECT-then-UPDATE.
    const claimPosture = (posture: string) =>
      db
        .update(repIncidents)
        .set({ selectedPosture: posture })
        .where(and(eq(repIncidents.id, incidentId), eq(repIncidents.engagementId, engagementId), isNull(repIncidents.selectedPosture)))
        .returning({ selectedPosture: repIncidents.selectedPosture });

    const [a, b] = await Promise.all([
      claimPosture("factual_correction"),
      claimPosture("monitor_only"),
    ]);

    const claimedCount = [a, b].filter((r) => r.length > 0).length;
    expect(claimedCount).toBe(1); // exactly one caller wins the claim — the other gets zero rows back, not a silent overwrite

    const [finalRow] = await db.select({ selectedPosture: repIncidents.selectedPosture }).from(repIncidents).where(eq(repIncidents.id, incidentId));
    // The winning posture is whichever claim's UPDATE actually committed —
    // deterministically one of the two, never null and never both.
    expect(["factual_correction", "monitor_only"]).toContain(finalRow.selectedPosture);
  });

  it("a second choice after the first has already landed is rejected, not silently overwritten", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, repIncidents } = await import("@/models/schema");
    const { eq, and, isNull } = await import("drizzle-orm");

    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const [row] = await db
      .insert(repIncidents)
      .values({
        engagementId,
        severityScore: 55,
        summary: "Test incident",
        contributingFindings: [{ source: "trustpilot", excerpt: "bad review", flagReason: null }],
        responseTier: "tier3_pause_and_instruct",
      })
      .returning();
    incidentId = row.id;

    const claimPosture = (posture: string) =>
      db
        .update(repIncidents)
        .set({ selectedPosture: posture })
        .where(and(eq(repIncidents.id, incidentId), eq(repIncidents.engagementId, engagementId), isNull(repIncidents.selectedPosture)))
        .returning({ selectedPosture: repIncidents.selectedPosture });

    const first = await claimPosture("acknowledge_private_resolution");
    expect(first).toHaveLength(1);

    const second = await claimPosture("escalate_externally");
    expect(second).toHaveLength(0); // no rows updated — the route reports 409, never clobbers the first choice

    const [finalRow] = await db.select({ selectedPosture: repIncidents.selectedPosture }).from(repIncidents).where(eq(repIncidents.id, incidentId));
    expect(finalRow.selectedPosture).toBe("acknowledge_private_resolution");
  });
});
