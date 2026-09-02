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
// link from the cancellation webhook's own payload (there is none here),
// and for SMTP accounts, kicks off a durable Inngest send sequence (not
// replicated here — see the SMTP branch below for exactly what that
// means for chat right now).
//
// Meta field mapping (recovery_list_id, location_id, recovery_workflow_id,
// activecampaign_base_url) copied exactly from enrollment-service.ts's own
// real call, not re-derived — same source of truth, not a second one.

import { db } from "@/lib/db";
import { engagements, winBackEnrollments } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { enrollInWinBackSequence } from "@/lib/platforms/email";
import type { EngagementStack } from "@/models/schema";
import crypto from "crypto";

type EnrollResult = { ok: true; enrollmentId: string } | { ok: false; error: string };

function missingMetaFor(platform: string, stack: Partial<EngagementStack>): string | null {
  if (platform === "klaviyo" && !stack.recovery_list_id) return "recovery_list_id isn't configured for Klaviyo yet — set that up on the client's page first.";
  if (platform === "activecampaign" && (!stack.recovery_list_id || !stack.activecampaign_base_url)) {
    return "ActiveCampaign win-back needs recovery_list_id and activecampaign_base_url configured on the client's page first.";
  }
  if (platform === "ghl" && (!stack.booking_platform_meta?.location_id || !stack.recovery_workflow_id)) {
    return "GoHighLevel win-back needs a location id and recovery_workflow_id configured on the client's page first.";
  }
  return null;
}

export async function enrollProspectInWinBack(opts: {
  engagementId: string;
  workspaceId: string;
  prospectEmail: string;
  prospectName?: string;
}): Promise<EnrollResult> {
  const [engagement] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, opts.engagementId), eq(engagements.workspaceId, opts.workspaceId)))
    .limit(1);
  if (!engagement) return { ok: false, error: "Client not found." };

  const stack = (engagement.stack as Partial<EngagementStack> | null) ?? {};
  if (!stack.email_platform || !stack.email_platform_credentials_ref) {
    return { ok: false, error: "No email platform connected for this client yet — connect one before trying a win-back." };
  }

  if (stack.email_platform === "smtp") {
    return {
      ok: false,
      error:
        "Direct-send (SMTP) win-back runs as a durable background sequence that isn't wired up for manual chat enrollment yet — only Klaviyo/HubSpot/ActiveCampaign/GoHighLevel can be triggered this way right now.",
    };
  }

  const metaError = missingMetaFor(stack.email_platform, stack);
  if (metaError) return { ok: false, error: metaError };

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

  const apiKey = await resolveCredential(opts.engagementId, stack.email_platform);
  const prospectName = opts.prospectName?.trim() || opts.prospectEmail;

  await enrollInWinBackSequence(stack.email_platform, apiKey, opts.prospectEmail, prospectName, {
    recovery_list_id: stack.recovery_list_id,
    location_id: stack.booking_platform_meta?.location_id,
    recovery_workflow_id: stack.recovery_workflow_id,
    activecampaign_base_url: stack.activecampaign_base_url,
  });

  const id = crypto.randomUUID();
  await db.insert(winBackEnrollments).values({
    id,
    engagementId: opts.engagementId,
    prospectEmail: opts.prospectEmail,
    prospectName: opts.prospectName?.trim() || null,
    runId: null,
    sourceBookingId: null,
    recoveryWindowDays: stack.recovery_window_days ?? 30,
    status: "active",
  });

  return { ok: true, enrollmentId: id };
}
