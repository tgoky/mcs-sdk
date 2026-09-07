// src/lib/chat-pile-on.ts
//
// "Enroll this person in Pile-On" — manually running the pre-call
// follow-up enrollment for one specific prospect, right now, rather than
// waiting for a real booking webhook to do it. Same shape and the same
// discipline as chat-winback.ts's enrollProspectInWinBack: a deliberately
// separate, simpler path from the production caller
// (pile-on/enrollment-service.ts's handleInboundBookingEvent), not a
// wrapper around the whole webhook handler.
//
// Two things that handler does are deliberately NOT replicated here, same
// as chat-winback.ts declines SMTP outright rather than faking a lesser
// version of it:
//
//   - SMS enrollment. Pile-On's SMS sequence is timed relative to a real
//     call time (see pileOnSmsSequenceStart's callTime field) — a manual
//     chat enrollment has no real booking behind it, so there's no honest
//     callTime to schedule against. Guessing one risks texting a prospect
//     about a call that doesn't exist at the stated time. Not a "not built
//     yet" gap — replicating it here would be actively wrong.
//   - Ad-data cohort sync. Touches real ad-spend attribution on the
//     buyer's ad platform and is gated behind approval-gate.ts keyed to a
//     real booking payload this path doesn't have. Its own dedicated pass,
//     not a shortcut bolted onto this one.
//
// What IS replicated, because leaving it out would be a correctness bug
// rather than a scope choice: the win-back-exit handling. If this prospect
// is currently in an active win-back cadence, enrolling them in Pile-On
// means they're back — so that cadence is exited the same way a real
// rebooking webhook would exit it. Skip that and a manually-enrolled
// rebooker keeps getting recovery messages alongside their new pre-call
// ones.
//
// Field-mapping (target_list_id, location_id, target_workflow_id,
// activecampaign_base_url / recovery_workflow_id) copied exactly from
// enrollment-service.ts's own real calls, not re-derived — same source of
// truth, not a second one.
//
// previewManualPileOnEnrollment is read-only — no network calls, no
// writes — and describes exactly what enrollProspectInPileOn would do,
// not a superset of it. A preview that promises more than the real action
// performs is worse than no preview at all.

import { db } from "@/lib/db";
import { engagements, winBackEnrollments, bookingRoster } from "@/models/schema";
import { and, eq, desc } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { enrollInPreCallSequence, exitWinBackSequence } from "@/lib/platforms/email";
import type { EngagementStack } from "@/models/schema";

type PreviewResult = { ok: true; actions: string[]; warnings: string[] } | { ok: false; error: string };
type EnrollResult = { ok: true; rebookedFromWinBack: boolean } | { ok: false; error: string };

const SUPPORTED_PILE_ON_PLATFORMS = ["klaviyo", "hubspot", "activecampaign", "ghl", "mailchimp", "convertkit"];

