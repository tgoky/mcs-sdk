// Shared by the three durable multi-message sequence senders (win-back-sms,
// win-back-email-smtp, pile-on-sms) — called after logging a failed send to
// sequence_message_log. A single broken credential can fail every message
// across many prospects within minutes, so this is edge-triggered rather
// than firing on every failure: it checks whether this engagement+sequence
// already has a recent failure logged, and only notifies if this is a fresh
// problem, not a known one still in progress.
import { db } from "@/lib/db";
import { engagements, sequenceMessageLog, type EngagementStack } from "@/models/schema";
import { and, eq, gte, ne } from "drizzle-orm";
import { notifyUser } from "@/lib/notify";

const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

const SEQUENCE_LABELS: Record<string, string> = {
  win_back_sms: "Win-Back SMS",
  win_back_email_smtp: "Win-Back email",
  pile_on_sms: "Pile-On SMS",
};

export async function maybeNotifySequenceFailure(opts: {
  engagementId: string;
  sequenceType: "win_back_sms" | "win_back_email_smtp" | "pile_on_sms";
  justLoggedId: string;
  error: string;
}) {
  try {
    const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS);
    const [recentFailure] = await db
      .select({ id: sequenceMessageLog.id })
      .from(sequenceMessageLog)
      .where(
        and(
          eq(sequenceMessageLog.engagementId, opts.engagementId),
          eq(sequenceMessageLog.sequenceType, opts.sequenceType),
          eq(sequenceMessageLog.status, "failed"),
          gte(sequenceMessageLog.createdAt, windowStart),
          ne(sequenceMessageLog.id, opts.justLoggedId)
        )
      )
      .limit(1);

    if (recentFailure) return; // already notified about this ongoing problem

    const [tenant] = await db
      .select({ whopUserId: engagements.whopUserId, stack: engagements.stack })
      .from(engagements)
      .where(eq(engagements.engagementId, opts.engagementId))
      .limit(1);

    if (!tenant) return;
    const stack = tenant.stack as EngagementStack | null;
    const label = SEQUENCE_LABELS[opts.sequenceType] ?? opts.sequenceType;

    await notifyUser({
      whopUserId: tenant.whopUserId,
      engagementId: opts.engagementId,
      type: "sequence_message_failed",
      severity: "warning",
      title: `${label} delivery is failing`,
      body: `A scheduled ${label} message failed to send: ${opts.error}. Further failures on this sequence won't re-notify for ${DEDUP_WINDOW_MS / 3600000}h so this doesn't spam you — check the credential for this engagement.`,
      slackWebhookUrl: stack?.slack_webhook_url,
    });
  } catch (e) {
    // Never let a notification failure break the sender itself.
    console.error("[sequence-notify] failed to send failure notification:", e);
  }
}
