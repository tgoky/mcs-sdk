import { db } from "@/lib/db";
import { winBackEnrollments, engagements } from "@/models/schema";
import { and, eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { resolveCredential } from "@/lib/credentials";
import { enrollInPreCallSequence, enrollInWinBackSequence, exitWinBackSequence } from "@/lib/platforms/email";
import { logStep, finishRun, type RunSummary } from "@/lib/run-log";
import { runHybridPersonalization } from "./hybrid-personalizer";
import { enrollSmsSequenceForTenant } from "@/lib/platforms/sms";
import { inngest, pileOnSmsSequenceStart } from "@/lib/inngest";
import { addProspectToAdDataCohort, removeProspectFromAdDataCohort } from "./cohort-sync";

/**
 * Single source of truth for classifying a booking-platform webhook payload
 * as a new booking (pile-on) or a cancellation/no-show (win-back).
 *
 * Exporting this classifier lets the route call it BEFORE startRun so the correct
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

  const prospectPhone: string | undefined =
    payload.phone ??
    payload.prospect_phone ??
    payload.data?.attributes?.phone ??
    payload.payload?.text_reminder_number ??
    payload.responses?.attendeePhoneNumber ??
    payload.contact?.phone ??
    payload.customer?.phone ??
    undefined;

  // Best-effort booking identifier for send-log/SMS-sequence correlation.
  // Falls back to a fresh UUID rather than throwing — losing the ability
  // to correlate one booking's SMS sends in the log is much less bad than
  // failing the whole enrollment over a missing ID field.
  const bookingId: string =
    payload._bookingId ??
    payload.payload?.uri?.split("/").pop() ??
    payload.uid ??
    payload.id ??
    crypto.randomUUID();

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

    // ── SMS enrollment (Pile-On recovery gap 1) ──────────────────────────
    if (stack.sms_platform && stack.sms_platform !== "none") {
      await logStep(runId, { phase: "sms_enrollment", status: "running" });
      try {
        if (stack.sms_platform === "hubspot_sms") {
          const smsApiKey = await resolveCredential(tenant.engagementId, stack.sms_platform);
          await enrollSmsSequenceForTenant(stack.sms_platform, smsApiKey, stack.sms_platform_meta, prospectEmail);
          summary.whatWorked.push(`Tagged ${prospectEmail} for HubSpot's SMS automation to pick up.`);
          await logStep(runId, { phase: "sms_enrollment", status: "success", detail: "HubSpot SMS tag set" });
        } else if (stack.sms_platform === "twilio" || stack.sms_platform === "ghl_sms") {
          if (!prospectPhone) {
            summary.openItems.push(`SMS sequence configured (${stack.sms_platform}) but no phone number was captured for ${prospectEmail} — SMS skipped for this booking.`);
            await logStep(runId, { phase: "sms_enrollment", status: "skipped", detail: "No phone number on payload" });
          } else {
            // FIXED: Dynamically extract and normalize absolute platform milestones to prevent background engine overlap bugs
            const bookingCreatedAt = payload.payload?.created_at ?? payload.createdAt ?? new Date().toISOString();
            const callTime = payload.call_time ?? payload.payload?.start_time ?? payload.payload?.scheduled_time ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            await inngest.send(
              pileOnSmsSequenceStart.create({
                engagementId: tenant.engagementId,
                bookingId,
                prospectEmail,
                prospectPhone,
                prospectName,
                bookingCreatedAt,
                callTime,
              })
            );
            summary.whatWorked.push(`Started ${stack.sms_platform} SMS sequence for ${prospectPhone}.`);
            await logStep(runId, { phase: "sms_enrollment", status: "success", detail: `Durable SMS sequence dispatched for ${prospectPhone}` });
          }
        }
      } catch (e: any) {
        summary.openItems.push(`SMS enrollment failed: ${e.message}`);
        await logStep(runId, { phase: "sms_enrollment", status: "failed", detail: e.message });
      }
    }

    // ── Ad-data cohort add (Pile-On recovery gap 2) ──────────────────────
    if (stack.ad_data_platform && stack.ad_data_platform !== "none") {
      try {
        await addProspectToAdDataCohort(tenant.engagementId, stack, prospectEmail);
        summary.whatWorked.push(`Added ${prospectEmail} to the ${stack.ad_data_platform} ad-data cohort.`);
        await logStep(runId, { phase: "ad_data_cohort", status: "success", detail: `Added to cohort on ${stack.ad_data_platform}` });
      } catch (e: any) {
        summary.openItems.push(`Ad-data cohort add failed: ${e.message}`);
        await logStep(runId, { phase: "ad_data_cohort", status: "failed", detail: e.message });
      }
    }

    // Hybrid mode: generate a personalized intro paragraph via Claude,
    // with real budget enforcement and a pile_on_send_log outcome row
    // (Pile-On recovery gap 3). The templated Email 1 already fired above
    // via enrollInPreCallSequence — this only ever adds on top, so a
    // "fallback" outcome here means no personalized intro, never a missed
    // email.
    if (tenant.offerDetails?.hybrid_mode_enabled) {
      await logStep(runId, { phase: "hybrid_synthesis", status: "running" });
      summary.whatWasAttempted.push("Generate a hybrid-mode personalized intro paragraph.");

      const result = await runHybridPersonalization(
        tenant.engagementId,
        bookingId,
        prospectEmail,
        prospectName,
        stack.email_platform,
        emailApiKey,
        { location_id: stack.booking_platform_meta?.location_id },
        tenant.brandVoiceProfile,
        tenant.offerDetails,
        runId
      );

      if (result.sentVia === "hybrid") {
        summary.whatWorked.push(`Delivered personalized intro to ${prospectEmail}'s ${stack.email_platform} profile (${result.latencyMs}ms).`);
        await logStep(runId, { phase: "hybrid_synthesis", status: "success", detail: `Delivered in ${result.latencyMs}ms` });
      } else {
        summary.openItems.push(`Hybrid personalization fell back to the templated intro: ${result.error} (${result.latencyMs}ms)`);
        await logStep(runId, { phase: "hybrid_synthesis", status: "failed", detail: `Fallback after ${result.latencyMs}ms: ${result.error}` });
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

    // ── Ad-data cohort remove (Pile-On recovery gap 2) ────────────────────
    if (stack.ad_data_platform && stack.ad_data_platform !== "none") {
      try {
        await removeProspectFromAdDataCohort(tenant.engagementId, stack, prospectEmail);
        summary.whatWorked.push(`Removed ${prospectEmail} from the ${stack.ad_data_platform} ad-data cohort.`);
        await logStep(runId, { phase: "ad_data_cohort", status: "success", detail: `Removed from cohort on ${stack.ad_data_platform}` });
      } catch (e: any) {
        summary.openItems.push(`Ad-data cohort removal failed: ${e.message}`);
        await logStep(runId, { phase: "ad_data_cohort", status: "failed", detail: e.message });
      }
    }
  } else {
    summary.openItems.push(`Unrecognized webhook event — no sequence enrollment performed.`);
  }

  await finishRun(runId, { summary });
}