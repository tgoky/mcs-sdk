import { inngest, winBackEmailSmtpSequenceStart } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, winBackEnrollments, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { SMTPClient, parseSmtpCredential } from "@/lib/platforms/email";

/**
 * Durable win-back email sender for the SMTP direct-send platform —
 * mirrors win-back-sms.ts's structure exactly (day-scale relative
 * step.sleep offsets, an active-status check before every send), but for
 * email_platform === "smtp" instead of the direct-send SMS platforms.
 *
 * SMTP has no ESP-side list/automation to enroll a prospect into (see the
 * module comment in src/lib/platforms/email.ts's SMTPClient section), so
 * this app owns the send schedule itself, using the same
 * `winBackSequenceAssetMap.emails` content that's already generated for
 * every email_platform — for the four ESP platforms that content feeds a
 * merge-tag; for SMTP it becomes the literal outbound email.
 */
export const processWinBackEmailSmtpSequence = inngest.createFunction(
  { id: "process-win-back-email-smtp-sequence", triggers: [winBackEmailSmtpSequenceStart] },
  async ({ event, step }) => {
    const { engagementId, enrollmentId, prospectEmail, prospectName } = event.data;

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

      await step.run(`send-${message.id}`, async () => {
        const raw = await resolveCredential(engagementId, "smtp");
        const config = parseSmtpCredential(raw);
        await new SMTPClient(config).sendEmail(
          prospectEmail,
          message.subject ?? `A quick note for ${prospectName}`,
          message.body
        );
      });
      sent++;
    }

    return { sent };
  }
);
