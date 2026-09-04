import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc, inArray, isNull, isNotNull, and } from "drizzle-orm";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getActiveWorkspace } from "@/lib/workspace";
import { isProductId, type ProductId } from "@/lib/product-catalog";
import { getRepEnrolledEngagementIds } from "@/lib/rep-engagements";
import { ClientRosterTable } from "./client-roster-table";

export const revalidate = 0;

/**
 * Product scoping, driven by the same `?product=` param Queue/Executions
 * already use. Every row here lives in the shared `engagements` table —
 * there's no separate per-product client list — so "is this client on
 * product X" comes from a signal that product's own onboarding already
 * writes, not a new membership table:
 *  - Showtime: /api/engagements/setup always sets `stack` (it rejects the
 *    request without booking_platform + email_platform) the same request
 *    that creates the row, so `stack` is never null for a Showtime client.
 *  - Reputation Manager: onboarding always writes a rep_identity_graphs
 *    row for the engagement (see /dashboard/reputation-manager/page.tsx,
 *    which uses the same join).
 * No `product` param means the combined roster — every client in the
 * workspace regardless of which product(s) it's enrolled in — which is
 * what Work's "Clients" link points at.
 */
export default async function EngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const { product } = await searchParams;
  const scopedProduct: ProductId | null = isProductId(product) ? product : null;

  const baseFilter = and(
    eq(engagements.whopUserId, whopUserId),
    eq(engagements.workspaceId, activeWorkspace.workspaceId),
    isNull(engagements.deletedAt)
  );

  let userEngagements;
  if (scopedProduct === "showtime") {
    userEngagements = await db
      .select()
      .from(engagements)
      .where(and(baseFilter, isNotNull(engagements.stack)));
  } else if (scopedProduct === "reputation-manager") {
    const repEngagementIds = await getRepEnrolledEngagementIds(whopUserId, activeWorkspace.workspaceId);
    userEngagements = repEngagementIds.length
      ? await db
          .select()
          .from(engagements)
          .where(and(baseFilter, inArray(engagements.engagementId, repEngagementIds)))
      : [];
  } else {
    userEngagements = await db.select().from(engagements).where(baseFilter);
  }

  const targetEngagementIds = userEngagements.map((e) => e.engagementId);

  const allRuns =
    targetEngagementIds.length > 0
      ? await db
          .select({
            engagementId: skillRuns.engagementId,
            skillName: skillRuns.skillName,
            status: skillRuns.status,
            completedAt: skillRuns.completedAt,
            startedAt: skillRuns.startedAt,
          })
          .from(skillRuns)
          .where(inArray(skillRuns.engagementId, targetEngagementIds))
          .orderBy(desc(skillRuns.startedAt))
      : [];

  // Fix: this list had no ORDER BY at all — row order was whatever
  // Postgres happened to return, which drifts as rows get updated
  // (a rename or tag-color change rewrites the row) and isn't the same
  // thing as "most active client at the top" a reader would reasonably
  // expect from a client portfolio. allRuns is already ordered by
  // startedAt desc, so each engagement's first appearance in it is that
  // engagement's most recent run — used as the primary sort key, with
  // engagements that have no runs yet falling back to createdAt desc
  // (newest client first) rather than being scattered arbitrarily.
  const mostRecentRunAt = new Map<string, Date>();
  for (const run of allRuns) {
    if (!mostRecentRunAt.has(run.engagementId)) {
      mostRecentRunAt.set(run.engagementId, run.startedAt);
    }
  }
  const sortedEngagements = [...userEngagements].sort((a, b) => {
    const aActivity = mostRecentRunAt.get(a.engagementId);
    const bActivity = mostRecentRunAt.get(b.engagementId);
    if (aActivity && bActivity) return bActivity.getTime() - aActivity.getTime();
    if (aActivity && !bActivity) return -1; // any client with real activity outranks one with none
    if (bActivity && !aActivity) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">
      {/* Asana Header Bar */}
      <div className="shrink-0 flex flex-col space-y-3 sm:flex-row sm:justify-between sm:items-center sm:space-y-0 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <div className="space-y-0.5">
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {scopedProduct === "showtime"
              ? "Showtime Clients"
              : scopedProduct === "reputation-manager"
                ? "Reputation Manager Clients"
                : "Client Portfolio"}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {scopedProduct
              ? `Clients enrolled in ${scopedProduct === "showtime" ? "Showtime" : "Reputation Manager"} in ${activeWorkspace.name}, most recently active first.`
              : `Every client across all installed products in ${activeWorkspace.name}, most recently active first.`}
          </p>
        </div>

        {/* <Link
          href="/dashboard/engagements/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 rounded-lg shadow-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.98] transition-all"
        >
          <Plus size={14} strokeWidth={2.5} />
          <span>Add Client</span>
        </Link> */}
      </div>

      {/* Empty State */}
      {userEngagements.length === 0 ? (
        <div className="h-40 border border-dashed border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-transparent rounded-xl flex flex-col items-center justify-center space-y-2 transition-colors mt-4">
          <p className="text-xs font-normal text-zinc-400 dark:text-zinc-500 font-mono">
            No active client engagements found in this workspace.
          </p>
          <Link
            href="/dashboard/engagements/new"
            className="text-xs font-semibold text-amber-500 hover:underline transition-colors"
          >
            Add your first client 
          </Link>
        </div>
      ) : (
        /* Asana Dense Table View Wrapper — fills the rest of the main
           content pane and scrolls internally so the header above stays
           put, instead of the roster trailing off and needing the whole
           page to scroll to reach clients further down the list. */
        <div className="flex-1 min-h-0 flex flex-col w-full mt-4">
          {/* Table Header Labels */}
          <div className="shrink-0 hidden md:flex items-center justify-between px-3 text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 pb-1">
            <span className="w-52">Client Name</span>
            <span className="flex-1 px-4">Connected Stack</span>
            <span className="w-44 text-center">Module Telemetry</span>
            <span className="w-24 text-right">Created</span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
            <ClientRosterTable engagements={sortedEngagements} runs={allRuns} />
          </div>
        </div>
      )}
    </div>
  );
}
