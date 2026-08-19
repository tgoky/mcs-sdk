import { inngest, winBackEmailSmtpSequenceStart, winBackSequenceStop } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, winBackEnrollments, sequenceMessageLog, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { createDirectSendClient } from "@/lib/platforms/email";
import { maybeNotifySequenceFailure } from "@/lib/sequence-notify";

/**
 * Durable win-back email sender for the direct-send platform (email_platform
 * === "smtp") — mirrors win-back-sms.ts's structure exactly (day-scale
 * relative step.sleep offsets, an active-status check before every send).
 *
 * "smtp" covers two transports, chosen by the credential blob's own
 * "provider" field (see createDirectSendClient in
 * src/lib/platforms/email.ts): raw SMTP, or Resend's HTTP API for buyers
 * who want direct sending without standing up a mail server. Neither has
 * an ESP-side list/automation to enroll a prospect into (see the module
 * comment on SMTPClient in email.ts), so this app owns the send schedule
 * itself, using the same `winBackSequenceAssetMap.emails` content that's
 * already generated for every email_platform — for the four ESP platforms
 * that content feeds a merge-tag; here it becomes the literal outbound
 * email.
 */
export const processWinBackEmailSmtpSequence = inngest.createFunction(
  {
    id: "process-win-back-email-smtp-sequence",
    triggers: [winBackEmailSmtpSequenceStart],
    cancelOn: [{ event: winBackSequenceStop, match: "data.enrollmentId" }],
  },
  async ({ event, step }) => {
    const { engagementId, runId, enrollmentId, prospectEmail, prospectName } = event.data;

    const tenant = await step.run("load-tenant", async () => {
      const [row] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      return row ?? null;
    });

    if (!tenant) {
      return { sent: 0, reason: "engagement not found" };
    }

    const stack = tenant.stack as EngagementStack | null;

    // Same buyer_exported guard as win-back-sms.ts — once an operator has
    // exported this engagement, the buyer's own infra owns sending.
    if (stack?.runtime_ownership_model === "buyer_exported") {
      return { sent: 0, reason: "engagement was exported to buyer_exported ownership — this app no longer sends for it" };
    }

    if (stack?.email_platform !== "smtp") {
      return { sent: 0, reason: "email_platform is not smtp" };
    }

    const emailAssetMap = tenant.winBackSequenceAssetMap as {
      emails?: Array<{ id: string; offsetDays: number; subject?: string; body: string }>;
    } | null;

    if (!emailAssetMap?.emails?.length) {
      return { sent: 0, reason: "no win-back email sequence content generated for this engagement" };
    }

    let sent = 0;
    let previousOffsetDays = 0;

    for (const message of [...emailAssetMap.emails].sort((a, b) => a.offsetDays - b.offsetDays)) {
      const waitDays = message.offsetDays - previousOffsetDays;
      if (waitDays > 0) {
        await step.sleep(`wait-before-${message.id}`, `${waitDays}d`);
      }
      previousOffsetDays = message.offsetDays;

      // A rebook or reply-exit stops the sequence — check the
      // enrollment's live status before every send, same principle as
      // win-back-sms.ts and pile-on-sms.ts.
      const stillActive = await step.run(`check-still-active-${message.id}`, async () => {
        const [row] = await db
          .select({ status: winBackEnrollments.status })
          .from(winBackEnrollments)
          .where(eq(winBackEnrollments.id, enrollmentId))
          .limit(1);
        return row?.status === "active";
      });

      if (!stillActive) {
        return { sent, reason: "win-back enrollment no longer active — stopping" };
      }

      try {
        await step.run(`send-${message.id}`, async () => {
          const raw = await resolveCredential(engagementId, "smtp");
          await createDirectSendClient(raw).sendEmail(
            prospectEmail,
            message.subject ?? `A quick note for ${prospectName}`,
            message.body
          );
        });
        await step.run(`log-sent-${message.id}`, async () => {
          await db.insert(sequenceMessageLog).values({
            engagementId,
            runId,
            sequenceType: "win_back_email_smtp",
            enrollmentId,
            messageId: message.id,
            channel: "email",
            prospectEmail,
            status: "sent",
          });
        });
        sent++;
      } catch (sendErr: any) {
        await step.run(`log-failed-${message.id}`, async () => {
          const [logged] = await db
            .insert(sequenceMessageLog)
            .values({
              engagementId,
              runId,
              sequenceType: "win_back_email_smtp",
              enrollmentId,
              messageId: message.id,
              channel: "email",
              prospectEmail,
              status: "failed",
              error: sendErr?.message ?? String(sendErr),
            })
            .returning({ id: sequenceMessageLog.id });

          await maybeNotifySequenceFailure({
            engagementId,
            sequenceType: "win_back_email_smtp",
            justLoggedId: logged.id,
            error: sendErr?.message ?? String(sendErr),
          });
        });
      }
    }

    return { sent };
  }
);
