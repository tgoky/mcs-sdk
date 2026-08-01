import Link from "next/link";
import { Zap } from "lucide-react";
import { SidebarSkills, SidebarSkillsSkeleton } from "./sidebar-skills";

/**
 * The "Skills" section's secondary sidebar. The five-skill status list
 * (pin-down/pile-on/pre-call-read/win-back/leak-map with live/failed/running
 * indicators) already existed as SidebarSkills, bolted onto the bottom of
 * every single Work page. It's genuinely skills content, so it moves here
 * wholesale rather than being rebuilt — same data, same component, just
 * scoped to its own primary-rail section now instead of showing everywhere.
 */
export async function SkillsSidebar({ whopUserId }: { whopUserId: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/dashboard/skills"
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900 transition-all"
      >
     
     
      </Link>

      <div className="mt-3">
        <SidebarSkills whopUserId={whopUserId} />
      </div>
    </div>
  );
}

export function SkillsSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 animate-pulse">
      <div className="h-9 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
      <div className="mt-3">
        <SidebarSkillsSkeleton />
      </div>
    </div>
  );
}
