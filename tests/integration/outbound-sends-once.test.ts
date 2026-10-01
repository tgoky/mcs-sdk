// tests/integration/outbound-sends-once.test.ts
//
// Two sends that reach real people outside the skill dispatcher:
// - Review requests: a request for a show and one for a payment, due for
//   the same person at the same moment, both passed "asked recently?" (it
//   only counted requests already sent), and a retry after a send whose
//   record failed sent again.
// - At-risk check-ins: a retry after a text whose log write failed
//   texted the prospect again.
import { describe, it, expect, afterAll, vi } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

const engagementId = `test-eng-sends-${crypto.randomUUID()}`;
const workspaceId = `test-ws-sends-${crypto.randomUUID()}`;
const whopUserId = `test-user-sends-${crypto.randomUUID()}`;
const emails: string[] = [];
const texts: string[] = [];

vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: async () => true }));
vi.mock("@/lib/credentials", () => ({ resolveCredential: async () => "secret" }));
vi.mock("@/lib/platforms/email", () => ({
  directSendProvider: () => "smtp",
  createDirectSendClient: () => ({
    sendEmail: async (to: string) => {
      await new Promise((r) => setTimeout(r, 20));
      emails.push(to);
      return { providerMessageId: crypto.randomUUID() };
    },
  }),
}));
vi.mock("@/lib/platforms/sms", () => ({
  sendSmsForTenant: async (_p: string, _k: string, _m: unknown, to: { phone?: string }) => {
    texts.push(to.phone ?? "");
    return { provider: "twilio", providerMessageId: crypto.randomUUID() };
  },
}));
vi.mock("@/lib/sms-replies", () => ({ isOptedOut: async () => false }));
vi.mock("@/lib/reminder-holdout", () => ({ isHeldOut: async () => false }));
vi.mock("@/lib/inngest", async (orig) => ({ ...(await orig<typeof import("@/lib/inngest")>()), inngest: { send: async () => {} } }));

d("outbound sends happen once", () => {
  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, reviewRequests, sequenceMessageLog, bookingRoster } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(sequenceMessageLog).where(eq(sequenceMessageLog.engagementId, engagementId));
    await db.delete(reviewRequests).where(eq(reviewRequests.engagementId, engagementId));
    await db.delete(bookingRoster).where(eq(bookingRoster.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("review requests: one message per person, even with two triggers due at once or a repeat attempt", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, reviewRequests } = await import("@/models/schema");
    const { sendReviewRequest } = await import("@/features/reputation-manager/server/review-requests");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({
      engagementId, whopUserId, workspaceId, buyer: "Test Buyer",
      stack: { rep_review_link: "https://g.page/r/test", rep_review_request_channel: "email", sms_platform: "twilio", at_risk_check_in: true } as never,
    });
    const due = new Date();
    const [showed] = await db.insert(reviewRequests).values({ engagementId, trigger: "showed", refId: "call_1", email: "pat@example.com", sendAt: due }).returning({ id: reviewRequests.id });
    const [paid] = await db.insert(reviewRequests).values({ engagementId, trigger: "paid", refId: "pay_1", email: "pat@example.com", sendAt: due }).returning({ id: reviewRequests.id });

    await Promise.all([sendReviewRequest(engagementId, showed.id), sendReviewRequest(engagementId, paid.id), sendReviewRequest(engagementId, showed.id)]);
    expect(emails).toEqual(["pat@example.com"]);
  });

  it("at-risk check-in: a repeat attempt after a send doesn't text again", async () => {
    const { db } = await import("@/lib/db");
    const { bookingRoster } = await import("@/models/schema");
    const { sendCheckIn } = await import("@/features/pile-on/server/at-risk-check-in");
    await db.insert(bookingRoster).values({ engagementId, externalCallId: "call_2", callTime: new Date(Date.now() + 3 * 3600_000), prospectEmail: "sam@example.com", prospectPhone: "+15550001111" } as never);

    const first = await sendCheckIn(engagementId, "call_2");
    const second = await sendCheckIn(engagementId, "call_2");
    expect(first.sent).toBe(true);
    expect(second).toEqual({ sent: false, reason: "Already sent." });
    expect(texts).toEqual(["+15550001111"]);
  });
});
