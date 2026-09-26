// src/features/pile-on/server/at-risk-check-in.ts
//
// Acting on the show-rate estimate: a call that looks at risk of a no-show
// (lib/at-risk.ts) gets one extra check-in text a few hours before, asking
// the person to confirm or pick a better time. Their reply lands in the
// normal text-reply handling (inngest/sms-reply.ts): YES confirms, a new
// time goes to the Queue. Sent through the client's own texting tool and
// logged with its receipt like every reminder.

import { db } from "@/lib/db";
import { bookingRoster, briefOutcomeLog, engagements, sequenceMessageLog, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { inngest, atRiskCheckInScheduled } from "@/lib/inngest";
import { checkInSendAt, DEFAULT_CHECK_IN_MESSAGE, isAtRisk, renderCheckIn } from "@/lib/at-risk";
import { isEngagementPaused } from "@/lib/engagement-status";
import { isOptedOut } from "@/lib/sms-replies";
import { isHeldOut } from "@/lib/reminder-holdout";
import { resolveCredential } from "@/lib/credentials";
import { sendSmsForTenant } from "@/lib/platforms/sms";
import { receiptColumns, twilioStatusCallbackUrl } from "@/lib/delivery-receipts";

export const AT_RISK_SEQUENCE = "at_risk_sms";

/** Called when a call is scored. Schedules the check-in when the client
 * turned it on and the estimate is under their threshold. */
export async function maybeScheduleCheckIn(engagementId: string, stack: Pick<EngagementStack, "at_risk_check_in" | "at_risk_threshold"> | null, call: { bookingId: string; callTime: Date; probability: number }, now = new Date()): Promise<boolean> {
  if (!stack?.at_risk_check_in) return false;
  if (!isAtRisk(call.probability, stack.at_risk_threshold, null)) return false;
  const sendAt = checkInSendAt(call.callTime, now);
  if (!sendAt) return false;
  await inngest.send(atRiskCheckInScheduled.create({ engagementId, bookingId: call.bookingId, sendAt: sendAt.toISOString() }));
  return true;
}

export type CheckInResult = { sent: true; messageLogId: string } | { sent: false; reason: string };

/** Sends the check-in if it still should: call still on, no outcome, not sent already, texts possible. */
export async function sendCheckIn(engagementId: string, bookingId: string, now = new Date()): Promise<CheckInResult> {
  const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant || tenant.deletedAt || isEngagementPaused(tenant)) return { sent: false, reason: "The client is paused or removed." };
  const stack = tenant.stack as EngagementStack | null;
  if (!stack?.at_risk_check_in) return { sent: false, reason: "At-risk check-ins were turned off." };
  const platform = stack.sms_platform === "twilio" || stack.sms_platform === "ghl_sms" ? stack.sms_platform : null;
  if (!platform) return { sent: false, reason: "No texting tool is connected." };

  const [booking] = await db
    .select({ status: bookingRoster.status, callTime: bookingRoster.callTime, name: bookingRoster.prospectName, email: bookingRoster.prospectEmail, phone: bookingRoster.prospectPhone })
    .from(bookingRoster)
    .where(and(eq(bookingRoster.engagementId, engagementId), eq(bookingRoster.externalCallId, bookingId)))
    .limit(1);
  if (!booking || booking.status === "cancelled") return { sent: false, reason: "The booking was cancelled." };
  if (booking.callTime.getTime() - now.getTime() < 10 * 60_000) return { sent: false, reason: "Too close to the call." };
  if (!booking.phone && platform === "twilio") return { sent: false, reason: "No phone number on the booking." };

  const [outcome] = await db.select({ id: briefOutcomeLog.id }).from(briefOutcomeLog).where(and(eq(briefOutcomeLog.engagementId, engagementId), eq(briefOutcomeLog.bookingId, bookingId))).limit(1);
  if (outcome) return { sent: false, reason: "An outcome is already in." };
  const [already] = await db.select({ id: sequenceMessageLog.id }).from(sequenceMessageLog).where(and(eq(sequenceMessageLog.engagementId, engagementId), eq(sequenceMessageLog.bookingId, bookingId), eq(sequenceMessageLog.sequenceType, AT_RISK_SEQUENCE))).limit(1);
  if (already) return { sent: false, reason: "Already sent." };
  if (await isOptedOut(engagementId, booking.phone)) return { sent: false, reason: "They texted STOP." };
  if (await isHeldOut(engagementId, bookingId)) return { sent: false, reason: "Held out of reminders (holdout proof)." };

  const body = renderCheckIn(stack.at_risk_check_in_message?.trim() || DEFAULT_CHECK_IN_MESSAGE, booking.name, booking.callTime, stack.timezone);
  const base = { engagementId, sequenceType: AT_RISK_SEQUENCE, bookingId, messageId: "at_risk_check_in", channel: "sms", prospectEmail: booking.email, prospectPhone: booking.phone };
  try {
    const receipt = await sendSmsForTenant(
      platform,
      await resolveCredential(engagementId, platform),
      { ...stack.sms_platform_meta, sms_compliance_footer_variant: stack.sms_compliance_footer_variant, sms_compliance_footer_custom: stack.sms_compliance_footer_custom },
      { email: booking.email ?? "", phone: booking.phone ?? undefined },
      body,
      stack.sms_a2p_10dlc_status,
      { statusCallbackUrl: twilioStatusCallbackUrl(engagementId) ?? undefined }
    );
    const [logged] = await db.insert(sequenceMessageLog).values({ ...base, status: "sent", ...receiptColumns(receipt) }).returning({ id: sequenceMessageLog.id });
    return { sent: true, messageLogId: logged.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.insert(sequenceMessageLog).values({ ...base, status: "failed", error });
    return { sent: false, reason: error };
  }
}
