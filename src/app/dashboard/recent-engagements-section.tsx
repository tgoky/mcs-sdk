"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ChevronDown, List } from "lucide-react";
import { isSkillId, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";
import { SkillsNavList } from "@/components/skills-nav-list";

interface RecentEngagement {
  engagementId: string;
  buyer: string;
}

const SKILL_PAGE_PATTERN = /^\/dashboard\/engagements\/([^/]+)\/skills\/([^/]+)$/;

export function RecentEngagementsSection({ recent }: { recent: RecentEngagement[] }) {
  const pathname = usePathname();

  if (pathname === "/dashboard/engagements") {
    return (
      <>
        <div className="my-3 border-t border-zinc-200/80 dark:border-sidebar-border" />
        <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono tracking-wider">
         Installed Skills
        </div>
        <SkillsNavList />
      </>
    );
  }

  const skillMatch = SKILL_PAGE_PATTERN.exec(pathname);
  const skillIdParam = skillMatch?.[2];
  if (skillMatch && skillIdParam && isSkillId(skillIdParam)) {
    return (
      <SkillSiblingClients
        key={`${skillMatch[1]}:${skillIdParam}`}
        skillId={skillIdParam}
        currentEngagementId={skillMatch[1]}
      />
    );
  }

  return (
    <>
      <div className="my-3 border-t border-zinc-200/80 dark:border-sidebar-border" />
      <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono tracking-wider ">
        Recently Opened Clients
      </div>
      {recent.length > 0 ? (
        <nav className="flex flex-col gap-1">
          {recent.map((client) => (
            <Link
              key={client.engagementId}
              href={`/dashboard/engagements/${client.engagementId}`}
              className="group flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 hover:bg-[#e7e7eb] dark:hover:bg-zinc-800/60 transition-all duration-150"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-[8px] bg-amber-400 dark:bg-[#b4a7f5] text-zinc-950 flex items-center justify-center shrink-0 shadow-xs">
                  <List className="w-4 h-4 stroke-[2.5]" />
                </div>
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100 group-hover:text-zinc-950 dark:group-hover:text-white truncate">
                  {client.buyer}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-all shrink-0" />
            </Link>
          ))}
        </nav>
      ) : (
        <p className="px-2.5 py-1 text-xs text-zinc-500 dark:text-zinc-400">No engagements yet.</p>
      )}
    </>
  );
}

function SkillSiblingClients({ skillId, currentEngagementId }: { skillId: SkillId; currentEngagementId: string }) {
  const [clients, setClients] = useState<RecentEngagement[] | null>(null);
  const manifest = SKILL_MANIFEST[skillId];

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/modules/${skillId}/clients?exclude=${encodeURIComponent(currentEngagementId)}`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : { clients: [] }))
      .then((data) => {
        if (!cancelled) setClients(Array.isArray(data.clients) ? data.clients : []);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });

    return () => {
      cancelled = true;
    };
  }, [skillId, currentEngagementId]);

  return (
    <>
      <div className="my-3 border-t border-zinc-200/80 dark:border-sidebar-border" />

      {/* Header */}
      <div className="px-2.5 pb-2 text-[11px] font-mono font-semibold text-zinc-600 dark:text-zinc-400 tracking-wider flex items-center justify-between">
        <span>{manifest.name}</span>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
      </div>

      {clients === null ? (
        <div className="flex flex-col gap-1.5 px-2.5 py-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 rounded-xl bg-zinc-200/60 dark:bg-zinc-800/40 animate-pulse" />
          ))}
        </div>
      ) : clients.length > 0 ? (
        <nav className="flex flex-col gap-1">
          {clients.map((client) => (
            <Link
              key={client.engagementId}
              href={`/dashboard/engagements/${client.engagementId}/skills/${skillId}`}
              className="group flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 hover:bg-[#e7e7eb] dark:hover:bg-zinc-800/60 transition-all duration-150"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-[8px] bg-amber-400 dark:bg-[#b4a7f5] text-zinc-950 flex items-center justify-center shrink-0 shadow-xs">
                  <List className="w-4 h-4 stroke-[2.5]" />
                </div>
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100 group-hover:text-zinc-950 dark:group-hover:text-white truncate">
                  {client.buyer}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-all shrink-0" />
            </Link>
          ))}
        </nav>
      ) : (
        <p className="px-2.5 py-1 text-xs text-zinc-500 dark:text-zinc-400 italic font-mono">
          No active clients.
        </p>
      )}

      <div className="my-3 border-t border-zinc-200/80 dark:border-sidebar-border" />

      {/* View All CTA */}
     <Link
  href={`/dashboard/modules/${skillId}`}
  className="group flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all duration-200"
>
  <span className="text-xs font-mono tracking-tight transition-colors">
    view all
  </span>

</Link>
    </>
  );
}