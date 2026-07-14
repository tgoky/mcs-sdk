import { inngest, inboundReplyReceived } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, winBackEnrollments, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { exitWinBackSequence } from "@/lib/platforms/email";

/**
 * Win-Back recovery gap 6 — halts the recovery cadence for a prospect who
 * replied. Handles both the native and forwarding paths identically once
 * the event is normalized (see inbound-reply.ts and
 * src/app/api/webhooks/inbound-reply/route.ts for how each path produces
 * this event).
 *
 * Reuses the exact same exitWinBackSequence() call the rebook-exit signal
 * already uses (see enrollment-service.ts) — from the buyer's ESP's
 * perspective, "stop the win-back cadence" is the same operation whether
 * triggered by a rebook or a reply; only the reason recorded on the
 * winBackEnrollments row differs.
 */
export const processInboundReply = inngest.createFunction(
  { id: "process-inbound-reply", triggers: [inboundReplyReceived] },
  async ({ event, step }) => {
    const { engagementId, fromEmail, source } = event.data;

    const tenant = await step.run("load-tenant", async () => {
      const [row] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      return row ?? null;
    });

    if (!tenant) {
      return { halted: false, reason: "engagement not found" };
    }

    const stack = tenant.stack as EngagementStack | null;
    if (!stack?.email_platform) {
      return { halted: false, reason: "no email platform configured" };
    }

    const activeEnrollment = await step.run("find-active-enrollment", async () => {
      const [row] = await db
        .select()
        .from(winBackEnrollments)
        .where(
          and(
            eq(winBackEnrollments.engagementId, engagementId),
            eq(winBackEnrollments.prospectEmail, fromEmail),
            eq(winBackEnrollments.status, "active")
          )
        )
        .limit(1);
      return row ?? null;
    });

    if (!activeEnrollment) {
      // Reply from someone who isn't in an active win-back cadence right
      // now — nothing to halt. Not an error; most inbound replies won't
      // correspond to an active enrollment at all.
      return { halted: false, reason: "no active win-back enrollment for this sender" };
    }

    await step.run("exit-sequence-and-mark", async () => {
      const apiKey = await resolveCredential(engagementId, stack.email_platform!);
      await exitWinBackSequence(
        stack.email_platform!,
        apiKey,
        fromEmail,
        {
          location_id: stack.booking_platform_meta?.location_id,
          recovery_workflow_id: stack.recovery_workflow_id,
          recovery_automation_id: stack.recovery_automation_id,
          activecampaign_base_url: stack.activecampaign_base_url,
        },
        "reply_exited"
      );

      await db
        .update(winBackEnrollments)
        .set({ status: "reply_exited", exitReason: "reply_detected", exitedAt: new Date() })
        .where(eq(winBackEnrollments.id, activeEnrollment.id));
    });

    return { halted: true, source };
  }
);
