import { db } from "@/lib/db";
import { repEngineFindings, repTrustpilotReviews, repRedditMentions, repTwitterMentions, repIncidents } from "@/models/schema";
import { and, eq, gte } from "drizzle-orm";
import { startOfWeek } from "@/lib/dashboard-stats";
import type { ReportPeriod } from "@/features/reports/server/report-service";

export interface RepClientReportMetrics {
  period: ReportPeriod;
  periodKey: string | null;
  periodStart: Date | null;
  periodLabel: string;

  mentions: {
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    /** negative / total, null when there's nothing scored yet this period. */
    negativePct: number | null;
  };

  flagged: number;
  incidents: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Same three windows/labels as report-service.ts's own periodBounds — kept
// as an identical copy rather than an import so this file has no reason to
// ever need Showtime's own bookings/calls/winBack shape in scope, just the
// period-window math both happen to share.
function periodBounds(period: ReportPeriod, reference: Date): { start: Date | null; key: string | null; label: string } {
  if (period === "week") {
    const start = startOfWeek(reference);
    return { start, key: isoDate(start), label: "This week" };
  }
  if (period === "month") {
    const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
    return { start, key: isoDate(start), label: "This month" };
  }
  return { start: null, key: null, label: "All time" };
}

/**
 * One client's real activity across all four Reputation Manager watch
 * skills plus Crisis Response, for one period — the RM counterpart to
 * report-service.ts's computeClientReport. Every one of the four
 * ingestion tables shares the same {sentiment, flagged} shape (see
 * schema.ts's own comments on each), which is what makes one uniform
 * query set possible here instead of four bespoke ones.
 */
export async function computeRepClientReport(
  engagementId: string,
  period: ReportPeriod,
  reference: Date = new Date()
): Promise<RepClientReportMetrics> {
  const { start, key, label } = periodBounds(period, reference);

  const [engineRows, trustpilotRows, redditRows, twitterRows, incidentRows] = await Promise.all([
    db
      .select({ sentiment: repEngineFindings.sentiment, flagged: repEngineFindings.flagged })
      .from(repEngineFindings)
      .where(and(eq(repEngineFindings.engagementId, engagementId), start ? gte(repEngineFindings.runAt, start) : undefined)),
    db
      .select({ sentiment: repTrustpilotReviews.sentiment, flagged: repTrustpilotReviews.flagged })
      .from(repTrustpilotReviews)
      .where(and(eq(repTrustpilotReviews.engagementId, engagementId), start ? gte(repTrustpilotReviews.createdAt, start) : undefined)),
    db
      .select({ sentiment: repRedditMentions.sentiment, flagged: repRedditMentions.flagged })
      .from(repRedditMentions)
      .where(and(eq(repRedditMentions.engagementId, engagementId), start ? gte(repRedditMentions.createdAt, start) : undefined)),
    db
      .select({ sentiment: repTwitterMentions.sentiment, flagged: repTwitterMentions.flagged })
      .from(repTwitterMentions)
      .where(and(eq(repTwitterMentions.engagementId, engagementId), start ? gte(repTwitterMentions.createdAt, start) : undefined)),
    db
      .select({ id: repIncidents.id })
      .from(repIncidents)
      .where(and(eq(repIncidents.engagementId, engagementId), start ? gte(repIncidents.declaredAt, start) : undefined)),
  ]);

  const all = [...engineRows, ...trustpilotRows, ...redditRows, ...twitterRows];
  const positive = all.filter((r) => r.sentiment === "positive").length;
  const neutral = all.filter((r) => r.sentiment === "neutral").length;
  const negative = all.filter((r) => r.sentiment === "negative").length;
  const flagged = all.filter((r) => r.flagged).length;

  return {
    period,
    periodKey: key,
    periodStart: start,
    periodLabel: label,
    mentions: {
      total: all.length,
      positive,
      neutral,
      negative,
      negativePct: all.length > 0 ? negative / all.length : null,
    },
    flagged,
    incidents: incidentRows.length,
  };
}

/** All three periods at once — what the report card needs to render its tabs without three round trips. */
export async function computeRepClientReportAllPeriods(
  engagementId: string,
  reference: Date = new Date()
): Promise<Record<ReportPeriod, RepClientReportMetrics>> {
  const [week, month, allTime] = await Promise.all([
    computeRepClientReport(engagementId, "week", reference),
    computeRepClientReport(engagementId, "month", reference),
    computeRepClientReport(engagementId, "all_time", reference),
  ]);
  return { week, month, all_time: allTime };
}
