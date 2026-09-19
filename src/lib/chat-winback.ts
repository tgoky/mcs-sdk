// src/lib/chat-winback.ts
//
// "Win back this person" — manually enrolling one specific prospect,
// right now, rather than waiting for a real cancellation webhook to do
// it. Real external side effect: this genuinely adds the person to the
// account's configured recovery list/workflow on their actual email
// platform (Klaviyo, HubSpot, etc.) — not a simulation.
//
// Deliberately a separate, simpler path from enrollInWinBackSequence's
// production caller (pile-on/enrollment-service.ts), not a wrapper
// around the whole webhook handler — that handler also does things with
// no equivalent for a manual chat request: extracts a fresh reschedule
// link from the cancellation webhook's own payload (there is none here).
// SMTP accounts DO enroll from here now — same durable Inngest sequence
// (winBackEmailSmtpSequenceStart) the real cancellation-webhook path
// dispatches, behind a real skillRuns row (startRun/finishRun) rather
// than the null runId a plain enrollment row would otherwise carry.
//
// Meta field mapping (recovery_list_id, location_id, recovery_workflow_id,
// activecampaign_base_url) copied exactly from enrollment-service.ts's own
// real call, not re-derived — same source of truth, not a second one.

import { db } from "@/lib/db";
import { engagements, winBackEnrollments } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { enrollInWinBackSequence } from "@/lib/platforms/email";
import { startRun, finishRun, emptySummary } from "@/lib/run-log";
import { inngest, winBackEmailSmtpSequenceStart } from "@/lib/inngest";
import { missingWinBackMetaFor } from "@/lib/win-back-platform-readiness";
import { getBlockingReasons } from "@/lib/worker-blocking-conditions";
import type { EngagementStack } from "@/models/schema";
import crypto from "crypto";

type EnrollResult = { ok: true; enrollmentId: string } | { ok: false; error: string };
type PreviewResult = { ok: true; actions: string[] } | { ok: false; error: string };

/**
 * Read-only mirror of enrollProspectInWinBack's own validation chain —
 * runs the exact same checks (email platform connected, SMTP declined,
 * per-platform meta present, no existing active enrollment) without ever
 * calling enrollInWinBackSequence or writing a row. Unlike Pile-On's
 * preview/enroll pair (chat-pile-on.ts), there's no force override here:
 * an existing active enrollment for this exact prospect is a genuine
 * "they're already in this cadence" state, not a soft/probabilistic
 * duplicate signal — enrolling again would mean two live recovery
 * cadences messaging the same person, not a one-time re-check worth
 * overriding.
 */
export async function previewManualWinBackEnrollment(opts: {
  engagementId: string;
  workspaceId: string;
  prospectEmail: string;
}): Promise<PreviewResult> {
  const [engagement] = await db
    .select({ stack: engagements.stack, winBackSequenceAssetMap: engagements.winBackSequenceAssetMap })
    .from(engagements)
    .where(and(eq(engagements.engagementId, opts.engagementId), eq(engagements.workspaceId, opts.workspaceId)))
    .limit(1);
  if (!engagement) return { ok: false, error: "Client not found." };

  const stack = (engagement.stack as Partial<EngagementStack> | null) ?? {};
  if (!stack.email_platform || !stack.email_platform_credentials_ref) {
    return { ok: false, error: "No email platform connected for this client yet — connect one before trying a win-back." };
  }

  if (stack.email_platform === "smtp") {
    // Direct-send has no ESP-side list/workflow to enroll into — the check
    // that matters here is real generated content to actually send, same
    // shape missingWinBackMetaFor checks for the other 4 platforms' meta fields.
    if (!engagement.winBackSequenceAssetMap?.emails?.length) {
      return { ok: false, error: "No win-back email sequence content has been generated for this engagement yet." };
    }
  } else {
    const metaError = missingWinBackMetaFor(stack.email_platform, stack);
    if (metaError) return { ok: false, error: metaError };
  }

  const [existingActive] = await db
    .select({ id: winBackEnrollments.id })
    .from(winBackEnrollments)
    .where(
      and(
        eq(winBackEnrollments.engagementId, opts.engagementId),
        eq(winBackEnrollments.prospectEmail, opts.prospectEmail),
        eq(winBackEnrollments.status, "active")
      )
    )
    .limit(1);
  if (existingActive) return { ok: false, error: `${opts.prospectEmail} is already in an active recovery cadence — no need to enroll again.` };

  return { ok: true, actions: [`Would enroll ${opts.prospectEmail} in ${stack.email_platform}'s win-back recovery cadence.`] };
}

