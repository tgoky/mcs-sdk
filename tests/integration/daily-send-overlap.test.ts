// tests/integration/daily-send-overlap.test.ts
//
// Daily Send picked leads nobody had contacted, pushed them to the
// client's sending tool, and only then recorded them. Two runs for the
// same client overlapping (a retry racing a slow run, or a manual run
// beside the cron) both picked the same leads and pushed each twice: the
// person got the sequence twice. Each lead is now claimed in the database
// before its push, so only one run can push it.
import { describe, it, expect, afterAll, vi } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

const engagementId = `test-eng-overlap-${crypto.randomUUID()}`;
const workspaceId = `test-ws-overlap-${crypto.randomUUID()}`;
const whopUserId = `test-user-overlap-${crypto.randomUUID()}`;
const LEADS = 12;
const csv = ["email,company", ...Array.from({ length: LEADS }, (_, i) => `p${i}@site${i}.com,Company ${i}`)].join("\n");

const pushes: string[] = [];
vi.mock("@/features/cold-open/server/config", () => ({
  preconditionCheck: async () => [],
  getColdOpenConfig: async () => ({
    leadSources: [{ icp: "smb", fetcherType: "csv", csvContent: csv, csvMapping: { email: "email", companyName: "company" } }],
    campaignMap: { smb: "campaign_1" },
    dailySendSettings: { volume: 100, localHour: 9, copyMode: "upload", liveSendEnabled: true },
    sendPlatform: { platform: "instantly" },
    reviewRequiredIcps: [],
    autoPushIcps: [],
    sendingPause: null,
  }),
  upsertColdOpenConfig: async () => {},
  setColdOpenPhaseState: async () => {},
}));
vi.mock("@/features/cold-open/server/business-status", () => ({
  verifyDomains: async (domains: string[]) => new Map(domains.map((dom) => [dom.toLowerCase(), { alive: true, status: "ok" }])),
}));
vi.mock("@/features/cold-open/server/copy-engine", () => ({
  assembleCopyForLead: async () => ({ subject: "s", body1: "b1", body2: "b2", body3: "b3" }),
}));
vi.mock("@/features/cold-open/server/esp/factory", () => ({
  createEspAdapter: () => ({
    pushLead: async (lead: { email: string }) => {
      // Slow enough that the two runs genuinely interleave.
      await new Promise((r) => setTimeout(r, 5));
      pushes.push(lead.email.toLowerCase());
      return { status: "pushed", detail: {} };
    },
  }),
}));
vi.mock("@/lib/run-log", () => ({
  emptySummary: () => ({ whatWasAttempted: [], whatWorked: [], whatFailed: [], openItems: [], decisionsMade: [] }),
  logStep: async () => {},
  finishRun: async () => {},
  failRun: async () => {},
}));

d("Daily Send: overlapping runs", () => {
  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, coldOpenLeads } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(coldOpenLeads).where(eq(coldOpenLeads.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("pushes every lead exactly once when two runs overlap", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, coldOpenLeads } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { runDailySend } = await import("@/features/cold-open/server/daily-send");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const tenant = { engagementId };
    await Promise.all([runDailySend(tenant, crypto.randomUUID(), undefined), runDailySend(tenant, crypto.randomUUID(), undefined)]);

    expect(pushes).toHaveLength(LEADS);
    expect(new Set(pushes).size).toBe(LEADS);
    const rows = await db.select({ status: coldOpenLeads.status }).from(coldOpenLeads).where(eq(coldOpenLeads.engagementId, engagementId));
    expect(rows).toHaveLength(LEADS);
    expect(rows.every((r) => r.status === "pushed")).toBe(true);
  });
});
