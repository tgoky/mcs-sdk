// tests/integration/daily-send-csv-progression.test.ts
//
// The csv fetcher has no cursor — it always returns the file's rows in
// file order. Before this fix, daily-send.ts capped the FETCH itself to
// this run's volume, so every run parsed only the file's first `volume`
// rows. Once those were marked contacted (a real DB row from a previous
// run), the historical dedupe excluded all of them and the function
// never looked any further into the file — a CSV bigger than one day's
// volume could never be worked through past day one, silently, forever.
// This reproduces exactly that scenario against a real database: seed
// rows simulating "day 1 already contacted the first N leads," then
// confirm fetchAndSelectNewLeads actually surfaces leads further down
// the file on "day 2," (The volume cap itself now runs after liveness, in runDailySend.)
import { describe, it, expect, afterEach } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

function csvFor(count: number): string {
  const header = "email,company";
  const rows = Array.from({ length: count }, (_, i) => `lead${i}@example${i}.com,Company ${i}`);
  return [header, ...rows].join("\n");
}

d("fetchAndSelectNewLeads — csv sources progress past already-contacted leads", () => {
  const engagementId = `test-eng-coldopen-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-coldopen-${crypto.randomUUID()}`;
  const whopUserId = `test-user-coldopen-${crypto.randomUUID()}`;
  const runId = crypto.randomUUID();

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, coldOpenLeads } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(coldOpenLeads).where(eq(coldOpenLeads.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("day 2 surfaces leads beyond the ones day 1 already contacted, instead of re-fetching and re-excluding the same first N forever", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, coldOpenLeads } = await import("@/models/schema");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const TOTAL_LEADS = 30;
    const VOLUME = 10;
    const config = {
      leadSources: [{ icp: "smb", fetcherType: "csv" as const, csvContent: csvFor(TOTAL_LEADS), csvMapping: { email: "email", companyName: "company" } }],
      campaignMap: { smb: "campaign_1" },
    };

    const { fetchAndSelectNewLeads } = await import("@/features/cold-open/server/daily-send");

    // Day 1: nothing handled yet — every lead in the file is new. (The
    // volume cap is applied later, in runDailySend, after liveness.)
    const day1 = await fetchAndSelectNewLeads(runId, engagementId, config, true);
    expect(day1.fetched).toBe(TOTAL_LEADS);
    expect(day1.newLeads).toHaveLength(TOTAL_LEADS);
    const day1Sent = day1.newLeads.slice(0, VOLUME);
    const day1Emails = day1Sent.map((d) => d.lead.email.toLowerCase());

    // Simulate day 1's run pushing its first VOLUME leads.
    for (const { lead, campaignId } of day1Sent) {
      await db.insert(coldOpenLeads).values({ engagementId, runId, email: lead.email, domain: lead.domain, companyName: lead.companyName, campaignId, status: "pushed" });
    }

    // Day 2: same file, same config — the pushed leads are gone and the
    // list starts at the next one.
    const day2 = await fetchAndSelectNewLeads(runId, engagementId, config, true);
    expect(day2.newLeads).toHaveLength(TOTAL_LEADS - VOLUME);
    const day2Emails = day2.newLeads.map((d) => d.lead.email.toLowerCase());
    expect(day2Emails[0]).toBe(`lead${VOLUME}@example${VOLUME}.com`);
    expect(day2Emails.some((e) => day1Emails.includes(e))).toBe(false);
  });

  it("dry-run rows only block a lead while live sending is off", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, coldOpenLeads } = await import("@/models/schema");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });
    const config = {
      leadSources: [{ icp: "smb", fetcherType: "csv" as const, csvContent: csvFor(3), csvMapping: { email: "email", companyName: "company" } }],
      campaignMap: { smb: "campaign_1" },
    };
    await db.insert(coldOpenLeads).values({ engagementId, runId, email: "lead0@example0.com", domain: "example0.com", companyName: "Company 0", campaignId: "campaign_1", status: "dry_run" });

    const { fetchAndSelectNewLeads } = await import("@/features/cold-open/server/daily-send");
    expect((await fetchAndSelectNewLeads(runId, engagementId, config, false)).newLeads).toHaveLength(2);
    expect((await fetchAndSelectNewLeads(runId, engagementId, config, true)).newLeads).toHaveLength(3);
  });
});
