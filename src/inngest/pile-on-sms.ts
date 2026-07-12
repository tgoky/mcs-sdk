import { inngest, pileOnSmsSequenceStart } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { sendSmsForTenant } from "@/lib/platforms/sms";

/**
 * Pile-On recovery gap 1 — durable SMS sequence sender for the
 * direct-send platforms (Twilio, GHL SMS). hubspot_sms doesn't go through
 * here — it's a single tag-and-done call in enrollment-service.ts, since
 * HubSpot's own automation owns the send timing for that platform.
 *
 * FIXED: Uses absolute timeline sorting anchored to the call time context.
 * Replaced relative step.sleep calculations with robust step.sleepUntil parameters
 * to handle out-of-order offset entries ([0, 1440, 60]) natively without collision.
 */
export const processPileOnSmsSequence = inngest.createFunction(
  { id: "process-pile-on-sms-sequence", triggers: [pileOnSmsSequenceStart] },
  async ({ event, step }) => {
    const { 
      engagementId, 
      bookingId, 
      prospectEmail, 
      prospectPhone, 
      prospectName,
      bookingCreatedAt,
      callTime 
    } = event.data;

    const tenant = await step.run("load-tenant", async () => {
      const [row] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      return row ?? null;
    });

    if (!tenant) {
      return { sent: 0, reason: "engagement not found" };
    }

    const stack = tenant.stack as EngagementStack | null;
    const smsAssetMap = tenant.pileOnSmsAssetMap as { messages: Array<{ id: string; offsetMinutes: number; body: string }> } | null;

    if (!stack?.sms_platform || (stack.sms_platform !== "twilio" && stack.sms_platform !== "ghl_sms")) {
      return { sent: 0, reason: "sms_platform is not a direct-send platform" };
    }
    if (!smsAssetMap?.messages?.length) {
      return { sent: 0, reason: "no SMS sequence content generated for this engagement" };
    }

    const parsedBookingCreated = new Date(bookingCreatedAt).getTime();
    const parsedCallTime = new Date(callTime).getTime();

    // Map the relative database offsets to true absolute timeline timestamps
    // Message 1 (sms_1): Immediate execution (0 minutes from booking creation)
    // Message 2 (sms_2): Midpoint of the wait window between booking creation and call start time
    // Message 3 (sms_3): Pinned exactly 60 minutes before the call starts
    const absoluteTimeline = smsAssetMap.messages.map((msg) => {
      let targetTimestamp = parsedBookingCreated;
      
      if (msg.id === "sms_2") {
        targetTimestamp = parsedBookingCreated + (parsedCallTime - parsedBookingCreated) / 2;
      } else if (msg.id === "sms_3" || msg.offsetMinutes === 60) {
        targetTimestamp = parsedCallTime - (60 * 60 * 1000);
      } else {
        targetTimestamp = parsedBookingCreated + (msg.offsetMinutes * 60 * 1000);
      }
      
      return {
        id: msg.id,
        body: msg.body,
        targetTimestamp
      };
    }).sort((a, b) => a.targetTimestamp - b.targetTimestamp); // Force non-colliding chronological sorting

    let sent = 0;

    for (const msg of absoluteTimeline) {
      const now = Date.now();
      
      // Skip messages whose scheduled delivery target falls behind our current runtime timeline
      if (msg.targetTimestamp <= now) continue;

      // Safety check: Never deliver pre-call notifications if the message target window falls within 10 minutes of the call starting
      if (msg.targetTimestamp >= parsedCallTime - (10 * 60 * 1000)) continue;

      // Guard: Check if the client stack has been updated or cancelled mid-sequence loop
      const stillActive = await step.run(`check-still-active-${msg.id}`, async () => {
        const [row] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
        const currentStack = row?.stack as EngagementStack | null;
        return currentStack?.sms_platform === "twilio" || currentStack?.sms_platform === "ghl_sms";
      });

      if (!stillActive) {
        return { sent, reason: "sms_platform reconfigured or cancelled mid-sequence — stopping" };
      }

      // Durably park the function run context until the next absolute milestone date arrives
      await step.sleepUntil(`delay-until-${msg.id}`, new Date(msg.targetTimestamp).toISOString());

      // Execute out-of-band message delivery step safely
      await step.run(`send-${msg.id}`, async () => {
        const apiKey = await resolveCredential(engagementId, stack.sms_platform!);
        await sendSmsForTenant(
          stack.sms_platform!,
          apiKey,
          stack.sms_platform_meta,
          { email: prospectEmail, phone: prospectPhone },
          msg.body,
          stack.sms_a2p_10dlc_status
        );
      });
      
      sent++;
    }

    return { sent };
  }
);