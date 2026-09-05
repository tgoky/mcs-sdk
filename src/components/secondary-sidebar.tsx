"use client";

import { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isRepSkillId } from "@/lib/rep-skill-manifest";

interface SecondarySidebarProps {
  work: ReactNode;
  settings: ReactNode;
  reputationManager: ReactNode;
  showtime: ReactNode;
}

type SectionKey = "reputation-manager" | "showtime" | "settings" | "work";

// /dashboard/modules and /dashboard/engagements are deliberately NOT in
// this static table — both are shared across products (see
// activeSection's own handling below) and a blanket prefix->showtime
// mapping for either was a real, previously-invisible bug: this file
// duplicates primary-rail.tsx's activeSectionHref (same concept, two
// unsynced implementations — worth unifying at some point, not done
// here to keep this fix minimal) and had the identical hardcoded
// "every /dashboard/modules/* path is Showtime" rule, which only ever
// mattered once Reputation Manager's module hub became reachable.
const SECTION_PREFIXES: Array<{ key: SectionKey; prefix: string }> = [
  { key: "reputation-manager", prefix: "/dashboard/reputation-manager" },
  { key: "showtime", prefix: "/dashboard/showtime" },
  { key: "showtime", prefix: "/dashboard/meetings" },
  { key: "showtime", prefix: "/dashboard/analytics" },
  { key: "settings", prefix: "/dashboard/settings" },
  { key: "showtime", prefix: "/dashboard/reports" },
];

function activeSection(pathname: string, fromParam: string | null): SectionKey {
  // /dashboard/modules/[skill] serves both catalogs — which section
  // shows depends on which catalog the skill segment belongs to.
  if (pathname.startsWith("/dashboard/modules/")) {
    const skillSegment = pathname.slice("/dashboard/modules/".length);
    return isRepSkillId(skillSegment) ? "reputation-manager" : "showtime";
  }

  // /dashboard/engagements/[id] is one shared detail page for both
  // products — there's no single right answer from the path alone.
  // `from` carries where the visit actually came from (set by
  // ModuleClientRoster's hrefFor); trust it when it points at an RM
  // module, default to Showtime otherwise (the original assumption,
  // correct for a bare/bookmarked engagement link since every engagement
  // is a Showtime client by construction — see rep-engagements.ts).
  if (pathname.startsWith("/dashboard/engagements/")) {
    if (fromParam?.startsWith("/dashboard/modules/")) {
      const skillSegment = fromParam.slice("/dashboard/modules/".length);
      if (isRepSkillId(skillSegment)) return "reputation-manager";
    }
    return "showtime";
  }
  if (pathname === "/dashboard/engagements") return "showtime";

  const match = SECTION_PREFIXES.filter(
    (s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.key ?? "work";
}

const SECTION_LABELS: Record<SectionKey, string> = {
  work: "Work",
  showtime: "Showtime",
  "reputation-manager": "Reputation Manager",
  settings: "Settings",
};

export function SecondarySidebar({
  work,
  settings,
  reputationManager,
  showtime,
}: SecondarySidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Library is intentionally a single-page marketplace.
  if (
    pathname === "/dashboard/library" ||
    pathname.startsWith("/dashboard/library/")
  ) {
    return null;
  }

  const scopedProduct = searchParams.get("product");
  // Mirrors primary-rail.tsx's PRODUCT_SCOPED_ROOTS — the Engagements
  // list route is shared across products and scoped by `?product=`
  // rather than owning its own path, same as Queue/Executions already are.
  const isProductScopedRoot = pathname === "/dashboard/queue" || pathname === "/dashboard/runs" || pathname === "/dashboard/engagements";
  const section: SectionKey =
    isProductScopedRoot && scopedProduct === "reputation-manager"
      ? "reputation-manager"
      : isProductScopedRoot && scopedProduct === "showtime"
        ? "showtime"
        : isProductScopedRoot
          ? "work"
          : activeSection(pathname, searchParams.get("from"));

  const content: Record<SectionKey, ReactNode> = {
    work,
    showtime,
    "reputation-manager": reputationManager,
    settings,
  };

  return (
    <aside className="w-60 bg-[#f8f7fa] dark:bg-sidebar border-r border-zinc-200/80 dark:border-sidebar-border flex flex-col shrink-0 select-none py-3 px-2 overflow-y-auto font-sans antialiased text-zinc-700 dark:text-zinc-300">
      {/* Dynamic Section Header Title with theme support */}
      <div className="px-3 pt-1 pb-2 text-[14px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
        {SECTION_LABELS[section]}
      </div>
      <div className="flex-1">{content[section]}</div>
    </aside>
  );
}
