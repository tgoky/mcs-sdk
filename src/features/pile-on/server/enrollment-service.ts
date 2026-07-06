import { db } from "@/lib/db";
import { winBackEnrollments, engagements } from "@/models/schema";
import { and, eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { resolveCredential } from "@/lib/credentials";
import { enrollInPreCallSequence, enrollInWinBackSequence, exitWinBackSequence, deliverPersonalizedIntro } from "@/lib/platforms/email";
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

    // Rebooked-exit condition: this may be a prospect who previously
    // cancelled and is now coming back through win-back's recovery
    // cadence. We always fire the exit signal regardless — it's a no-op
    // for anyone who was never win-back-enrolled, and it's the one piece
    // of "stop messaging someone who already rebooked" that's on us,
    // since the cadence itself runs as the buyer's native automation, not
    // ours. winBackEnrollments now gives us a real lookup for whether this
    // person actually was enrolled, used below to update status/counts —
    // but the exit signal itself still fires unconditionally rather than
    // gating on that lookup, since a signal firing for someone who was
    // never enrolled is a harmless no-op on the ESP side either way.
    try {
      await exitWinBackSequence(stack.email_platform, emailApiKey, prospectEmail, {
        location_id: stack.booking_platform_meta?.location_id,
        recovery_workflow_id: stack.booking_platform_meta?.recovery_workflow_id,
        recovery_automation_id: stack.booking_platform_meta?.recovery_automation_id,
        activecampaign_base_url: stack.activecampaign_base_url,
      });
      await logStep(runId, {
        phase: "win_back_exit_signal",
        status: "success",
        detail: `Sent rebooked exit signal for ${prospectEmail} (no-op if they were never in win-back).`,
      });

      const rebookedRows = await db
        .update(winBackEnrollments)
        .set({ status: "rebooked" })
        .where(
          and(
            eq(winBackEnrollments.engagementId, tenant.engagementId),
            eq(winBackEnrollments.prospectEmail, prospectEmail),
            eq(winBackEnrollments.status, "active")
          )
        )
        .returning({ id: winBackEnrollments.id });

      if (rebookedRows.length > 0) {
        // Atomic jsonb increment rather than read-modify-write — two
        // prospects rebooking for the same engagement at the same moment
        // must not lose one of the two increments to a race.
        await db
          .update(engagements)
          .set({
            winBackCounts: sql`jsonb_set(
              coalesce(${engagements.winBackCounts}, '{"recovery_count":0,"lost_count":0}'::jsonb),
              '{recovery_count}',
              (coalesce((${engagements.winBackCounts}->>'recovery_count')::int, 0) + 1)::text::jsonb
            )`,
          })
          .where(eq(engagements.engagementId, tenant.engagementId));
      }
    } catch (e: any) {
      // Never let this block pile-on's success — worst case the buyer's
      // recovery flow sends one extra touch to someone who already came
      // back, not a lost booking.
      summary.openItems.push(
        `Could not send win-back exit signal for ${prospectEmail}: ${e.message}`
      );
      await logStep(runId, { phase: "win_back_exit_signal", status: "failed", detail: e.message });
    }

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

      summary.whatWasAttempted.push("Generate a hybrid-mode personalized intro paragraph.");

      try {
        await deliverPersonalizedIntro(
          stack.email_platform,
          emailApiKey,
          prospectEmail,
          result.text,
          { location_id: stack.booking_platform_meta?.location_id }
        );
        summary.whatWorked.push(`Delivered personalized intro to ${prospectEmail}'s ${stack.email_platform} profile.`);
        await logStep(runId, {
          phase: "hybrid_synthesis",
          status: "success",
          detail: `Delivered: "${result.text.slice(0, 100)}${result.text.length > 100 ? "…" : ""}"`,
        });
      } catch (deliveryErr: any) {
        // Still generated successfully — only the delivery leg failed, so
        // this is an open item, not a hard failure for the whole enrollment.
        summary.openItems.push(
          `Personalized intro was generated but couldn't be delivered: ${deliveryErr.message}`
        );
        await logStep(runId, {
          phase: "hybrid_synthesis",
          status: "failed",
          detail: `Generated but not delivered: ${deliveryErr.message}`,
        });
      }
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

    await db.insert(winBackEnrollments).values({
      id: crypto.randomUUID(),
      engagementId: tenant.engagementId,
      prospectEmail,
      prospectName,
      recoveryWindowDays: stack.recovery_window_days ?? 30,
      status: "active",
    });
  } else {
    summary.openItems.push(`Unrecognized webhook event — no sequence enrollment performed.`);
  }

  await finishRun(runId, { summary });
}