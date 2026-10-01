// src/features/reputation-manager/server/review-requests.ts
//
// Asks for a review after something good happened: the person showed up to
// their call (Showtime) or paid (Whop). Everyone is asked the same way with
// the same link; nobody is filtered by how they feel first (Google's review
// policy forbids selectively asking happy customers, and so does the FTC's
// rule on consumer reviews).
//
// Flow: a trigger schedules one row in review_requests (unique per trigger,
// so a replayed webhook asks once). After the client's delay, the send step
// re-checks everything, picks email or text, sends through the client's own
// email or SMS tool, and logs the message with its receipt in
// sequence_message_log, so delivery is proven the same way reminders are.
// One person is asked at most once every ASK_AGAIN_AFTER_DAYS.

import { db } from "@/lib/db";
import { bookingRoster, engagements, reviewRequests, sequenceMessageLog, type EngagementStack } from "@/models/schema";
import { and, eq, gte, ne, or, sql } from "drizzle-orm";
import { inngest, reviewRequestScheduled } from "@/lib/inngest";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { isEngagementPaused } from "@/lib/engagement-status";
import { resolveCredential } from "@/lib/credentials";
import { createDirectSendClient, directSendProvider } from "@/lib/platforms/email";
import { sendSmsForTenant } from "@/lib/platforms/sms";
import { receiptColumns, twilioStatusCallbackUrl } from "@/lib/delivery-receipts";
import { isOptedOut } from "@/lib/sms-replies";
import {
  ASK_AGAIN_AFTER_DAYS,
  DEFAULT_REVIEW_DELAY_HOURS,
  DEFAULT_REVIEW_MESSAGE,
  DEFAULT_REVIEW_SUBJECT,
  pickReviewChannel,
  renderReviewRequest,
  type ReviewTrigger,
} from "./review-request-message";

export const REVIEW_SKILL = "rep-review-requests";

export interface ReviewRequestPerson {
  trigger: ReviewTrigger;
  refId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Records the request and wakes the sender after the client's delay.
 * Returns the request id, or null when nothing is scheduled. */
export async function scheduleReviewRequest(engagementId: string, person: ReviewRequestPerson): Promise<string | null> {
  if (!person.email && !person.phone) return null;
  if (!(await isSkillEnabledForEngagement(engagementId, REVIEW_SKILL))) return null;
  const [tenant] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = tenant?.stack as EngagementStack | null;
  if (!stack?.rep_review_link) return null;

  const delayHours = stack.rep_review_request_delay_hours ?? DEFAULT_REVIEW_DELAY_HOURS;
  const sendAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);
  const [row] = await db
    .insert(reviewRequests)
    .values({
      engagementId,
      trigger: person.trigger,
      refId: person.refId,
      personName: person.name?.trim() || null,
      email: person.email?.trim().toLowerCase() || null,
      phone: person.phone?.trim() || null,
      sendAt,
    })
    .onConflictDoNothing()
    .returning({ id: reviewRequests.id });
  if (!row) return null; // already asked for this call or payment

  await inngest.send(reviewRequestScheduled.create({ engagementId, requestId: row.id, sendAt: sendAt.toISOString() }));
  return row.id;
}

/** A show later corrected to a no-show: the request goes nowhere. */
export async function cancelReviewRequest(engagementId: string, trigger: ReviewTrigger, refId: string, reason: string): Promise<void> {
  await db
    .update(reviewRequests)
    .set({ status: "cancelled", detail: reason, updatedAt: new Date() })
    .where(and(eq(reviewRequests.engagementId, engagementId), eq(reviewRequests.trigger, trigger), eq(reviewRequests.refId, refId), eq(reviewRequests.status, "scheduled")));
}

type RequestRow = typeof reviewRequests.$inferSelect;

async function finish(row: RequestRow, set: Partial<typeof reviewRequests.$inferInsert>): Promise<{ status: string; detail?: string | null }> {
  await db.update(reviewRequests).set({ ...set, updatedAt: new Date() }).where(eq(reviewRequests.id, row.id));
  return { status: set.status ?? row.status, detail: set.detail };
}

type DbOrTx = Pick<typeof db, "select">;

/** Was this person already asked (by any trigger) recently, or is another
 * request to them being sent right now? */
async function askedRecently(row: RequestRow, client: DbOrTx = db): Promise<boolean> {
  const since = new Date(Date.now() - ASK_AGAIN_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const who = [row.email ? eq(reviewRequests.email, row.email) : null, row.phone ? eq(reviewRequests.phone, row.phone) : null].filter((c): c is NonNullable<typeof c> => c !== null);
  if (!who.length) return false;
  const [other] = await client
    .select({ id: reviewRequests.id })
    .from(reviewRequests)
    .where(
      and(
        eq(reviewRequests.engagementId, row.engagementId),
        ne(reviewRequests.id, row.id),
        or(and(eq(reviewRequests.status, "sent"), gte(reviewRequests.sentAt, since)), eq(reviewRequests.status, "sending")),
        or(...who)
      )
    )
    .limit(1);
  return Boolean(other);
}

/**
 * Claims this request for sending ("scheduled" -> "sending"), under a lock
 * on the person so two requests to them (a show and a payment due at the
 * same moment) can't both pass the "asked recently?" check. Returns false
 * when it was already claimed, or the person was just asked. A request left
 * "sending" by a crash is never retried: it may have gone out.
 */
async function claimForSending(row: RequestRow): Promise<"claimed" | "taken" | "asked"> {
  const person = `${row.engagementId}:${row.email ?? ""}:${row.phone ?? ""}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${person}))`);
    if (await askedRecently(row, tx)) return "asked";
    const [claimed] = await tx
      .update(reviewRequests)
      .set({ status: "sending", updatedAt: new Date() })
      .where(and(eq(reviewRequests.id, row.id), eq(reviewRequests.status, "scheduled")))
      .returning({ id: reviewRequests.id });
    return claimed ? "claimed" : "taken";
  });
}