async function loadEngagement(engagementId: string, workspaceId: string) {
  const [row] = await db
    .select({ engagementId: engagements.engagementId, stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/** Mirrors — doesn't re-derive — exactly the per-platform meta checks
 * enrollInPreCallSequence (platforms/email.ts) itself throws on. Preview
 * has to know this ahead of a real call since it never makes one; kept as
 * a direct mirror (same fields, same platforms) rather than a shared
 * helper so a change to the real function's requirements is a visible
 * diff here too, not a silent drift. */
function missingPileOnMetaFor(platform: string, stack: Partial<EngagementStack>): string | null {
  if (platform === "klaviyo" && !stack.target_list_id) return "target_list_id isn't configured for Klaviyo yet — set that up on the client's page first.";
  if (platform === "activecampaign" && (!stack.target_list_id || !stack.activecampaign_base_url)) {
    return "ActiveCampaign pile-on needs target_list_id and activecampaign_base_url configured on the client's page first.";
  }
  if (platform === "ghl" && (!stack.booking_platform_meta?.location_id || !stack.target_workflow_id)) {
    return "GoHighLevel pile-on needs a location id and target_workflow_id configured on the client's page first.";
  }
  if (platform === "mailchimp" && !stack.target_list_id) return "target_list_id (audience ID) isn't configured for Mailchimp yet — set that up on the client's page first.";
  if (platform === "convertkit" && !stack.target_list_id) return "target_list_id (form ID) isn't configured for ConvertKit yet — set that up on the client's page first.";
  return null;
}

async function findExistingBooking(engagementId: string, prospectEmail: string) {
  const [row] = await db
    .select({ id: bookingRoster.id, status: bookingRoster.status, callTime: bookingRoster.callTime })
    .from(bookingRoster)
    .where(and(eq(bookingRoster.engagementId, engagementId), eq(bookingRoster.prospectEmail, prospectEmail)))
    .orderBy(desc(bookingRoster.createdAt))
    .limit(1);
  return row ?? null;
}

async function findActiveWinBack(engagementId: string, prospectEmail: string) {
  const [row] = await db
    .select({ id: winBackEnrollments.id })
    .from(winBackEnrollments)
    .where(and(eq(winBackEnrollments.engagementId, engagementId), eq(winBackEnrollments.prospectEmail, prospectEmail), eq(winBackEnrollments.status, "active")))
    .limit(1);
  return row ?? null;
}

export async function previewManualPileOnEnrollment(opts: {
  engagementId: string;
  workspaceId: string;
  prospectEmail: string;
}): Promise<PreviewResult> {
  const engagement = await loadEngagement(opts.engagementId, opts.workspaceId);
  if (!engagement) return { ok: false, error: "Client not found." };

  const stack = (engagement.stack as Partial<EngagementStack> | null) ?? {};
  if (!stack.email_platform || !stack.email_platform_credentials_ref) {
    return { ok: false, error: "No email platform connected for this client yet — connect one before trying a pile-on enrollment." };
  }
  if (!SUPPORTED_PILE_ON_PLATFORMS.includes(stack.email_platform)) {
    return {
      ok: false,
      error:
        stack.email_platform === "smtp"
          ? "SMTP has no Pile-On pre-call content to send yet — this direct-send platform only supports the Win-Back cadence, not Pile-On."
          : `${stack.email_platform} isn't a supported Pile-On platform.`,
    };
  }

  const metaError = missingPileOnMetaFor(stack.email_platform, stack);
  if (metaError) return { ok: false, error: metaError };

  const actions: string[] = [`Would enroll ${opts.prospectEmail} in ${stack.email_platform}'s pre-call follow-up sequence.`];
  const warnings: string[] = [];

  const existingBooking = await findExistingBooking(opts.engagementId, opts.prospectEmail);
  if (existingBooking) {
    warnings.push(
      `A booking already exists on file for this email (status: ${existingBooking.status}, call time ${existingBooking.callTime.toISOString()}) — enrolling again may be a duplicate. Real enrollment will require force to proceed.`
    );
  }

  const activeWinBack = await findActiveWinBack(opts.engagementId, opts.prospectEmail);
  if (activeWinBack) {
    actions.push("Would also exit them from their currently active win-back recovery cadence (they're coming back).");
  }

  actions.push("Would NOT enroll in SMS or sync an ad-data cohort — those aren't replicated for manual enrollment (see this file's own header for why).");

  return { ok: true, actions, warnings };
}

export async function enrollProspectInPileOn(opts: {
  engagementId: string;
  workspaceId: string;
  prospectEmail: string;
  prospectName?: string;
  force?: boolean;
}): Promise<EnrollResult> {
  const engagement = await loadEngagement(opts.engagementId, opts.workspaceId);
  if (!engagement) return { ok: false, error: "Client not found." };

  const stack = (engagement.stack as Partial<EngagementStack> | null) ?? {};
  if (!stack.email_platform || !stack.email_platform_credentials_ref) {
    return { ok: false, error: "No email platform connected for this client yet — connect one before trying a pile-on enrollment." };
  }

  const existingBooking = await findExistingBooking(opts.engagementId, opts.prospectEmail);
  if (existingBooking && !opts.force) {
    return {
      ok: false,
      error: `${opts.prospectEmail} already has a booking on file (status: ${existingBooking.status}) — this may be a duplicate enrollment. Confirm again to proceed anyway.`,
    };
  }

  const prospectName = opts.prospectName?.trim() || opts.prospectEmail;

  try {
    const apiKey = await resolveCredential(opts.engagementId, stack.email_platform);
    await enrollInPreCallSequence(stack.email_platform, apiKey, opts.prospectEmail, prospectName, {
      target_list_id: stack.target_list_id,
      location_id: stack.booking_platform_meta?.location_id,
      target_workflow_id: stack.target_workflow_id,
      activecampaign_base_url: stack.activecampaign_base_url,
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Win-back-exit handling — see this file's header for why this is
  // replicated (a correctness fix, not a feature) while SMS/ad-cohort
  // aren't. Never lets a failure here undo the enrollment that already
  // succeeded above, matching handleInboundBookingEvent's own
  // "never let this block pile-on's success" precedent.
  // Status "rebooked" (not "manual_override" — that's a different,
  // already-established status meaning an operator stopped the cadence
  // WITHOUT a rebooking, see /api/win-back/enrollments/[id]/stop/route.ts
  // and win-back-view.tsx's distinct rendering for it). This prospect
  // genuinely is coming back via Pile-On, so it's the same real-rebooking
  // outcome the webhook path records — exitWinBackSequence's default
  // reason ("rebooked") is left as-is to match, same as
  // enrollment-service.ts's own real call does.
  let rebookedFromWinBack = false;
  const activeWinBack = await findActiveWinBack(opts.engagementId, opts.prospectEmail);
  if (activeWinBack) {
    try {
      await exitWinBackSequence(stack.email_platform, await resolveCredential(opts.engagementId, stack.email_platform), opts.prospectEmail, {
        location_id: stack.booking_platform_meta?.location_id,
        recovery_workflow_id: stack.recovery_workflow_id,
        recovery_automation_id: stack.recovery_automation_id,
        activecampaign_base_url: stack.activecampaign_base_url,
      });
      await db
        .update(winBackEnrollments)
        .set({ status: "rebooked", exitReason: "rebooked", exitedAt: new Date() })
        .where(eq(winBackEnrollments.id, activeWinBack.id));
      rebookedFromWinBack = true;
    } catch (e: unknown) {
      console.error("[chat-pile-on] win-back exit signal failed (non-fatal):", e instanceof Error ? e.message : String(e));
    }
  }

  return { ok: true, rebookedFromWinBack };
}
