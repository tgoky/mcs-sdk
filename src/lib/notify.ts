// src/lib/notify.ts
//
// Single fan-out point for "something happened that the buyer needs to
// know about, right now, without them having to go check the dashboard."
//
// Four channels, in order of guarantee:
//   1. In-app  — written by default. This is the reliability floor: every
//      tenant has this channel by definition, no setup required. The
//      dashboard notification bell AND the Queue panel (src/lib/queue.ts)
//      both read straight from this table, surfacing every row here as
//      its own alert/fyi queue item.
//
//      That last part is exactly why persistInApp exists: a caller that
//      already wrote a pendingActions row, a humanBlockers row, or marked
//      a skillRun failed/timed_out already HAS an in-app, queue-visible
//      record of this event — usually a richer one, with real actions
//      (approve/reject, resolve, run again) that this generic channel
//      can't offer. Also writing a notifications row for that same event
//      does not add a second useful thing for the buyer to look at; it
//      adds an unlinked duplicate that nothing ever clears when the real
//      one gets resolved. persistInApp: false skips *only* that row —
//      Slack and email still fire below, since "ping me" is still exactly
//      what should happen. See queuePendingAction (approval-gate.ts),
//      createBlocker (human-blockers.ts), and notifyRunOutcome
//      (run-log.ts) for the three call sites that pass it.
//   2. Slack   — only if the engagement has stack.slack_webhook_url set
//      (same per-engagement webhook src/features/leak-map/server/alert-monitor.ts
//      already uses for Leak-Map breach alerts).
//   3. Email   — optional. Only fires if RESEND_API_KEY is set in env AND
//      the user has an email on file. This app has no email SDK installed
//      (checked package.json — no resend/nodemailer/sendgrid dependency),
//      so this goes over Resend's plain HTTP API rather than adding a new
//      dependency for one fetch call. If RESEND_API_KEY isn't set, this
//      channel silently no-ops — it is not a requirement to ship this file.
//   4. Chat (2026-09-03) — Teammates chat is capable of a lot now (see
//      chat-skill-registry.ts, chat-credentials.ts, chat-winback.ts) but
//      still only ever *responds*. This is the piece that makes it an
//      assistant rather than a request/response tool: the system telling
//      *you*, in the same thread you'd naturally be checking on that
//      client, rather than waiting to be asked. Opt-in via `workspaceId`
//      — chatThreads is workspace-scoped and most existing notifyUser
//      call sites don't currently look it up, so this channel silently
//      no-ops without it rather than forcing every call site to change
//      today, same graceful-degradation shape email already has around
//      RESEND_API_KEY. Severity-gated to warning/critical only — the
//      cognitive-overload problem this app already solved once for the
//      dashboard (single-elevated-surface rule, alert-volume digest
//      batching) doesn't get reopened in a new surface just because chat
//      is a different UI. engagementId routes to that client's own most
//      recent thread (or starts one); a null engagementId (a workspace-
//      wide event with no single client to attach to, like weekly_metrics)
//      goes to the workspace's standing "Ops" thread instead — see
//      findOrCreateThreadForEvent in chat-threads.ts. No interactive
//      buttons in chat yet (Slack's approve/reject via SlackAction below
//      is the real precedent for how to wire that once it's built) — this
//      round is the message and the same runId/engagementId deep link
//      every other channel already gets, not the full interactive parity.
//
// Every channel is isolated in its own try/catch. A Slack outage or a
// missing/invalid Resend key must NEVER prevent the in-app row (the one
// channel every tenant is guaranteed to have) from being written.
import { db } from "@/lib/db";
import { notifications, users } from "@/models/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { findOrCreateThreadForEvent, appendMessage } from "@/lib/chat-threads";

export type NotificationType =
  | "run_failed"
  | "run_timed_out"
  | "credential_invalid"
  | "credential_check_error"
  | "lost_deal_swept"
  | "weekly_metrics"
  | "conversation_intelligence_objection_found"
  | "report_delivery_failed"
  | "sequence_message_failed"
  // Reputation Manager's rep-crisis-response — the first notification
  // type from outside Showtime's own 5 skills. None of the existing
  // types fit: this isn't a technical failure or a run problem, it's a
  // business-critical "a human needs to look at this now" alert, and
  // reusing e.g. credential_check_error the way human-blockers.ts does
  // elsewhere for a genuinely close-enough fit would be actively
  // misleading here — a crisis alert shouldn't read like a credential
  // problem. Confirmed both real consumers of this union (inbox/page.tsx
  // and human-blockers.ts) use array membership checks, not an
  // exhaustive switch, so this is safe to add.
  | "reputation_crisis_declared";

export type NotificationSeverity = "info" | "warning" | "critical";

/**
 * One button on an interactive Slack message — same shape deliverBrief's
 * outcome buttons already use (src/lib/platforms/email.ts), so both
 * produce Block Kit the Slack interactions handler
 * (src/app/api/slack/interactions/route.ts) parses the same way: read
 * engagementId out of the (still untrusted) value, verify that
 * engagement's signing secret, only then act.
 */
