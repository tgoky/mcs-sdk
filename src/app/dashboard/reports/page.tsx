import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, and, isNull, asc } from "drizzle-orm";
import { getActiveWorkspace } from "@/lib/workspace";
import { computeClientReportAllPeriods } from "@/features/reports/server/report-service";
import { generateReportNote } from "@/features/reports/server/report-notes";
import { ClientReportCard } from "@/components/client-report-card";
import Link from "next/link";
import { FileText, Building2 } from "lucide-react";

export const revalidate = 0;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: selectedFromQuery } = await searchParams;
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);

  const clients = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId),
        isNull(engagements.deletedAt)
      )
    )
    .orderBy(asc(engagements.buyer));

  const selected = clients.find((c) => c.engagementId === selectedFromQuery) ?? clients[0] ?? null;

  const reportMetrics = selected ? await computeClientReportAllPeriods(selected.engagementId) : null;
  const [weekNote, monthNote] = reportMetrics
    ? await Promise.all([
        generateReportNote(selected.engagementId, "week", reportMetrics.week),
        generateReportNote(selected.engagementId, "month", reportMetrics.month),
      ])
    : [null, null];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Reports</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-2xl">
          A per-client quality breakdown — bookings, show rate, Win-Back recovery, approvals — not portfolio-wide
          trends. For cross-client charts, see Analytics.
        </p>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/50 p-8 text-center">
          <FileText className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No clients yet.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {clients.map((c) => (
              <Link
                key={c.engagementId}
                href={`/dashboard/reports?client=${c.engagementId}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  selected?.engagementId === c.engagementId
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                    : "bg-white dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                <Building2 className="w-3 h-3" /> {c.buyer}
              </Link>
            ))}
          </div>

          {selected && reportMetrics && (
            <ClientReportCard
              buyerName={selected.buyer}
              metricsByPeriod={reportMetrics}
              notesByPeriod={{ week: weekNote, month: monthNote }}
            />
          )}
        </>
      )}
    </div>
  );
}