export async function enrollProspectInWinBack(opts: {
  engagementId: string;
  workspaceId: string;
  prospectEmail: string;
  prospectName?: string;
}): Promise<EnrollResult> {
  const [engagement] = await db
    .select({ stack: engagements.stack, winBackSequenceAssetMap: engagements.winBackSequenceAssetMap })
    .from(engagements)
    .where(and(eq(engagements.engagementId, opts.engagementId), eq(engagements.workspaceId, opts.workspaceId)))
    .limit(1);
  if (!engagement) return { ok: false, error: "Client not found." };

  const stack = (engagement.stack as Partial<EngagementStack> | null) ?? {};
  if (!stack.email_platform || !stack.email_platform_credentials_ref) {
    return { ok: false, error: "No email platform connected for this client yet — connect one before trying a win-back." };
  }

  const isSmtp = stack.email_platform === "smtp";
  if (isSmtp) {
    if (!engagement.winBackSequenceAssetMap?.emails?.length) {
      return { ok: false, error: "No win-back email sequence content has been generated for this engagement yet." };
    }
  } else {
    const metaError = missingWinBackMetaFor(stack.email_platform, stack);
    if (metaError) return { ok: false, error: metaError };
  }

  const [existingActive] = await db
    .select({ id: winBackEnrollments.id })
    .from(winBackEnrollments)
    .where(
      and(
        eq(winBackEnrollments.engagementId, opts.engagementId),
        eq(winBackEnrollments.prospectEmail, opts.prospectEmail),
        eq(winBackEnrollments.status, "active")
      )
    )
    .limit(1);
  if (existingActive) return { ok: false, error: `${opts.prospectEmail} is already in an active recovery cadence.` };

  // Phase 6 — bounce/complaint-rate auto-pause (esp-delivery-monitor.ts).
  // Same gate the real cancellation-webhook path checks
  // (enrollment-service.ts) — a manual enrollment shouldn't be able to
  // route around a pause that exists specifically to stop new sends.
  const blockingReasons = await getBlockingReasons(opts.engagementId);
  const pauseReason = blockingReasons.find((r) => r.conditionId === "win-back-bounce-complaint-pause");
  if (pauseReason) return { ok: false, error: pauseReason.reason };

  const prospectName = opts.prospectName?.trim() || opts.prospectEmail;
  const enrollmentId = crypto.randomUUID();

  if (isSmtp) {
    // No ESP-side list/workflow to enroll into — this app owns the send
    // schedule itself via a durable Inngest sequence, same as the real
    // cancellation-webhook path (enrollment-service.ts's SMTP block).
    // That path threads a real skillRuns row through the dispatch event
    // (sequenceMessageLog.runId, the run history a viewer sees at
    // /dashboard/runs/[id]) rather than firing the sequence off a null
    // id — mirrored here with startRun/finishRun instead of skipping it,
    // which is what left this platform unable to enroll manually at all.
    const runId = crypto.randomUUID();
    await startRun({
      id: runId,
      engagementId: opts.engagementId,
      skillName: "win-back",
      phase: "manual_enrollment",
      label: `Win-Back manually enrolled for ${prospectName} (direct-send)`,
    });

    await db.insert(winBackEnrollments).values({
      id: enrollmentId,
      engagementId: opts.engagementId,
      prospectEmail: opts.prospectEmail,
      prospectName: opts.prospectName?.trim() || null,
      runId,
      sourceBookingId: null,
      recoveryWindowDays: stack.recovery_window_days ?? 30,
      status: "active",
    });

    await inngest.send(
      winBackEmailSmtpSequenceStart.create({
        engagementId: opts.engagementId,
        runId,
        enrollmentId,
        prospectEmail: opts.prospectEmail,
        prospectName,
      })
    );

    const summary = emptySummary();
    summary.whatWorked.push(`Started the direct-send SMTP win-back email sequence for ${opts.prospectEmail}.`);
    await finishRun(runId, { summary });

    return { ok: true, enrollmentId };
  }

  const apiKey = await resolveCredential(opts.engagementId, stack.email_platform);

  await enrollInWinBackSequence(stack.email_platform, apiKey, opts.prospectEmail, prospectName, {
    recovery_list_id: stack.recovery_list_id,
    location_id: stack.booking_platform_meta?.location_id,
    recovery_workflow_id: stack.recovery_workflow_id,
    activecampaign_base_url: stack.activecampaign_base_url,
  });

  await db.insert(winBackEnrollments).values({
    id: enrollmentId,
    engagementId: opts.engagementId,
    prospectEmail: opts.prospectEmail,
    prospectName: opts.prospectName?.trim() || null,
    runId: null,
    sourceBookingId: null,
    recoveryWindowDays: stack.recovery_window_days ?? 30,
    status: "active",
  });

  return { ok: true, enrollmentId };
}
