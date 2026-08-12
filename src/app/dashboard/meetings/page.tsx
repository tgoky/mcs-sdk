import { db } from "@/lib/db";
import { briefedCallsLog, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, and, gte, lt, asc, desc } from "drizzle-orm";
import Link from "next/link";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Built entirely on briefedCallsLog (already populated by the Pre-Call
 * Read skill for every call it's briefed) joined to engagements for the
 * client name — no calendar/meetings table exists yet, so "upcoming" and
 * "past" are derived from callTime vs. now rather than a synced calendar
 * feed. If GHL/Calendly/Cal.com calendar sync ever writes its own table,
 * this is the page to point at it instead.
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

  const rows = await db
    .select({
      id: briefedCallsLog.id,
      callTime: briefedCallsLog.callTime,
      prospectName: briefedCallsLog.prospectName,
      briefDeliveredAt: briefedCallsLog.briefDeliveredAt,
      researchStatus: briefedCallsLog.researchStatus,
      engagementId: briefedCallsLog.engagementId,
      buyer: engagements.buyer,
    })
    .from(briefedCallsLog)
    .innerJoin(engagements, eq(engagements.engagementId, briefedCallsLog.engagementId))
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        isPast ? lt(briefedCallsLog.callTime, now) : gte(briefedCallsLog.callTime, now)
      )
    )
    .orderBy(isPast ? desc(briefedCallsLog.callTime) : asc(briefedCallsLog.callTime))
    .limit(50);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Meetings</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
        Calls tracked through Pre-Call Read, across every client.
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

      {rows.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 dark:text-zinc-600 text-sm">
          No {isPast ? "past" : "upcoming"} calls tracked.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-900 overflow-hidden bg-white dark:bg-zinc-900/30">
          {rows.map((row) => (
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
    </div>
  );
}
