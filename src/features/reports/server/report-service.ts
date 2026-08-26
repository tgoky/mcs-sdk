import { db } from "@/lib/db";
import {
  skillRuns,
  briefOutcomeLog,
  winBackEnrollments,
  pendingActions,
} from "@/models/schema";
import { and, eq, gte } from "drizzle-orm";
import { startOfWeek } from "@/lib/dashboard-stats";

export type ReportPeriod = "week" | "month" | "all_time";

export interface ClientReportMetrics {
  period: ReportPeriod;
  /** ISO date the period starts on, e.g. "2026-08-18". Null for all_time. */
  periodKey: string | null;
  periodStart: Date | null;
  periodLabel: string;

  bookings: number;

  calls: {
    showed: number;
    noShow: number;
    rescheduled: number;
    total: number;
    /** showed / (showed + noShow), null when there's no resolved-call baseline yet. */
    showRate: number | null;
  };

  winBack: {
    rebooked: number;
    lost: number;
    replyExited: number;
    active: number;
    corrected: number;
    /** rebooked / (rebooked + lost) among concluded enrollments, null when none have concluded yet. */
    recoveryRate: number | null;
  };

  approvals: {
    approved: number;
    rejected: number;
  };
}

/** Monday of the current week (server-local), formatted as an ISO date for periodKey/caching. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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
 * Real, honest breakdown of what actually happened for one client over one
 * period — bookings, call outcomes (showed/no_show/rescheduled from
 * briefOutcomeLog, the same table the assumed-no-show sweep and Recall
 * resolution both write to), Win-Back enrollment outcomes (rebooked/lost/
 * replied/still active), and approval-gate decisions (approved/rejected).
 * No LLM here — this is the numbers the notes in report-notes.ts get
 * grounded in, and what renders even when note generation is skipped.
 */
export async function computeClientReport(
  engagementId: string,
  period: ReportPeriod,
  reference: Date = new Date()
): Promise<ClientReportMetrics> {
  const { start, key, label } = periodBounds(period, reference);

  const [bookingRows, callRows, winBackRows, approvalRows] = await Promise.all([
    db
      .select({ id: skillRuns.id })
      .from(skillRuns)
      .where(
        and(
          eq(skillRuns.engagementId, engagementId),
          eq(skillRuns.skillName, "pile-on"),
          eq(skillRuns.status, "success"),
          start ? gte(skillRuns.startedAt, start) : undefined
        )
      ),
    db
      .select({ outcome: briefOutcomeLog.outcome })
      .from(briefOutcomeLog)
      .where(
        and(
          eq(briefOutcomeLog.engagementId, engagementId),
          start ? gte(briefOutcomeLog.loggedAt, start) : undefined
        )
      ),
    db
      .select({ status: winBackEnrollments.status })
      .from(winBackEnrollments)
      .where(
        and(
          eq(winBackEnrollments.engagementId, engagementId),
          start ? gte(winBackEnrollments.enrolledAt, start) : undefined
        )
      ),
    db
      .select({ status: pendingActions.status })
      .from(pendingActions)
      .where(
        and(
          eq(pendingActions.engagementId, engagementId),
          eq(pendingActions.status, "rejected"),
          start ? gte(pendingActions.decidedAt, start) : undefined
        )
      ),
  ]);

  const showed = callRows.filter((r) => r.outcome === "showed").length;
  const noShow = callRows.filter((r) => r.outcome === "no_show").length;
  const rescheduled = callRows.filter((r) => r.outcome === "rescheduled").length;
  const showRateBase = showed + noShow;

  const rebooked = winBackRows.filter((r) => r.status === "rebooked").length;
  const lost = winBackRows.filter((r) => r.status === "lost").length;
  const replyExited = winBackRows.filter((r) => r.status === "reply_exited").length;
  const active = winBackRows.filter((r) => r.status === "active").length;
  const corrected = winBackRows.filter((r) => r.status === "corrected").length;
  const recoveryBase = rebooked + lost;

  // Separate query for "approved" count since the rejected one above is
  // already filtered to status=rejected — a second cheap query beats
  // fetching every pendingActions row for the period just to count two
  // statuses client-side.
  const approvedRows = await db
    .select({ id: pendingActions.id })
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.engagementId, engagementId),
        eq(pendingActions.status, "approved"),
        start ? gte(pendingActions.decidedAt, start) : undefined
      )
    );

  return {
    period,
    periodKey: key,
    periodStart: start,
    periodLabel: label,
    bookings: bookingRows.length,
    calls: {
      showed,
      noShow,
      rescheduled,
      total: callRows.length,
      showRate: showRateBase > 0 ? showed / showRateBase : null,
    },
    winBack: {
      rebooked,
      lost,
      replyExited,
      active,
      corrected,
      recoveryRate: recoveryBase > 0 ? rebooked / recoveryBase : null,
    },
    approvals: {
      approved: approvedRows.length,
      rejected: approvalRows.length,
    },
  };
}

/** All three periods at once — what the report card/page actually needs to render its tabs without three round trips from the client. */
export async function computeClientReportAllPeriods(
  engagementId: string,
  reference: Date = new Date()
): Promise<Record<ReportPeriod, ClientReportMetrics>> {
  const [week, month, allTime] = await Promise.all([
    computeClientReport(engagementId, "week", reference),
    computeClientReport(engagementId, "month", reference),
    computeClientReport(engagementId, "all_time", reference),
  ]);
  return { week, month, all_time: allTime };
}
