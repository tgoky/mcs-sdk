// src/lib/notify.ts
//
// Single fan-out point for "something happened that the buyer needs to
// know about, right now, without them having to go check the dashboard."
//
// Three channels, in order of guarantee:
//   1. In-app  — ALWAYS written. This is the reliability floor: every
//      tenant has this channel by definition, no setup required. The
//      dashboard notification bell reads straight from this table.
//   2. Slack   — only if the engagement has stack.slack_webhook_url set
//      (same per-engagement webhook src/features/leak-map/server/alert-monitor.ts
//      already uses for Leak-Map breach alerts).
//   3. Email   — optional. Only fires if RESEND_API_KEY is set in env AND
//      the user has an email on file. This app has no email SDK installed
//      (checked package.json — no resend/nodemailer/sendgrid dependency),
//      so this goes over Resend's plain HTTP API rather than adding a new
//      dependency for one fetch call. If RESEND_API_KEY isn't set, this
//      channel silently no-ops — it is not a requirement to ship this file.
//
// Every channel is isolated in its own try/catch. A Slack outage or a
// missing/invalid Resend key must NEVER prevent the in-app row (the one
// channel every tenant is guaranteed to have) from being written.
import { db } from "@/lib/db";
import { notifications, users } from "@/models/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export type NotificationType =
  | "run_failed"
  | "run_timed_out"
  | "credential_invalid"
  | "credential_check_error";

export type NotificationSeverity = "info" | "warning" | "critical";

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
}

export async function notifyUser(opts: NotifyOptions): Promise<void> {
  // ── 1. In-app (always) ────────────────────────────────────────────────
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

  // ── 2. Slack (best-effort, only if configured) ──────────────────────────
  // Awaited deliberately: in a serverless runtime (Vercel/Lambda), the
  // execution context can be frozen or torn down the moment the caller's
  // handler returns. An un-awaited fetch here is a floating promise that
  // can be killed mid-flight, silently dropping the Slack alert. The
  // .catch still ensures a failed delivery never throws out of notifyUser.
  if (opts.slackWebhookUrl) {
    await fetch(opts.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*[${opts.severity.toUpperCase()}] ${opts.title}*\n${opts.body}`,
      }),
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
}
