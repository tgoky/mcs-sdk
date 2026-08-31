import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq, isNull, asc } from "drizzle-orm";
import { FileText } from "lucide-react";
import { ReportsClientLinks, type ReportableClient } from "./reports-client-links";

// Shared with page.tsx, which needs the same list to resolve the selected
// client server-side — one query, not two independently-written copies of
// the same where-clause drifting apart later.
export async function listReportableClients(whopUserId: string, workspaceId: string): Promise<ReportableClient[]> {
  return db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt)))
    .orderBy(asc(engagements.buyer));
}

/**
 * The Reports section's secondary sidebar. Used to fall through to the
 * generic Work sidebar (Home/Reports-link/Queue/Executions + Installed
 * Skills) with no client awareness at all — the client picker lived as a
 * wrapped row of pill buttons inside the page content instead, the one
 * place in the app that didn't follow the sidebar-driven-selection
 * pattern everything else (Engagements, Calendar's day inspector) uses.
 */
export async function ReportsSidebar({ whopUserId, workspaceId }: { whopUserId: string; workspaceId: string }) {
  const clients = await listReportableClients(whopUserId, workspaceId);

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-3 text-center">
        <FileText className="w-5 h-5 text-zinc-300 dark:text-zinc-700" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">No clients yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono tracking-wider uppercase">
        Clients
      </div>
      <ReportsClientLinks clients={clients} />
    </div>
  );
}

/** Static skeleton fallback for Suspense boundary */
export function ReportsSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      <div className="h-3 w-14 mx-2.5 mb-2 rounded-sm bg-zinc-200/60 dark:bg-zinc-800" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-9 rounded-[10px] bg-zinc-100 dark:bg-zinc-900/60" />
      ))}
    </div>
  );
}