export interface SlackAction {
  label: string;
  style?: "primary" | "danger";
  actionId: string;
  /** JSON-stringified — must include engagementId; see the interactions route's verification order. */
  value: string;
}

export interface NotifyOptions {
  whopUserId: string;
  engagementId?: string;
  runId?: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  /** Per-engagement Slack webhook, if the tenant has one configured. */
  slackWebhookUrl?: string;
  /**
   * Default true. Set false when the caller already wrote its own
   * actionable/queue-visible record of this event (a pendingActions row,
   * a humanBlockers row, a failed skillRun) — see the file header. Never
   * suppresses Slack or email, only the in-app notifications-table row
   * and the duplicate Queue item it would otherwise produce.
   */
  persistInApp?: boolean;
  /**
   * Optional row of interactive buttons on the Slack message (requires
   * slackWebhookUrl). Omit for every notification that's genuinely just
   * FYI — a button that can't actually resolve anything (most blocker
   * types need a URL or credential, not a click) is worse than no button,
   * since it invites a click that does nothing. Only queuePendingAction
   * passes this today, for Approve/Reject.
   */
  slackActions?: SlackAction[];
  /**
   * Enables the chat channel (see file header) — omit and it silently
   * no-ops, same as every other optional channel here. Needed because
   * chatThreads is workspace-scoped and NotifyOptions otherwise has no
   * workspace context.
   */
  workspaceId?: string;
}

export async function notifyUser(opts: NotifyOptions): Promise<void> {
  // ── 1. In-app (default on — see persistInApp above) ─────────────────
  if (opts.persistInApp !== false) {
    try {
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        whopUserId: opts.whopUserId,
        engagementId: opts.engagementId ?? null,
        runId: opts.runId ?? null,
        type: opts.type,
        severity: opts.severity,
        title: opts.title,
        body: opts.body,
        read: false,
        createdAt: new Date(),
      });
    } catch (e) {
      // If even the in-app write fails (DB down), there's nowhere reliable
      // left to surface this — log and continue to the best-effort channels
      // below, since Slack/email might still get through independently.
      console.error("[notify] failed to write in-app notification:", e);
    }
  }

  // ── 2. Slack (best-effort, only if configured) ──────────────────────────
  // Awaited deliberately: in a serverless runtime (Vercel/Lambda), the
  // execution context can be frozen or torn down the moment the caller's
  // handler returns. An un-awaited fetch here is a floating promise that
  // can be killed mid-flight, silently dropping the Slack alert. The
  // .catch still ensures a failed delivery never throws out of notifyUser.
  if (opts.slackWebhookUrl) {
    const body = opts.slackActions?.length
      ? {
          // Fallback text for notifications/screen readers; blocks below
          // are what actually renders. Same shape deliverBrief's outcome
          // buttons use (src/lib/platforms/email.ts) — the interactions
          // route parses both the same way.
          text: `${opts.title}\n${opts.body}`,
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `*${opts.title}*\n${opts.body}` } },
            {
              type: "actions",
              block_id: "queue_item_actions",
              elements: opts.slackActions.map((a) => ({
                type: "button",
                text: { type: "plain_text", text: a.label },
                ...(a.style ? { style: a.style } : {}),
                action_id: a.actionId,
                value: a.value,
              })),
            },
          ],
        }
      : { text: `*[${opts.severity.toUpperCase()}] ${opts.title}*\n${opts.body}` };

    await fetch(opts.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((e) => {
      console.error("[notify] Slack delivery failed:", e.message);
    });
  }

  // ── 3. Email (optional add-on channel, only if RESEND_API_KEY is set) ──
  if (process.env.RESEND_API_KEY) {
    try {
      const [userRow] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.whopUserId, opts.whopUserId))
        .limit(1);

      if (userRow?.email) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL ?? "alerts@showtime.app",
            to: userRow.email,
            subject: opts.title,
            text: opts.body,
          }),
        });
        if (!res.ok) {
          console.error("[notify] Resend delivery failed:", await res.text());
        }
      }
    } catch (e: any) {
      console.error("[notify] email channel error:", e.message);
    }
  }

  // ── 4. Chat (best-effort, only if workspaceId provided AND severity
  // clears the bar — see file header for why info-level never posts) ──
  if (opts.workspaceId && (opts.severity === "warning" || opts.severity === "critical")) {
    try {
      const threadId = await findOrCreateThreadForEvent({
        workspaceId: opts.workspaceId,
        whopUserId: opts.whopUserId,
        engagementId: opts.engagementId ?? null,
        fallbackTitle: opts.title,
      });

      // Same runId-first, engagementId-otherwise deep-link convention the
      // notification bell already uses — not a new rule invented here.
      const link = opts.runId
        ? { label: "View run", href: `/dashboard/runs/${opts.runId}` }
        : opts.engagementId
          ? { label: "View client", href: `/dashboard/engagements/${opts.engagementId}` }
          : null;

      await appendMessage({
        threadId,
        role: "assistant",
        kind: "text",
        rawContent: opts.body,
        displayText: opts.body,
        links: link ? [link] : null,
      });
    } catch (e) {
      console.error("[notify] chat channel error:", e);
    }
  }
}