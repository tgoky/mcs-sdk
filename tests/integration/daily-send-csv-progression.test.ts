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
// the file on "day 2," respecting the volume cap on the new leads only.
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

    // Day 1: nothing contacted yet — should get the first VOLUME leads.
    const day1 = await fetchAndSelectNewLeads(runId, engagementId, config, VOLUME);
    expect(day1.fetched).toBe(TOTAL_LEADS); // fetched the whole file...
    expect(day1.deduped).toHaveLength(VOLUME); // ...but capped new leads to volume
    const day1Emails = day1.deduped.map((d) => d.lead.email.toLowerCase());
    expect(day1Emails).toEqual(Array.from({ length: VOLUME }, (_, i) => `lead${i}@example${i}.com`));

    // Simulate day 1's run actually contacting them (what runDailySend's
    // push loop would have written).
    for (const { lead, campaignId } of day1.deduped) {
      await db.insert(coldOpenLeads).values({
        engagementId,
        runId,
        email: lead.email,
        domain: lead.domain,
        companyName: lead.companyName,
        campaignId,
        status: "dry_run",
      });
    }

    // Day 2: the exact same file, same config. This is what was broken —
    // it used to fetch only the first VOLUME rows again, see them all as
    // already-contacted, and end up with zero new leads forever.
    const day2 = await fetchAndSelectNewLeads(runId, engagementId, config, VOLUME);
    expect(day2.deduped).toHaveLength(VOLUME);
    const day2Emails = day2.deduped.map((d) => d.lead.email.toLowerCase());
    // Must be the NEXT VOLUME leads (indices 10-19), not a repeat of day 1's.
    expect(day2Emails).toEqual(Array.from({ length: VOLUME }, (_, i) => `lead${i + VOLUME}@example${i + VOLUME}.com`));
    expect(day2Emails.some((e) => day1Emails.includes(e))).toBe(false);
  });

  it("respects a per-source dailyLimit on top of the overall volume, applied to new leads only", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces } = await import("@/models/schema");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const config = {
      leadSources: [{ icp: "smb", fetcherType: "csv" as const, csvContent: csvFor(50), csvMapping: { email: "email", companyName: "company" }, dailyLimit: 5 }],
      campaignMap: { smb: "campaign_1" },
    };

    const { fetchAndSelectNewLeads } = await import("@/features/cold-open/server/daily-send");
    const result = await fetchAndSelectNewLeads(runId, engagementId, config, 20);
    // dailyLimit (5) is stricter than volume (20) for this one source.
    expect(result.deduped).toHaveLength(5);
  });
});
