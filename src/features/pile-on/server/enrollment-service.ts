import { resolveCredential } from "@/lib/credentials";
import { enrollInPreCallSequence, enrollInWinBackSequence } from "@/lib/platforms/email";
import { callClaude, MODEL } from "@/lib/llm";
import { logStep, finishRun, type RunSummary } from "@/lib/run-log";

/**
 * Single source of truth for classifying a booking-platform webhook payload
 * as a new booking (pile-on) or a cancellation/no-show (win-back).
 *
 * Previously the webhook route hardcoded skillName: "pile-on" at startRun
 * time, before it had even looked at the payload — then handleInboundBookingEvent
 * "corrected" it mid-run via a rename side-channel on logStep whenever the
 * event actually turned out to be a cancellation. That meant two independent
 * lists of event-type strings (one in the route's label extraction, one
 * here) could silently drift apart, and for a few milliseconds every
 * win-back run was mislabeled as pile-on in the dashboard. Exporting this
 * classifier lets the route call it BEFORE startRun so the correct
 * skillName is set from the very first row, with one definition of "what
 * counts as a cancellation" shared by both call sites.
 */
export function classifyBookingEvent(payload: any): "created" | "cancelled" | "unknown" {
  const eventType: string =
    payload.event ?? payload.trigger ?? payload.payload?.event ?? "booking.created";

  if (
    eventType === "booking.created" ||
    eventType === "invitee.created" ||
    eventType === "BOOKING_CREATED" ||
    eventType === "AppointmentCreate"
  ) {
    return "created";
  }

  if (
    eventType === "booking.cancelled" ||
    eventType === "booking.no-showed" ||
    eventType === "invitee.canceled" ||
    eventType === "BOOKING_CANCELLED" ||
    eventType === "AppointmentDelete"
  ) {
    return "cancelled";
  }

  return "unknown";
}

/**
 * Routes inbound booking webhook events to pile-on (booking.created)
 * or win-back (booking.cancelled / booking.no-showed). The caller (the
 * webhook route) is expected to have already called classifyBookingEvent()
 * to pick the correct skillName before startRun — this function trusts
 * that classification rather than re-deriving it, so the two can't diverge.
 */
export async function handleInboundBookingEvent(
  payload: any,
  tenant: any,
  runId: string,
  eventKind: "created" | "cancelled" | "unknown"
): Promise<void> {
  const summary: RunSummary = {
    whatWasAttempted: [],
    whatWorked: [],
    whatFailed: [],
    openItems: [],
    decisionsMade: [],
  };

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
  if (eventKind === "created") {

    await logStep(runId, {
      phase: "pile_on_enrollment",
      status: "running",
      label: `${prospectName} <${prospectEmail}>`,
    });

    summary.whatWasAttempted.push(`Enroll ${prospectName} (${prospectEmail}) in the pre-call follow-up sequence on ${stack.email_platform}.`);

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

    summary.whatWorked.push(`Enrolled in ${stack.email_platform} pre-call sequence.`);
    await logStep(runId, { phase: "pile_on_enrollment", status: "success", detail: `Enrolled ${prospectName} in pre-call sequence` });

    // Hybrid mode: generate a personalized intro paragraph via Claude
    if (tenant.offerDetails?.hybrid_mode_enabled) {
      await logStep(runId, { phase: "hybrid_synthesis", status: "running" });

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

      // FIXED: the generated text used to be console.log'd and discarded —
      // it never actually shipped anywhere. This is flagged as an open item
      // rather than silently claiming success, since delivery still needs a
      // platform-specific transactional-send wire-up per buyer.
      summary.whatWasAttempted.push("Generate a hybrid-mode personalized intro paragraph.");
      summary.openItems.push(
        "Hybrid personalization text was generated but has no delivery path configured for this platform yet — it is not currently being sent."
      );
      await logStep(runId, {
        phase: "hybrid_synthesis",
        status: "success",
        detail: `Generated (not yet delivered): "${result.text.slice(0, 100)}${result.text.length > 100 ? "…" : ""}"`,
      });
    }
  }

  // ── booking.cancelled / no-showed → Win-Back ─────────────────────────
  else if (eventKind === "cancelled") {
    await logStep(runId, {
      phase: "recovery_enrollment",
      status: "running",
      label: `${prospectName} <${prospectEmail}>`,
    });

    summary.whatWasAttempted.push(`Enroll ${prospectName} (${prospectEmail}) in the win-back sequence on ${stack.email_platform}.`);

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

    summary.whatWorked.push(`Enrolled in ${stack.email_platform} win-back sequence.`);
    await logStep(runId, { phase: "recovery_enrollment", status: "success", detail: `Enrolled ${prospectName} in win-back sequence` });
  } else {
    summary.openItems.push(`Unrecognized webhook event — no sequence enrollment performed.`);
  }

  await finishRun(runId, { summary });
}