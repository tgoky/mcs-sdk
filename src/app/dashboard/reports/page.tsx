// src/app/dashboard/reports/page.tsx
//
// Since-audit rebuild. Two real problems, both from before one workspace
// meant one client:
//
// 1. The exclusivity bug: `!repIdentityGraphRow && selected.bookingPlatform`
//    gated Showtime's card off entirely whenever an RM identity graph
//    existed — even for a client running both products, who'd only ever
//    see the RM card. The engagement page's own report section (see
//    engagements/[id]/page.tsx) already renders both cards independently
//    when both apply; this page just hadn't matched that.
// 2. `listReportableClients`/`?client=`/`?product=` existed to support a
//    client picker — reports-sidebar-section.tsx's own "Client Reports"
//    list — that's been unrouted since the secondary-sidebar collapse
//    (one Work sidebar now, no more per-product variant). With no picker
//    left anywhere to set `?client=`, this always silently fell through
//    to clients[0] — which only ever "worked" because there's now
//    genuinely one client to fall through to. Replaced with resolving
//    that one client directly.

import { db } from "@/lib/db";
import { engagements, repIdentityGraphs } from "@/models/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, getPrimaryEngagementIdForWorkspace } from "@/lib/workspace";
import { computeClientReportAllPeriods } from "@/features/reports/server/report-service";
import { generateReportNote } from "@/features/reports/server/report-notes";
import { ClientReportCard } from "@/components/client-report-card";
import { computeRepClientReportAllPeriods } from "@/features/reputation-manager/server/rep-report-service";
import { RepClientReportCard } from "@/components/rep-client-report-card";
import { FileText } from "lucide-react";

export const revalidate = 0;

export default async function ReportsPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const engagementId = await getPrimaryEngagementIdForWorkspace(activeWorkspace.workspaceId);

  const [engagement] = engagementId
    ? await db
        .select({ buyer: engagements.buyer, stack: engagements.stack, offerDetails: engagements.offerDetails })
        .from(engagements)
        .where(eq(engagements.engagementId, engagementId))
        .limit(1)
    : [];

  const [repIdentityGraphRow] = engagementId
    ? await db
        .select({ operatorName: repIdentityGraphs.operatorName, soleAuthorityName: repIdentityGraphs.soleAuthorityName })
        .from(repIdentityGraphs)
        .where(eq(repIdentityGraphs.engagementId, engagementId))
        .limit(1)
    : [];

  const bookingPlatform = (engagement?.stack as { booking_platform?: string } | null)?.booking_platform ?? null;

  // Independent, not exclusive — a client running both products gets
  // both cards, matching how the engagement page's own report section
  // already renders them.
  const showtimeMetrics = engagementId && bookingPlatform ? await computeClientReportAllPeriods(engagementId) : null;
  const [weekNote, monthNote] = showtimeMetrics
    ? await Promise.all([
        generateReportNote(engagementId!, "week", showtimeMetrics.week),
        generateReportNote(engagementId!, "month", showtimeMetrics.month),
      ])
    : [null, null];

  const repMetrics = engagementId && repIdentityGraphRow ? await computeRepClientReportAllPeriods(engagementId) : null;

  const hasAnyReport = Boolean(showtimeMetrics || repMetrics);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Reports</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-2xl">
          How this client is doing — bookings and outreach, reputation signals, or both, depending on what&apos;s
          enabled. Comparing across skills? See Analytics.
        </p>
      </div>

      {!engagement ? (
        <div className="text-center py-8">
          <FileText className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No client yet in this workspace.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{engagement.buyer}</p>

          {!hasAnyReport ? (
            <div className="text-center py-8">
              <FileText className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {engagement.buyer} isn&apos;t set up under Showtime or Reputation Manager yet — nothing to report.
              </p>
            </div>
          ) : (
            <>
              {showtimeMetrics && (
                <ClientReportCard
                  buyerName={engagement.buyer}
                  metricsByPeriod={showtimeMetrics}
                  notesByPeriod={{ week: weekNote, month: monthNote }}
                  offerDetails={engagement.offerDetails as Record<string, string | boolean> | null}
                />
              )}
              {repMetrics && repIdentityGraphRow && (
                <RepClientReportCard
                  operatorName={repIdentityGraphRow.operatorName}
                  soleAuthorityName={repIdentityGraphRow.soleAuthorityName}
                  metricsByPeriod={repMetrics}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
