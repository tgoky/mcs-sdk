import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { computeClientReportAllPeriods } from "@/features/reports/server/report-service";
import { generateReportNote } from "@/features/reports/server/report-notes";
import { ClientReportCard } from "@/components/client-report-card";
import { listReportableClients } from "./reports-sidebar";
import { FileText } from "lucide-react";

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

  const clients = await listReportableClients(whopUserId, activeWorkspace.workspaceId);

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
        selected &&
        reportMetrics && (
          <ClientReportCard
            buyerName={selected.buyer}
            metricsByPeriod={reportMetrics}
            notesByPeriod={{ week: weekNote, month: monthNote }}
          />
        )
      )}
    </div>
  );
}
