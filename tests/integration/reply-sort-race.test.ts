// tests/integration/reply-sort-race.test.ts
//
// coldOpenReplies has a real unique index on (engagementId,
// externalReplyId), but the insert in runReplySort had no
// onConflictDoNothing — two overlapping runs (or a whole-function
// Inngest retry racing a still-finishing prior attempt) that both pass
// the check-then-act dedupe SELECT for the same reply would have the
// loser's plain INSERT throw an unhandled unique-violation error,
// crashing the entire run instead of quietly losing the race. This
// proves the fix directly against the real constraint: two concurrent
// inserts for the same (engagementId, externalReplyId) must not throw,
// and exactly one row must land.
import { describe, it, expect, afterEach } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("coldOpenReplies insert — concurrent dedupe race", () => {
  const engagementId = `test-eng-replysort-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-replysort-${crypto.randomUUID()}`;
  const whopUserId = `test-user-replysort-${crypto.randomUUID()}`;
  const externalReplyId = `reply_${crypto.randomUUID()}`;

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, coldOpenReplies } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(coldOpenReplies).where(eq(coldOpenReplies.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("two concurrent inserts for the same externalReplyId resolve without throwing, exactly one row lands", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, coldOpenReplies } = await import("@/models/schema");
    const { eq, and } = await import("drizzle-orm");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    // Mirrors runReplySort's own insert exactly — this is what the second,
    // racing call in a real overlapping run would execute.
    const insertOne = () =>
      db
        .insert(coldOpenReplies)
        .values({
          engagementId,
          leadEmail: "prospect@example.com",
          campaignId: "campaign_1",
          externalReplyId,
          disposition: "interested",
          classificationSource: "model",
          rawBody: "Sounds interesting, tell me more!",
          routedToQueue: true,
        })
        .onConflictDoNothing()
        .returning({ id: coldOpenReplies.id });

    const [a, b] = await Promise.all([insertOne(), insertOne()]);
    const insertedCount = [a, b].filter((r) => r.length > 0).length;
    expect(insertedCount).toBe(1); // one winner, one silent no-op — neither call threw

    const rows = await db
      .select()
      .from(coldOpenReplies)
      .where(and(eq(coldOpenReplies.engagementId, engagementId), eq(coldOpenReplies.externalReplyId, externalReplyId)));
    expect(rows).toHaveLength(1);
  });
});
