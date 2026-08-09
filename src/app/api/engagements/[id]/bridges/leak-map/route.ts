import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Leak-Map's hinges — weekly/monthly audit schedule + timezone, and
 * where the report lands (dashboard/Slack/email). weekly_summary_schedule
 * and monthly_deep_dive_schedule are read by src/inngest/crons.ts (a
 * shared cron file, but the only bridge they affect is Leak-Map's audit
 * cadence — same pattern as Pre-Call Read's brief_trigger_type).
 * audit_output_format and leak_map_report_email resolve to
 * src/features/leak-map/server alone.
 *
 * Like Win-Back and Pre-Call Read, not a gate: every field has a sane
 * default and Leak-Map already waits on its own cron. Optional
 * review/edit screen, reachable anytime.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const [row] = await db
    .select({ buyer: engagements.buyer, stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const weekly = row.stack?.weekly_summary_schedule;
  const monthly = row.stack?.monthly_deep_dive_schedule;

  return NextResponse.json({
    buyer: row.buyer,
    weeklyScheduleDayOfWeek: weekly?.dayOfWeek ?? 1,
    weeklyScheduleHour: weekly?.hourLocal ?? 9,
    monthlyScheduleDayOfMonth: monthly?.dayOfMonth ?? 1,
    leakMapTimezone: weekly?.timezone ?? monthly?.timezone ?? "UTC",
    auditOutputFormat: row.stack?.audit_output_format ?? "dashboard_only",
    leakMapReportEmail: row.stack?.leak_map_report_email ?? "",
    // For the "Slack delivery reuses the webhook from Pre-Call Read"
    // hint — slackWebhookUrl itself is a shared field, owned by the
    // general wizard, not this route.
    slackWebhookUrl: row.stack?.slack_webhook_url ?? "",
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const weeklyScheduleDayOfWeek = clampInt(body.weeklyScheduleDayOfWeek, 0, 6, 1);
    const weeklyScheduleHour = clampInt(body.weeklyScheduleHour, 0, 23, 9);
    // Capped at 28 so it fires reliably every month, including February.
    const monthlyScheduleDayOfMonth = clampInt(body.monthlyScheduleDayOfMonth, 1, 28, 1);
    const leakMapTimezone: string = typeof body.leakMapTimezone === "string" && body.leakMapTimezone.trim() ? body.leakMapTimezone.trim() : "UTC";
    const auditOutputFormat: "email" | "slack" | "dashboard_only" =
      body.auditOutputFormat === "email" || body.auditOutputFormat === "slack" ? body.auditOutputFormat : "dashboard_only";
    const leakMapReportEmail: string = typeof body.leakMapReportEmail === "string" ? body.leakMapReportEmail.trim() : "";

    if (auditOutputFormat === "email" && !leakMapReportEmail) {
      return NextResponse.json({ error: "A report recipient email is required for email delivery." }, { status: 400 });
    }

    const [row] = await db
      .select({ engagementId: engagements.engagementId, stack: engagements.stack })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const mergedStack = {
      ...(row.stack ?? {}),
      weekly_summary_schedule: { dayOfWeek: weeklyScheduleDayOfWeek, hourLocal: weeklyScheduleHour, timezone: leakMapTimezone },
      monthly_deep_dive_schedule: { dayOfMonth: monthlyScheduleDayOfMonth, hourLocal: weeklyScheduleHour, timezone: leakMapTimezone },
      audit_output_format: auditOutputFormat,
      ...(auditOutputFormat === "email" ? { leak_map_report_email: leakMapReportEmail } : {}),
    } as EngagementStack;

    await db
      .update(engagements)
      .set({ stack: mergedStack, updatedAt: new Date() })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/leak-map]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
