import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { engagements, repIncidents } from "@/models/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { getRepEnrolledEngagementIds } from "@/lib/rep-engagements";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_STYLES: Record<string, string> = {
  open: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400",
  acknowledged: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400",
  resolved: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400",
};

/**
 * Reputation Manager's Meetings-equivalent primary-rail destination —
 * Meetings has no RM analogue (nothing here is call-based), so this fills
 * that rail slot with the thing RM clients actually care about: declared
 * incidents (rep-crisis-response's output, rep_incidents), across every
 * RM-enrolled client in the workspace.
 */
export default async function ReputationManagerIncidentsPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  if (!(await isPackageInstalledInWorkspace(activeWorkspace.workspaceId, "reputation-manager"))) {
    redirect("/dashboard/library");
  }

  const engagementIds = await getRepEnrolledEngagementIds(whopUserId, activeWorkspace.workspaceId);

  const incidents = engagementIds.length
    ? await db
        .select({
          id: repIncidents.id,
          engagementId: repIncidents.engagementId,
          severityScore: repIncidents.severityScore,
          summary: repIncidents.summary,
          status: repIncidents.status,
          declaredAt: repIncidents.declaredAt,
          buyer: engagements.buyer,
        })
        .from(repIncidents)
        .innerJoin(engagements, eq(engagements.engagementId, repIncidents.engagementId))
        .where(inArray(repIncidents.engagementId, engagementIds))
        .orderBy(desc(repIncidents.declaredAt))
    : [];

  return (
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">
      <div className="shrink-0 flex flex-col space-y-0.5 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Incidents</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Every incident rep-crisis-response has declared across Reputation Manager clients in {activeWorkspace.name}, most recent first.
        </p>
      </div>

      {incidents.length === 0 ? (
        <div className="h-40 border border-dashed border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-transparent rounded-xl flex flex-col items-center justify-center space-y-2 transition-colors mt-4">
          <ShieldCheck className="w-6 h-6 text-emerald-400 dark:text-emerald-600" />
          <p className="text-xs font-normal text-zinc-400 dark:text-zinc-500 font-mono">
            No incidents declared — every monitored client is clean right now.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 mt-4 pr-0.5">
          {incidents.map((incident) => (
            <Link
              key={incident.id}
              href={`/dashboard/engagements/${incident.engagementId}`}
              className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-rose-500 dark:text-rose-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{incident.buyer}</p>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">severity {incident.severityScore}</span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{incident.summary}</p>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[incident.status] ?? STATUS_STYLES.open}`}
              >
                {incident.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
