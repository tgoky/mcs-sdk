import { SidebarSkills, SidebarSkillsSkeleton } from "./sidebar-skills";

/**
 * The "Skills" section's secondary sidebar widget.
 * Renders ONLY the live SKILL STATUS list without any top button/header.
 */
export async function SkillsSidebar({ whopUserId }: { whopUserId: string }) {
  return (
    <div>
      <SidebarSkills whopUserId={whopUserId} />
    </div>
  );
}

export function SkillsSidebarSkeleton() {
  return (
    <div>
      <SidebarSkillsSkeleton />
    </div>
  );
}