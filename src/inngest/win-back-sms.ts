import { inngest, winBackSmsSequenceStart } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, winBackEnrollments, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { sendSmsForTenant } from "@/lib/platforms/sms";

/**
 * Win-Back recovery gap 2 — durable SMS sequence sender for the
 * recovery cadence's direct-send platforms (Twilio, GHL SMS). hubspot_sms
 * doesn't go through here — same reasoning as pile-on-sms.ts: it's a
 * single tag-and-done call in enrollment-service.ts, HubSpot's own
 * automation owns the send timing.
 *
 * Day-scale offsets (recovery_window_days is 14-60), unlike Pile-On's
 * SMS sequence which lives entirely inside a pre-call window measured in
 * hours — so this uses simple relative step.sleep durations rather than
 * pile-on-sms.ts's absolute-timestamp-anchored-to-call-time approach,
 * since there's no "don't fire after the call already happened" collision
 * to guard against here.
 */
export const processWinBackSmsSequence = inngest.createFunction(
  { id: "process-win-back-sms-sequence", triggers: [winBackSmsSequenceStart] },
  async ({ event, step }) => {
    const { engagementId, enrollmentId, prospectEmail, prospectPhone } = event.data;

    const tenant = await step.run("load-tenant", async () => {
      const [row] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      return row ?? null;
    });

    if (!tenant) {
      return { sent: 0, reason: "engagement not found" };
    }

    const stack = tenant.stack as EngagementStack | null;
    const smsAssetMap = tenant.winBackSequenceAssetMap as { sms?: Array<{ id: string; offsetDays: number; body: string }> } | null;

    if (!stack?.sms_platform || (stack.sms_platform !== "twilio" && stack.sms_platform !== "ghl_sms")) {
      return { sent: 0, reason: "sms_platform is not a direct-send platform" };
    }
    if (!smsAssetMap?.sms?.length) {
      return { sent: 0, reason: "no win-back SMS sequence content generated for this engagement" };
    }

    let sent = 0;
    let previousOffsetDays = 0;

    for (const message of [...smsAssetMap.sms].sort((a, b) => a.offsetDays - b.offsetDays)) {
      const waitDays = message.offsetDays - previousOffsetDays;
      if (waitDays > 0) {
        await step.sleep(`wait-before-${message.id}`, `${waitDays}d`);
      }
      previousOffsetDays = message.offsetDays;

      // A rebook or reply-exit stops the SMS side of the cadence too —
      // check the enrollment's live status before every send, not just
      // once at the start, same "check between every message" principle
      // pile-on-sms.ts uses.
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
        const apiKey = await resolveCredential(engagementId, stack.sms_platform!);
        await sendSmsForTenant(
          stack.sms_platform!,
          apiKey,
          stack.sms_platform_meta,
          { email: prospectEmail, phone: prospectPhone },
          message.body,
          stack.sms_a2p_10dlc_status
        );
      });
      sent++;
    }

    return { sent };
  }
);
