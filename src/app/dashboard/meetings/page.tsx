import { db } from "@/lib/db";
import { briefedCallsLog, bookingRoster, conversationIntelligenceSessions, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, and, gte, lt, asc, desc } from "drizzle-orm";
import Link from "next/link";
import { CheckCircle2, XCircle, Clock, CalendarClock, Ban, Radio } from "lucide-react";
import { CALL_SESSION_STATUS_LABELS, CALL_SESSION_STATUS_COLORS, bookingPlatformLabel } from "@/lib/copy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Two independently-sourced sections rather than one forced join:
 *
 * 1. "On the calendar" — straight from bookingRoster, the ground-truth
 *    "is this booking still on" table (see its module comment in
 *    schema.ts). This is what closes the black-box gap the old version of
 *    this page had: briefedCallsLog only gets a row at brief-send time
 *    (the night before, per Pre-Call Read's lead time), so a booking made
 *    today for three weeks out was invisible here until then. Roster rows
 *    show up the moment the booking webhook lands.
 *
 * 2. "Briefed calls" — the original briefedCallsLog query, now also
 *    left-joined to conversationIntelligenceSessions so a Recall.ai bot's
 *    live status (joining/in call/processed/failed) shows inline instead
 *    of only being visible from inside each client's Call Intelligence
 *    tab. The join key (callId === bookingId, scoped to engagementId) is
 *    the same one call-duration-estimator.ts already relies on — not a
 *    new/unverified relationship.
 *
 * These two are deliberately NOT merged into one row-per-call list: the
 * two tables don't share a booking id that's confirmed consistent across
 * every booking platform this app supports (Calendly/Cal.com/GHL/OnceHub
 * derive IDs differently in a few places), so forcing a join risked
 * silently hiding or mismatching real meetings. Two verified, independent
 * lists is the safer trade for "zero bugs" over one unverified merged one.
 */
export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const { range } = await searchParams;
  const isPast = range === "past";
  const now = new Date();

  const [bookings, briefed] = await Promise.all([
    db
      .select({
        id: bookingRoster.id,
        prospectName: bookingRoster.prospectName,
        callTime: bookingRoster.callTime,
        status: bookingRoster.status,
        bookingPlatform: bookingRoster.bookingPlatform,
        engagementId: bookingRoster.engagementId,
        buyer: engagements.buyer,
      })
      .from(bookingRoster)
      .innerJoin(engagements, eq(engagements.engagementId, bookingRoster.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          isPast ? lt(bookingRoster.callTime, now) : gte(bookingRoster.callTime, now)
        )
      )
      .orderBy(isPast ? desc(bookingRoster.callTime) : asc(bookingRoster.callTime))
      .limit(50),

    db
      .select({
        id: briefedCallsLog.id,
        callTime: briefedCallsLog.callTime,
        prospectName: briefedCallsLog.prospectName,
        briefDeliveredAt: briefedCallsLog.briefDeliveredAt,
        researchStatus: briefedCallsLog.researchStatus,
        engagementId: briefedCallsLog.engagementId,
        buyer: engagements.buyer,
        callSessionStatus: conversationIntelligenceSessions.status,
      })
      .from(briefedCallsLog)
      .innerJoin(engagements, eq(engagements.engagementId, briefedCallsLog.engagementId))
      .leftJoin(
        conversationIntelligenceSessions,
        and(
          eq(conversationIntelligenceSessions.bookingId, briefedCallsLog.callId),
          eq(conversationIntelligenceSessions.engagementId, briefedCallsLog.engagementId)
        )
      )
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          isPast ? lt(briefedCallsLog.callTime, now) : gte(briefedCallsLog.callTime, now)
        )
      )
      .orderBy(isPast ? desc(briefedCallsLog.callTime) : asc(briefedCallsLog.callTime))
      .limit(50),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Meetings</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
        Everything tracked about calls, across every client — bookings as they come in, and briefs once Pre-Call Read has run.
      </p>

      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-900 mb-5">
        <a
          href="/dashboard/meetings"
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            !isPast ? "border-ink text-zinc-900 dark:text-zinc-100" : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          Upcoming
        </a>
        <a
          href="/dashboard/meetings?range=past"
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            isPast ? "border-ink text-zinc-900 dark:text-zinc-100" : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          Past
        </a>
      </div>

      <section className="mb-8">
        <div className="flex items-center gap-1.5 mb-2.5">
          <CalendarClock className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            On the calendar
          </h2>
        </div>
        {bookings.length === 0 ? (
          <div className="text-center py-10 text-zinc-400 dark:text-zinc-600 text-sm rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
            No {isPast ? "past" : "upcoming"} bookings tracked.
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-900 overflow-hidden bg-white dark:bg-zinc-900/30">
            {bookings.map((row) => (
              <Link
                key={row.id}
                href={`/dashboard/engagements/${row.engagementId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {row.prospectName || "Unnamed prospect"}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5">
                    {row.buyer}
                    {row.bookingPlatform ? ` · ${bookingPlatformLabel(row.bookingPlatform)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {row.status === "cancelled" ? (
                    <span className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                      <Ban className="w-3.5 h-3.5" />
                      Cancelled
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Scheduled
                    </span>
                  )}
                  <span className="text-xs font-mono text-zinc-400 dark:text-zinc-600 w-24 text-right">
                    {new Date(row.callTime).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Radio className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Briefed calls
          </h2>
        </div>
        {briefed.length === 0 ? (
          <div className="text-center py-10 text-zinc-400 dark:text-zinc-600 text-sm rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
            No {isPast ? "past" : "upcoming"} calls briefed.
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-900 overflow-hidden bg-white dark:bg-zinc-900/30">
            {briefed.map((row) => (
              <Link
                key={row.id}
                href={`/dashboard/engagements/${row.engagementId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {row.prospectName || "Unnamed prospect"}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5">{row.buyer}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {row.callSessionStatus && (
                    <span className={`flex items-center gap-1 text-[11px] font-medium ${CALL_SESSION_STATUS_COLORS[row.callSessionStatus] ?? "text-zinc-400"}`}>
                      <Radio className="w-3.5 h-3.5" />
                      {CALL_SESSION_STATUS_LABELS[row.callSessionStatus] ?? row.callSessionStatus}
                    </span>
                  )}
                  {row.briefDeliveredAt ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Briefed
                    </span>
                  ) : row.researchStatus === "failed" ? (
                    <span className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                      <XCircle className="w-3.5 h-3.5" />
                      Brief failed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-600">
                      <Clock className="w-3.5 h-3.5" />
                      No brief
                    </span>
                  )}
                  <span className="text-xs font-mono text-zinc-400 dark:text-zinc-600 w-24 text-right">
                    {new Date(row.callTime).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