/** Sends one scheduled request, if it should still go. Safe to call twice. */
export async function sendReviewRequest(engagementId: string, requestId: string): Promise<{ status: string; detail?: string | null }> {
  const [row] = await db.select().from(reviewRequests).where(and(eq(reviewRequests.id, requestId), eq(reviewRequests.engagementId, engagementId))).limit(1);
  if (!row) return { status: "missing" };
  if (row.status !== "scheduled") return { status: row.status, detail: row.detail };

  const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant || tenant.deletedAt || isEngagementPaused(tenant)) return finish(row, { status: "skipped", detail: "The client is paused or removed." });
  if (!(await isSkillEnabledForEngagement(engagementId, REVIEW_SKILL))) return finish(row, { status: "skipped", detail: "Review requests were turned off before it was due." });
  const stack = tenant.stack as EngagementStack | null;
  const link = stack?.rep_review_link?.trim();
  if (!link) return finish(row, { status: "skipped", detail: "No review link is set." });
  const claim = await claimForSending(row);
  if (claim === "asked") return finish(row, { status: "skipped", detail: `Already asked in the last ${ASK_AGAIN_AFTER_DAYS} days.` });
  if (claim === "taken") return { status: "sending", detail: "Another attempt is already sending this request." };

  // Nothing has been sent yet: if any of this fails, put the request back
  // so the retry can send it (a claim is only kept once sending starts).
  let emailCredential: string | null;
  let smsPlatform: "twilio" | "ghl_sms" | null;
  let channel: ReturnType<typeof pickReviewChannel>;
  try {
    // A booking may have gained a phone or name since it was scheduled.
    if (row.trigger === "showed" && (!row.phone || !row.personName)) {
      const [b] = await db.select({ phone: bookingRoster.prospectPhone, name: bookingRoster.prospectName }).from(bookingRoster).where(and(eq(bookingRoster.engagementId, engagementId), eq(bookingRoster.externalCallId, row.refId))).limit(1);
      row.phone ??= b?.phone ?? null;
      row.personName ??= b?.name ?? null;
    }

    emailCredential = row.email ? await resolveCredential(engagementId, "smtp").catch(() => null) : null;
    smsPlatform = stack?.sms_platform === "twilio" || stack?.sms_platform === "ghl_sms" ? stack.sms_platform : null;
    const smsOk = Boolean(row.phone && smsPlatform && !(await isOptedOut(engagementId, row.phone)));
    channel = pickReviewChannel({ prefer: stack?.rep_review_request_channel ?? "email", emailReady: Boolean(row.email && emailCredential), smsReady: smsOk });
  } catch (err) {
    await db.update(reviewRequests).set({ status: "scheduled", updatedAt: new Date() }).where(and(eq(reviewRequests.id, row.id), eq(reviewRequests.status, "sending")));
    throw err;
  }
  if (!channel) {
    return finish(row, { status: "skipped", detail: row.email || row.phone ? "No way to reach them: connect an email sender (SMTP or Resend) or a texting tool, or they opted out of texts." : "No email or phone on file." });
  }

  const body = renderReviewRequest(stack?.rep_review_request_message?.trim() || DEFAULT_REVIEW_MESSAGE, row.personName, link);
  const sequenceType = channel === "email" ? "review_request_email" : "review_request_sms";
  try {
    const receipt =
      channel === "email"
        ? { provider: directSendProvider(emailCredential!), ...(await createDirectSendClient(emailCredential!).sendEmail(row.email!, renderReviewRequest(stack?.rep_review_request_subject?.trim() || DEFAULT_REVIEW_SUBJECT, row.personName, link), body)) }
        : await sendSmsForTenant(
            smsPlatform!,
            await resolveCredential(engagementId, smsPlatform!),
            { ...stack?.sms_platform_meta, sms_compliance_footer_variant: stack?.sms_compliance_footer_variant, sms_compliance_footer_custom: stack?.sms_compliance_footer_custom },
            { email: row.email ?? "", phone: row.phone ?? undefined },
            body,
            stack?.sms_a2p_10dlc_status,
            { statusCallbackUrl: twilioStatusCallbackUrl(engagementId) ?? undefined }
          );
    const [logged] = await db
      .insert(sequenceMessageLog)
      .values({ engagementId, sequenceType, bookingId: row.trigger === "showed" ? row.refId : null, messageId: `review_request:${row.trigger}`, channel, prospectEmail: row.email, prospectPhone: row.phone, status: "sent", ...receiptColumns(receipt) })
      .returning({ id: sequenceMessageLog.id });
    return finish(row, { status: "sent", channel, messageLogId: logged.id, sentAt: new Date(), detail: null });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const [logged] = await db
      .insert(sequenceMessageLog)
      .values({ engagementId, sequenceType, bookingId: row.trigger === "showed" ? row.refId : null, messageId: `review_request:${row.trigger}`, channel, prospectEmail: row.email, prospectPhone: row.phone, status: "failed", error })
      .returning({ id: sequenceMessageLog.id });
    return finish(row, { status: "failed", channel, messageLogId: logged.id, detail: error.slice(0, 500) });
  }
}

