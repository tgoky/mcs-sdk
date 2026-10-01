// tests/integration/queued-run-lookup.test.ts
//
// The dynamic-brief cron skips a client whose last brief run is still
// waiting in the queue; this is the lookup it uses.
import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("queued run lookup", () => {
  const ids = [0, 1, 2].map(() => `test-eng-queued-${crypto.randomUUID()}`);
  const workspaceId = `test-ws-queued-${crypto.randomUUID()}`;
  const whopUserId = `test-user-queued-${crypto.randomUUID()}`;

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, skillRuns } = await import("@/models/schema");
    const { inArray, eq } = await import("drizzle-orm");
    await db.delete(skillRuns).where(inArray(skillRuns.engagementId, ids));
    await db.delete(engagements).where(inArray(engagements.engagementId, ids));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("finds only clients with a run still waiting to start", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces } = await import("@/models/schema");
    const { startRun, markRunExecuting, engagementsWithQueuedRun } = await import("@/lib/run-log");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    for (const engagementId of ids) await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const [waiting, started, inline] = ids;
    await startRun({ id: crypto.randomUUID(), engagementId: waiting, skillName: "pre-call-read", phase: "p", queued: true });
    const startedRun = crypto.randomUUID();
    await startRun({ id: startedRun, engagementId: started, skillName: "pre-call-read", phase: "p", queued: true });
    await markRunExecuting(startedRun);
    await startRun({ id: crypto.randomUUID(), engagementId: inline, skillName: "pre-call-read", phase: "p" });

    expect([...(await engagementsWithQueuedRun("pre-call-read", ids))]).toEqual([waiting]);
    // One left behind long ago (its event never reached the queue) doesn't count.
    expect((await engagementsWithQueuedRun("pre-call-read", ids, -60_000)).size).toBe(0);
    expect((await engagementsWithQueuedRun("leak-map", ids)).size).toBe(0);
  });

  it("reads turned-off clients for just the page it's given", async () => {
    const { db } = await import("@/lib/db");
    const { engagementSkills } = await import("@/models/schema");
    const { getDisabledEngagementIdsForSkill } = await import("@/lib/engagement-skills");
    const { inArray } = await import("drizzle-orm");
    await db.insert(engagementSkills).values(ids.map((engagementId) => ({ engagementId, skillId: "pre-call-read", enabled: false })));
    expect([...(await getDisabledEngagementIdsForSkill("pre-call-read", [ids[1]]))]).toEqual([ids[1]]);
    expect((await getDisabledEngagementIdsForSkill("pre-call-read", [])).size).toBe(0);
    const all = await getDisabledEngagementIdsForSkill("pre-call-read");
    expect(ids.every((id) => all.has(id))).toBe(true);
    await db.delete(engagementSkills).where(inArray(engagementSkills.engagementId, ids));
  });
});
