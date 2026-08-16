"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ArrowRight, Users, Sparkles } from "lucide-react";
import { isSkillId, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";
import { SkillsNavList } from "@/components/skills-nav-list";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";

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
        <div className="my-3 border-t border-sidebar-border" />
        <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-amber-400/80" />
          <span>Skills</span>
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
      <div className="my-3 border-t border-sidebar-border" />
      <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase flex items-center gap-1.5">
        <Users className="w-3 h-3 text-zinc-400" />
        <span>Recent</span>
      </div>
      {recent.length > 0 ? (
        <nav className="flex flex-col gap-1">
          {recent.map((client) => (
            <Link
              key={client.engagementId}
              href={`/dashboard/engagements/${client.engagementId}`}
              className="group flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border border-transparent hover:border-zinc-700/40 transition-all duration-200"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-5 h-5 shrink-0 rounded-md bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-[9px] font-black text-zinc-950 shadow-xs">
                  {client.buyer.slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate group-hover:translate-x-0.5 transition-transform duration-200 font-sans">
                  {client.buyer}
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-zinc-300 transition-all shrink-0" />
            </Link>
          ))}
        </nav>
      ) : (
        <p className="px-2.5 py-1 text-xs text-zinc-400 dark:text-zinc-600">No engagements yet.</p>
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
      <div className="my-3 border-t border-sidebar-border" />
      <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase flex items-center gap-1.5">
        <Users className="w-3 h-3 text-zinc-400" />
        <span>Other clients · {manifest.name}</span>
      </div>

      {clients === null ? (
        <div className="flex flex-col gap-1.5 px-2.5 py-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 rounded-xl bg-zinc-800/40 animate-pulse" />
          ))}
        </div>
      ) : clients.length > 0 ? (
        <nav className="flex flex-col gap-1">
          {clients.map((client) => (
            <Link
              key={client.engagementId}
              href={`/dashboard/engagements/${client.engagementId}/skills/${skillId}`}
              title={`${client.buyer} — ${manifest.name}`}
              className="group flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border border-transparent hover:border-zinc-700/40 transition-all duration-200"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <SquishySkillBadge skill={skillId} size={20} enabled={true} />
                <span className="truncate group-hover:translate-x-0.5 transition-transform duration-200 font-sans">
                  {client.buyer}
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-zinc-300 transition-all shrink-0" />
            </Link>
          ))}
        </nav>
      ) : (
        <p className="px-2.5 py-1 text-xs text-zinc-500 dark:text-zinc-500 italic font-mono">
          No other clients active.
        </p>
      )}

      <div className="my-3 border-t border-sidebar-border" />
      <Link
        href={`/dashboard/modules/${skillId}`}
        className="group flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-100 bg-zinc-900/40 hover:bg-zinc-800/60 border border-zinc-800/80 hover:border-zinc-700/60 transition-all duration-200 shadow-2xs"
      >
        <span>View all {manifest.name} clients</span>
        <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-200 group-hover:translate-x-0.5 transition-all shrink-0" />
      </Link>
    </>
  );
}