import { db } from "@/lib/db";
import { repIdentityGraphs } from "@/models/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { computeClientReportAllPeriods } from "@/features/reports/server/report-service";
import { generateReportNote } from "@/features/reports/server/report-notes";
import { ClientReportCard } from "@/components/client-report-card";
import { computeRepClientReportAllPeriods } from "@/features/reputation-manager/server/rep-report-service";
import { RepClientReportCard } from "@/components/rep-client-report-card";
import { listReportableClients, isProductId } from "./reports-sidebar";
import { FileText } from "lucide-react";

export const revalidate = 0;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; product?: string }>;
}) {
  const { client: selectedFromQuery, product } = await searchParams;
  const scopedProduct = isProductId(product) ? product : null;
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);

  const clients = await listReportableClients(whopUserId, activeWorkspace.workspaceId, scopedProduct);

  const selected = clients.find((c) => c.engagementId === selectedFromQuery) ?? clients[0] ?? null;

  // Which product this specific client is actually enrolled in — this used
  // to always render Showtime's ClientReportCard regardless, so a pure-RM
  // client (booking_platform never set, no Showtime activity at all) got a
  // real card whose every stat read zero. Same repIdentityGraphRow signal
  // the engagement page itself gates RepSkillsPanel/RepClientReportCard on.
  const [repIdentityGraphRow] = selected
    ? await db
        .select({ operatorName: repIdentityGraphs.operatorName, soleAuthorityName: repIdentityGraphs.soleAuthorityName })
        .from(repIdentityGraphs)
        .where(eq(repIdentityGraphs.engagementId, selected.engagementId))
        .limit(1)
    : [];

  const showtimeMetrics = selected && !repIdentityGraphRow && selected.bookingPlatform ? await computeClientReportAllPeriods(selected.engagementId) : null;
  const [weekNote, monthNote] = showtimeMetrics
    ? await Promise.all([
        generateReportNote(selected.engagementId, "week", showtimeMetrics.week),
        generateReportNote(selected.engagementId, "month", showtimeMetrics.month),
      ])
    : [null, null];

  const repMetrics = selected && repIdentityGraphRow ? await computeRepClientReportAllPeriods(selected.engagementId) : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Reports</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-2xl">
          {scopedProduct === "showtime"
            ? "How each client is performing — bookings, show-up rate, and outreach results."
            : scopedProduct === "reputation-manager"
              ? "How each client's reputation looks online — mentions, sentiment, and anything flagged for review."
              : "How each client is doing, one at a time. Comparing multiple clients at once? See Analytics."}
        </p>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {scopedProduct === "showtime"
              ? "No Showtime clients yet."
              : scopedProduct === "reputation-manager"
                ? "No Reputation Manager clients yet."
                : "No clients yet."}
          </p>
        </div>
      ) : (
        <>
          {/* Always the same name the sidebar picker shows for this client
              (engagements.buyer) — RepClientReportCard's own heading is
              operatorName, a separate field on the identity graph that can
              read completely differently (a person's name vs. the client/
              business name), so switching clients in the sidebar could
              land on a card whose heading didn't match what was just
              clicked. This is the one label guaranteed to agree with the
              picker no matter which product's card renders below it. */}
          {(repMetrics && repIdentityGraphRow) || (showtimeMetrics && selected) ? (
            selected && <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selected.buyer}</p>
          ) : null}
          {repMetrics && repIdentityGraphRow ? (
            <RepClientReportCard
              operatorName={repIdentityGraphRow.operatorName}
              soleAuthorityName={repIdentityGraphRow.soleAuthorityName}
              metricsByPeriod={repMetrics}
            />
          ) : showtimeMetrics && selected ? (
            <ClientReportCard
              buyerName={selected.buyer}
              metricsByPeriod={showtimeMetrics}
              notesByPeriod={{ week: weekNote, month: monthNote }}
            />
          ) : (
            <div className="text-center py-8">
              <FileText className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {selected?.buyer ?? "This client"} isn&apos;t set up under Showtime or Reputation Manager yet — nothing to report.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
