import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import Link from "next/link";
import { Building2, Plus, FolderPlus, RotateCcw, Radio } from "lucide-react";
import { RecentEngagementsSection } from "./recent-engagements-section";

/**
 * The "Engagements" section's secondary sidebar. Unlike Work's sidebar
 * (which is a nav list), this one is action-first — matching the pattern
 * Anthony pointed at in the Asana "Agents" screenshot (a pinned primary
 * item up top, then a block of things you can *do*, then a Recent list).
 * "All Engagements" is pinned since it's still the main list view; the
 * Actions block below routes straight into the flows those actions
 * actually live at today.
 */
export async function EngagementsSidebar({ whopUserId }: { whopUserId: string }) {
  const recent = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), isNull(engagements.deletedAt)))
    .orderBy(desc(engagements.createdAt))
    .limit(5);

  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/dashboard/engagements"
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900 transition-all"
      >
        <Building2 className="w-4 h-4 text-ink dark:text-ink-hover" />
        <span>All Engagements</span>
      </Link>

      <div className="my-3 border-t border-sidebar-border" />

      <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase">
        Actions
      </div>

      <nav className="flex flex-col gap-0.5">
        <Link
          href="/dashboard/engagements/new"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <Plus className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span>Create a client</span>
        </Link>

        <Link
          href="/dashboard/projects/new"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <FolderPlus className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span>Create project</span>
        </Link>

        <Link
          href="/dashboard/modules/win-back"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <RotateCcw className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span>Initialize Win-Back</span>
        </Link>

        <Link
          href="/dashboard/engagements"
          title="Recall.ai is connected per-client from their Call Intelligence tab — open a client to connect it"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <Radio className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span className="flex flex-col">
            <span>Connect provider</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-normal">per client</span>
          </span>
        </Link>
      </nav>

      <RecentEngagementsSection recent={recent} />
    </div>
  );
}

export function EngagementsSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 animate-pulse">
      <div className="h-9 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
      <div className="my-3 border-t border-sidebar-border" />
      {["Create a client", "Create project", "Initialize Win-Back", "Connect provider"].map((label) => (
        <div key={label} className="flex items-center gap-2.5 px-2.5 py-2 text-sm">
          <div className="w-4 h-4 rounded bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <span className="text-zinc-300 dark:text-zinc-700">{label}</span>
        </div>
      ))}
    </div>
  );
}
