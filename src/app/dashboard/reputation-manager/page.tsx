import Link from "next/link";
import { Plus, Shield } from "lucide-react";
import { db } from "@/lib/db";
import { engagements, repIdentityGraphs } from "@/models/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Reputation Manager's own space — the landing page behind its
 * primary-rail entry. Lists every engagement in this workspace that
 * actually has an identity graph (i.e., rep-onboarding has run for
 * them), independent of whether that same client also happens to be a
 * Showtime client. First real page a click into a product's rail icon
 * lands on in this app — Counter Claim still doesn't have one.
 */
export default async function ReputationManagerHomePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);

  const rows = await db
    .select({
      engagementId: engagements.engagementId,
      buyer: engagements.buyer,
      label: engagements.label,
      operatorName: repIdentityGraphs.operatorName,
      entityCount: repIdentityGraphs.entities,
      createdAt: repIdentityGraphs.createdAt,
    })
    .from(repIdentityGraphs)
    .innerJoin(engagements, eq(repIdentityGraphs.engagementId, engagements.engagementId))
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId),
        isNull(engagements.deletedAt)
      )
    )
    .orderBy(desc(repIdentityGraphs.createdAt));

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Reputation Manager</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {rows.length === 0
              ? "No clients set up yet."
              : `${rows.length} client${rows.length === 1 ? "" : "s"} being monitored.`}
          </p>
        </div>
        <Link
          href="/dashboard/reputation-manager/new"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> New client
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center">
          <Shield className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Set up identity monitoring for a client to get started — either a brand-new client, or one you&apos;re
            already running through Showtime.
          </p>
          <Link
            href="/dashboard/reputation-manager/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="w-3.5 h-3.5" /> New client
          </Link>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <Link
              key={row.engagementId}
              href={`/dashboard/engagements/${row.engagementId}`}
              className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{row.buyer}</p>
                  {row.label && <span className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{row.label}</span>}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Operator: {row.operatorName}
                  {Array.isArray(row.entityCount) && row.entityCount.length > 0
                    ? ` · ${row.entityCount.length} entit${row.entityCount.length === 1 ? "y" : "ies"}`
                    : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
