/**
 * Audit report delivery — Leak Map recovery gap 2.
 *
 * "email": sent via this app's own outbound email (Resend), reusing the
 * exact env-var convention lib/notify.ts already established
 * (RESEND_API_KEY / RESEND_FROM_EMAIL) rather than inventing a second
 * one. Deliberately NOT routed through the buyer's own ESP the way
 * Pile-On/Win-Back sequences are — a one-off operational report isn't
 * something the buyer has (or should need) a pre-built flow for, so
 * "we tag their platform" doesn't apply here the way it does elsewhere in
 * this codebase.
 *
 * "slack": Block Kit rich message to stack.slack_webhook_url — same
 * per-engagement-webhook-only principle as alert-monitor.ts, never a
 * global Slack app.
 *
 * "dashboard_only": no-op. The report already landed in auditRunsLog from
 * audit-engine.ts's own persist step; this is the explicit "and don't
 * push it anywhere" choice, not a fallback for a missing config.
 */


import { fetchWithTimeout } from "@/lib/http";
export interface AuditOutputResult {
  delivered: boolean;
  channel: "email" | "slack" | "dashboard_only";
  error?: string;
}

/** `**bold**` (LLM-generated markdown) -> `*bold*` (Slack mrkdwn). */
function toSlackMrkdwn(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "*$1*");
}

/** Minimal markdown -> HTML for the email body — bold + paragraph breaks only, not a full parser. */
function toEmailHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<div style="font-family: -apple-system, sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a;">${paragraphs}</div>`;
}

export async function deliverAuditReport(
  format: "email" | "slack" | "dashboard_only" | undefined,
  runType: "weekly" | "monthly",
  buyerName: string,
  report: string,
  opts: { slackWebhookUrl?: string; reportEmail?: string }
): Promise<AuditOutputResult> {
  const resolvedFormat = format ?? "dashboard_only";
  const title = `Leak Map ${runType === "weekly" ? "Weekly Summary" : "Monthly Deep-Dive"} — ${buyerName}`;

  if (resolvedFormat === "dashboard_only") {
    return { delivered: true, channel: "dashboard_only" };
  }

  if (resolvedFormat === "slack") {
    if (!opts.slackWebhookUrl) {
      return { delivered: false, channel: "slack", error: "No slack_webhook_url configured on this engagement." };
    }
    try {
      const res = await fetchWithTimeout(opts.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks: [
            { type: "header", text: { type: "plain_text", text: title, emoji: true } },
            { type: "section", text: { type: "mrkdwn", text: toSlackMrkdwn(report).slice(0, 2900) } },
            ...(report.length > 2900
              ? [{ type: "context", elements: [{ type: "mrkdwn", text: "Full report available in the dashboard — truncated here for Slack's length limit." }] }]
              : []),
          ],
        }),
      });
      if (!res.ok) {
        return { delivered: false, channel: "slack", error: `Slack webhook returned [${res.status}]` };
      }
      return { delivered: true, channel: "slack" };
    } catch (e: any) {
      return { delivered: false, channel: "slack", error: e.message };
    }
  }

  // format === "email"
  if (!process.env.RESEND_API_KEY) {
    return { delivered: false, channel: "email", error: "RESEND_API_KEY is not configured — email delivery is unavailable." };
  }
  if (!opts.reportEmail) {
    return { delivered: false, channel: "email", error: "No leak_map_report_email configured on this engagement." };
  }
  try {
    const res = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "leak-map@showtime.app",
        to: opts.reportEmail,
        subject: title,
        html: toEmailHtml(report),
      }),
    });
    if (!res.ok) {
      return { delivered: false, channel: "email", error: `Resend returned [${res.status}]: ${(await res.text()).slice(0, 300)}` };
    }
    return { delivered: true, channel: "email" };
  } catch (e: any) {
    return { delivered: false, channel: "email", error: e.message };
  }
}
