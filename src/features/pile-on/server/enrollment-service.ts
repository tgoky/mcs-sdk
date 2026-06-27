import { db } from "@/lib/db";
import { skillRuns } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { enrollInPreCallSequence, enrollInWinBackSequence } from "@/lib/platforms/email";
import { callClaude, MODEL } from "@/lib/llm";

/**
 * Routes inbound booking webhook events to pile-on (booking.created)
 * or win-back (booking.cancelled / booking.no-showed).
 */
export async function handleInboundBookingEvent(
  payload: any,
  tenant: any,
  runId: string
): Promise<void> {
  const eventType: string =
    payload.event ?? payload.trigger ?? payload.payload?.event ?? "booking.created";

  // Normalize email/name across all platform webhook shapes
  const prospectEmail: string =
    payload.data?.attributes?.email ??
    payload.email ??
    payload.prospect_email ??
    payload.payload?.email ??
    "";

  const prospectName: string =
    payload.data?.attributes?.first_name ??
    payload.name ??
    payload.prospect_name ??
    payload.payload?.name ??
    "Prospect";

  if (!prospectEmail) {
    throw new Error(
      "Webhook payload missing email field. Check booking platform webhook format."
    );
  }

  const stack = tenant.stack as any;
  if (!stack?.email_platform) {
    throw new Error(
      "Engagement has no email_platform configured. Run Pin-Down setup first."
    );
  }

  const emailApiKey = await resolveCredential(tenant.engagementId, stack.email_platform);

  // ── booking.created → Pile-On ─────────────────────────────────────────
  if (eventType === "booking.created" || eventType === "invitee.created" ||
      eventType === "BOOKING_CREATED" || eventType === "AppointmentCreate") {

    await db
      .update(skillRuns)
      .set({ phase: "pile_on_enrollment" })
      .where(eq(skillRuns.id, runId));

    await enrollInPreCallSequence(
      stack.email_platform,
      emailApiKey,
      prospectEmail,
      prospectName,
      {
        target_list_id: stack.target_list_id,
        location_id: stack.booking_platform_meta?.location_id,
        target_workflow_id: stack.booking_platform_meta?.target_workflow_id,
        activecampaign_base_url: stack.activecampaign_base_url,
      }
    );

    // Hybrid mode: generate a personalized intro paragraph via Claude
    if (tenant.offerDetails?.hybrid_mode_enabled) {
      await db
        .update(skillRuns)
        .set({ phase: "hybrid_synthesis" })
        .where(eq(skillRuns.id, runId));

      const result = await callClaude({
        model: MODEL.SYNTHESIS,
        system: `You are the email rewriting engine for Pile-On.
Voice parameters: ${JSON.stringify(tenant.brandVoiceProfile ?? {})}
Offer context: ${JSON.stringify(tenant.offerDetails ?? {})}
Write a personalized booking confirmation intro paragraph. Under 70 words. No generic greetings. Reference the specific value this call will deliver.`,
        userMessage: `Prospect: ${prospectName} (${prospectEmail})`,
        maxTokens: 200,
        runId,
      });

      // The generated text is available as result.text
      // Delivery of this text into the email platform's transactional send
      // is platform-specific and configured per buyer — log it for now
      console.log(
        `[pile-on] Hybrid personalization ready for ${prospectEmail}:`,
        result.text.substring(0, 100) + "..."
      );
    }
  }

  // ── booking.cancelled / no-showed → Win-Back ─────────────────────────
  else if (
    eventType === "booking.cancelled" ||
    eventType === "booking.no-showed" ||
    eventType === "invitee.canceled" ||
    eventType === "BOOKING_CANCELLED" ||
    eventType === "AppointmentDelete"
  ) {
    await db
      .update(skillRuns)
      .set({ skillName: "win-back", phase: "recovery_enrollment" })
      .where(eq(skillRuns.id, runId));

    await enrollInWinBackSequence(
      stack.email_platform,
      emailApiKey,
      prospectEmail,
      prospectName,
      {
        recovery_list_id: stack.recovery_list_id,
        location_id: stack.booking_platform_meta?.location_id,
        recovery_workflow_id: stack.booking_platform_meta?.recovery_workflow_id,
        activecampaign_base_url: stack.activecampaign_base_url,
      }
    );
  }

  await db
    .update(skillRuns)
    .set({ status: "success", completedAt: new Date() })
    .where(eq(skillRuns.id, runId));
}