import { inngest, smsReplyReceived, inboundReplyReceived, winBackSequenceStop } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, smsReplies, winBackEnrollments, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { classifySmsReply, isOptedOut, matchProspect, needsPerson, recordOptIn, recordOptOut } from "@/lib/sms-replies";

/**
 * Sorts and acts on one text a prospect sent back (lib/sms-replies.ts).
 * Runs once per stored reply; a replay after it finished changes nothing
 * because each step checks what's already done.
 */
export const processSmsReply = inngest.createFunction(
  { id: "process-sms-reply", triggers: [smsReplyReceived], retries: 3 },
  async ({ event, step }) => {
    const { engagementId, replyId } = event.data;

    const reply = await step.run("load-reply", async () => {
      const [row] = await db.select().from(smsReplies).where(and(eq(smsReplies.id, replyId), eq(smsReplies.engagementId, engagementId))).limit(1);
      return row ?? null;
    });
    if (!reply) return { handled: false, reason: "reply not found" };
    if (reply.processedAt) return { handled: false, reason: "already processed" };

    const prospect = await step.run("match-prospect", () => matchProspect(engagementId, reply.fromPhone));

    const classified = await step.run("classify", async () =>
      classifySmsReply(reply.body, {
        engagementId,
        currentlyOptedOut: await isOptedOut(engagementId, reply.fromPhone),
        callTime: prospect.callTime,
        prospectName: prospect.prospectName,
      })
    );

    if (classified.intent === "stop") await step.run("opt-out", () => recordOptOut(engagementId, reply.fromPhone));
    if (classified.intent === "start") await step.run("opt-in", () => recordOptIn(engagementId, reply.fromPhone));

    // They answered a recovery text: a person takes it from here, the
    // recovery cadence stops. Same exit an email reply triggers.
    const endedRecovery =
      prospect.prospectEmail && classified.intent !== "start"
        ? await step.run("end-recovery", async () => {
            const email = prospect.prospectEmail!;
            const [enrollment] = await db
              .select({ id: winBackEnrollments.id })
              .from(winBackEnrollments)
              .where(and(eq(winBackEnrollments.engagementId, engagementId), eq(winBackEnrollments.prospectEmail, email), eq(winBackEnrollments.status, "active")))
              .limit(1);
            if (!enrollment) return false;
            const [tenant] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
            const stack = tenant?.stack as EngagementStack | null;
            if (stack?.email_platform) {
              // Also ends the email side in the client's own email tool.
              await inngest.send(inboundReplyReceived.create({ engagementId, fromEmail: email, subject: null, textBody: reply.body, source: "sms" }));
            } else {
              await db
                .update(winBackEnrollments)
                .set({ status: "reply_exited", exitReason: "sms_reply_detected", exitedAt: new Date() })
                .where(eq(winBackEnrollments.id, enrollment.id));
              await inngest.send(winBackSequenceStop.create({ enrollmentId: enrollment.id }));
            }
            return true;
          })
        : false;

    await step.run("save", async () => {
      await db
        .update(smsReplies)
        .set({
          intent: classified.intent,
          confidence: classified.confidence,
          classifiedBy: classified.classifiedBy,
          prospectEmail: prospect.prospectEmail,
          prospectName: prospect.prospectName,
          bookingId: prospect.bookingId,
          routedToQueue: needsPerson(classified),
          processedAt: new Date(),
        })
        .where(eq(smsReplies.id, replyId));
    });

    return { handled: true, intent: classified.intent, routedToQueue: needsPerson(classified), endedRecovery };
  }
);
