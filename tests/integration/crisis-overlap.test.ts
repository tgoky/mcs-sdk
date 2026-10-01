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

  it("a run that lost its claim to a newer one can't declare or move the window back", async () => {
    const { db } = await import("@/lib/db");
    const { repIdentityGraphs } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { claimCrisisWindow, renewCrisisClaim, markCheckedThrough } = await import("@/features/reputation-manager/server/crisis-response-service");
    const [slow, newer] = [crypto.randomUUID(), crypto.randomUUID()];

    expect(await claimCrisisWindow(engagementId, slow)).toBe(true);
    // The slow run goes quiet past the stale limit; a newer run takes over.
    await db.update(repIdentityGraphs).set({ crisisClaimedAt: new Date(Date.now() - 60 * 60_000) }).where(eq(repIdentityGraphs.engagementId, engagementId));
    expect(await claimCrisisWindow(engagementId, newer)).toBe(true);
    const later = new Date(Date.now() + 1000);
    await markCheckedThrough(engagementId, later, newer);

    expect(await renewCrisisClaim(engagementId, slow)).toBe(false);
    // The slow run's older end time doesn't move the window back...
    await markCheckedThrough(engagementId, new Date(Date.now() - 10 * 60_000), slow);
    let [row] = await db.select({ at: repIdentityGraphs.crisisCheckedThrough }).from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId));
    expect(row.at?.getTime()).toBe(later.getTime());

    // ...nor forward over findings a newer run hasn't assessed yet, and it
    // never clears that run's claim.
    const third = crypto.randomUUID();
    expect(await claimCrisisWindow(engagementId, third)).toBe(true);
    await markCheckedThrough(engagementId, new Date(Date.now() + 5000), slow);
    [row] = await db.select({ at: repIdentityGraphs.crisisCheckedThrough }).from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId));
    expect(row.at?.getTime()).toBe(later.getTime());
    expect(await renewCrisisClaim(engagementId, third)).toBe(true);
    // The holder's own later end time moves it.
    const latest = new Date(Date.now() + 9000);
    await markCheckedThrough(engagementId, latest, third);
    [row] = await db.select({ at: repIdentityGraphs.crisisCheckedThrough }).from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId));
    expect(row.at?.getTime()).toBe(latest.getTime());

    // A run that declared an incident moves the window even if its claim
    // went stale while declaring, and leaves the newer run's claim alone.
    const fourth = crypto.randomUUID();
    expect(await claimCrisisWindow(engagementId, fourth)).toBe(true);
    const declaredUpTo = new Date(Date.now() + 20_000);
    await markCheckedThrough(engagementId, declaredUpTo, slow, { declared: true });
    [row] = await db.select({ at: repIdentityGraphs.crisisCheckedThrough }).from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId));
    expect(row.at?.getTime()).toBe(declaredUpTo.getTime());
    expect(await renewCrisisClaim(engagementId, fourth)).toBe(true);
  });

  it("a run whose window was moved by another run since it read it stands down", async () => {
    const { db } = await import("@/lib/db");
    const { repIdentityGraphs } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { claimCrisisWindow, renewCrisisClaim, markCheckedThrough } = await import("@/features/reputation-manager/server/crisis-response-service");
    const [row] = await db.select({ at: repIdentityGraphs.crisisCheckedThrough }).from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId));
    const readStart = row.at ? row.at.toISOString() : null;
    const [b, a] = [crypto.randomUUID(), crypto.randomUUID()];

    // B claims and reads the window; A (slow, claim gone stale) declares
    // and moves the window before B gets to declare.
    await db.update(repIdentityGraphs).set({ crisisClaimRunId: null, crisisClaimedAt: null }).where(eq(repIdentityGraphs.engagementId, engagementId));
    expect(await claimCrisisWindow(engagementId, b)).toBe(true);
    expect(await renewCrisisClaim(engagementId, b, readStart)).toBe(true);
    await markCheckedThrough(engagementId, new Date(Date.now() + 60_000), a, { declared: true });
    expect(await renewCrisisClaim(engagementId, b, readStart)).toBe(false);
  });
});
