// tests/integration/crisis-overlap.test.ts
//
// Two Crisis Response runs for one client overlapping (a retry beside the
// hourly run, say) read the same findings window and both declared the
// incident: two incident rows and the operator paged twice. A run now
// takes the client's crisis window before assessing it.
import { describe, it, expect, afterAll, vi } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

const engagementId = `test-eng-crisis2-${crypto.randomUUID()}`;
const workspaceId = `test-ws-crisis2-${crypto.randomUUID()}`;
const whopUserId = `test-user-crisis2-${crypto.randomUUID()}`;
const pages: string[] = [];

vi.mock("@/lib/run-log", () => ({
  emptySummary: () => ({ whatWasAttempted: [], whatWorked: [], whatFailed: [], openItems: [], decisionsMade: [] }),
  logStep: async () => {},
  finishRun: async () => {},
  failRun: async () => {},
}));
vi.mock("@/lib/llm", () => ({
  callClaude: async () => {
    // Slow enough that both runs are assessing at the same time.
    await new Promise((r) => setTimeout(r, 30));
    return { text: JSON.stringify({ findings: [{ index: 0, reach: 10, sentiment: 10, permanence: 10, signalClass: null }], summary: "Severe." }) };
  },
}));
vi.mock("@/lib/notify", () => ({ notifyUser: async (n: { type: string }) => { pages.push(n.type); } }));
vi.mock("@/features/cold-open/server/crisis-pause", () => ({ proposeCrisisPause: async () => null }));
vi.mock("@/features/reputation-manager/server/response-routing", () => ({ loadRoutingContext: async () => null, routeOneFinding: async () => null }));
vi.mock("@/features/reputation-manager/server/anomaly-detection", () => ({ detectAnomalies: async () => [], anomalyCooldownMs: () => 0 }));

d("Crisis Response: overlapping runs", () => {
  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, repIdentityGraphs, repTrustpilotReviews, repIncidents } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(repIncidents).where(eq(repIncidents.engagementId, engagementId));
    await db.delete(repTrustpilotReviews).where(eq(repTrustpilotReviews.engagementId, engagementId));
    await db.delete(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("declares the incident and pages the operator once", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, repIdentityGraphs, repTrustpilotReviews, repIncidents } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { runRepCrisisResponse } = await import("@/features/reputation-manager/server/crisis-response-service");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });
    await db.insert(repIdentityGraphs).values({ engagementId, operatorName: "Test Operator", soleAuthorityName: "Owner" });
    await db.insert(repTrustpilotReviews).values({ engagementId, externalReviewId: crypto.randomUUID(), rating: 1, reviewText: "Scam, stole my money", sentiment: "negative", flagged: true, flagReason: "fraud claim" });

    const tenant = { engagementId, whopUserId, stack: {} };
    await Promise.all([runRepCrisisResponse(tenant, crypto.randomUUID(), undefined), runRepCrisisResponse(tenant, crypto.randomUUID(), undefined)]);

    const incidents = await db.select().from(repIncidents).where(eq(repIncidents.engagementId, engagementId));
    expect(incidents).toHaveLength(1);
    expect(pages.filter((t) => t === "reputation_crisis_declared")).toHaveLength(1);

    // The claim was released, so the next run proceeds normally.
    const [graph] = await db.select({ claim: repIdentityGraphs.crisisClaimRunId }).from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId));
    expect(graph.claim).toBeNull();
  });
});
