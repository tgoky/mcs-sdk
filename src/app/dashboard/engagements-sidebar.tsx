import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import Link from "next/link";
import { Building2, Plus, Radio } from "lucide-react";
import { RecentEngagementsSection } from "./recent-engagements-section";

/**
 * The Engagements section's secondary sidebar.
 * Queries recent client engagements and provides action links.
 */
export async function EngagementsSidebar({
  whopUserId,
  workspaceId,
}: {
  whopUserId: string;
  workspaceId: string;
}) {
  const recent = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        eq(engagements.workspaceId, workspaceId),
        isNull(engagements.deletedAt)
      )
    )
    .orderBy(desc(engagements.createdAt))
    .limit(5);

  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/dashboard/engagements"
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs border border-zinc-200/60 dark:border-transparent transition-all"
      >
        <Building2 className="w-4 h-4 text-zinc-900 dark:text-white shrink-0" />
        <span>All Engagements</span>
      </Link>

      <div className="my-3 border-t border-zinc-200/80 dark:border-sidebar-border" />

      <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono tracking-wider uppercase">
        Actions
      </div>

      <nav className="flex flex-col gap-0.5">
        <Link
          href="/dashboard/engagements/new"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-400 hover:bg-[#dfd7ea] dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <Plus className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <span>Create a client</span>
        </Link>

        <Link
          href="/dashboard/engagements"
          title="Recall.ai is connected per-client from their Call Intelligence tab — open a client to connect it"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-400 hover:bg-[#dfd7ea] dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <Radio className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <span className="flex flex-col">
            <span>Connect provider</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">per client</span>
          </span>
        </Link>
      </nav>

      <RecentEngagementsSection recent={recent} />
    </div>
  );
}

/** Static skeleton fallback for Suspense boundary */
export function EngagementsSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 animate-pulse">
      <div className="h-9 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-transparent" />
      <div className="my-3 border-t border-zinc-200/80 dark:border-sidebar-border" />
      {["Create a client", "Connect provider"].map((label) => (
        <div key={label} className="flex items-center gap-2.5 px-2.5 py-2 text-sm">
          <div className="w-4 h-4 rounded bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <span className="text-zinc-400 dark:text-zinc-600">{label}</span>
        </div>
      ))}
    </div>
  );
}