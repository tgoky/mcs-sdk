// tests/integration/crisis-window.test.ts
//
// Crisis Response reads flagged findings created since its last check.
// That point used to be the last successful run's *completion* time, so a
// finding a watcher saved while a run was in progress (after the run had
// read findings, before it finished) fell before the next run's window
// and was never assessed. The window is now (crisisCheckedThrough, upTo],
// with upTo fixed when the run reads findings.
import { describe, it, expect, afterAll, vi } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

const engagementId = `test-eng-crisis-${crypto.randomUUID()}`;
const workspaceId = `test-ws-crisis-${crypto.randomUUID()}`;
const whopUserId = `test-user-crisis-${crypto.randomUUID()}`;

// Set by a test to run something at the end of the run, after findings
// were read: standing in for a watcher saving a finding mid-run.
const mid: { onLog: null | (() => Promise<void>) } = { onLog: null };
const scoredTexts: string[] = [];

vi.mock("@/lib/run-log", () => ({
  emptySummary: () => ({ whatWasAttempted: [], whatWorked: [], whatFailed: [], openItems: [], decisionsMade: [] }),
  logStep: async () => {
    const fn = mid.onLog;
    mid.onLog = null;
    if (fn) await fn();
  },
  finishRun: async () => {},
  failRun: async () => {},
}));
vi.mock("@/lib/llm", () => ({
  callClaude: async (opts: { userMessage: string }) => {
    scoredTexts.push(opts.userMessage);
    return { text: JSON.stringify({ findings: [{ index: 0, reach: 1, sentiment: 1, permanence: 1, signalClass: null }], summary: "Minor." }) };
  },
}));
vi.mock("@/lib/notify", () => ({ notifyUser: async () => {} }));
vi.mock("@/features/reputation-manager/server/anomaly-detection", () => ({ detectAnomalies: async () => [], anomalyCooldownMs: () => 0 }));

async function addFlaggedReview(text: string) {
  const { db } = await import("@/lib/db");
  const { repTrustpilotReviews } = await import("@/models/schema");
  await db.insert(repTrustpilotReviews).values({ engagementId, externalReviewId: crypto.randomUUID(), rating: 1, reviewText: text, sentiment: "negative", flagged: true, flagReason: "test" });
}

d("Crisis Response window", () => {
  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, repIdentityGraphs, repTrustpilotReviews } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(repTrustpilotReviews).where(eq(repTrustpilotReviews.engagementId, engagementId));
    await db.delete(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("assesses a finding saved while the previous run was in progress", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, repIdentityGraphs } = await import("@/models/schema");
    const { runRepCrisisResponse } = await import("@/features/reputation-manager/server/crisis-response-service");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });
    await db.insert(repIdentityGraphs).values({ engagementId, operatorName: "Test Operator", soleAuthorityName: "Owner" });
    const tenant = { engagementId, whopUserId, stack: {} };

    // Run 1 finds nothing; while it finishes, a watcher saves a finding.
    mid.onLog = () => addFlaggedReview("Saved mid-run");
    await runRepCrisisResponse(tenant, crypto.randomUUID(), undefined);
    expect(scoredTexts).toHaveLength(0);

    // Run 2 must pick it up.
    await runRepCrisisResponse(tenant, crypto.randomUUID(), undefined);
    expect(scoredTexts.join("\n")).toContain("Saved mid-run");

    // Run 3 has nothing new: the finding isn't assessed twice.
    const before = scoredTexts.length;
    await runRepCrisisResponse(tenant, crypto.randomUUID(), undefined);
    expect(scoredTexts).toHaveLength(before);
  });
});
