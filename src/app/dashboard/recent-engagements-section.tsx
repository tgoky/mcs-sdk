"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { isSkillId, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";
import { SkillsNavList } from "@/components/skills-nav-list";

interface RecentEngagement {
  engagementId: string;
  buyer: string;
}

// Matches /dashboard/engagements/eng_x/skills/pre-call-read — the 4 static
// per-skill client routes (leak-map, pile-on, pre-call-read, win-back; see
// src/app/dashboard/engagements/[id]/skills/*), not the /bridges/[skill]
// setup routes, which are a different concept (credentials/config, not a
// client+skill view) and keep the generic Recent behavior below.
const SKILL_PAGE_PATTERN = /^\/dashboard\/engagements\/([^/]+)\/skills\/([^/]+)$/;

/**
 * Recent clients — hidden specifically on the exact Engagements list page
 * (/dashboard/engagements), since that page's own main panel already
 * shows the full client list; a second copy of it here was pure
 * duplication. Shown on a client's detail page (no skill picked yet),
 * where the sidebar is the only quick way to jump to a different client
 * without backing all the way out to the list.
 *
 * On the exact list page, this space shows quick links into each skill's
 * holistic client roster instead (SkillsNavList, shared with WorkSidebar
 * so the two can't drift into separately-hardcoded skill lists).
 *
 * On a client+skill page (.../skills/pre-call-read), it shows the *other*
 * clients that also have this specific skill active, not the generic
 * most-recently-created list — jumping from Mudd Ventures' Call Brief used
 * to land you on whichever 5 clients happened to be newest, including ones
 * that don't even have Call Brief on. See SkillSiblingClients below.
 */
export function RecentEngagementsSection({ recent }: { recent: RecentEngagement[] }) {
  const pathname = usePathname();

  if (pathname === "/dashboard/engagements") {
    return (
      <>
        <div className="my-3 border-t border-sidebar-border" />
        <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase">
          Skills
        </div>
        <SkillsNavList />
      </>
    );
  }

  const skillMatch = SKILL_PAGE_PATTERN.exec(pathname);
  const skillIdParam = skillMatch?.[2];
  if (skillMatch && skillIdParam && isSkillId(skillIdParam)) {
    return (
      // Keyed so a *different* skill/client combo mounts a fresh instance
      // instead of reusing one — its initial state is already null, so
      // there's nothing to reset inside the effect (no synchronous
      // setState-in-effect, no risk of an in-flight fetch for the old
      // combo clobbering the new one's result once it lands).
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
      <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase">
        Recent
      </div>
      {recent.length > 0 ? (
        <nav className="flex flex-col gap-0.5">
          {recent.map((client) => (
            <Link
              key={client.engagementId}
              href={`/dashboard/engagements/${client.engagementId}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all truncate"
            >
              <span className="w-4 h-4 shrink-0 rounded-[5px] bg-teal-500/90 flex items-center justify-center text-[8px] font-bold text-white">
                {client.buyer.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate">{client.buyer}</span>
            </Link>
          ))}
        </nav>
      ) : (
        <p className="px-2.5 py-1 text-xs text-zinc-400 dark:text-zinc-600">No engagements yet.</p>
      )}
    </>
  );
}

/**
 * "Other clients with this skill active" — fetched client-side from
 * /api/modules/[skill]/clients (see that route + getSkillActiveClients in
 * module-overview.ts) rather than passed down from the server-rendered
 * EngagementsSidebar, since that component doesn't know which client+skill
 * page it's about to render under (Next layouts don't receive their
 * children's route params). The parent renders this keyed by
 * `${engagementId}:${skillId}` (see above), so a new skill/client combo is
 * a fresh mount with its own fresh `null` state rather than this effect
 * needing to reset state itself — no synchronous setState-in-effect, and
 * no chance of an old combo's in-flight fetch resolving into a new combo's
 * state. `cancelled` still guards the single in-flight request this
 * instance itself might have outstanding if it unmounts before the fetch
 * resolves.
 */
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
      <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase">
        Other clients · {manifest.name}
      </div>

      {clients === null ? (
        <div className="flex flex-col gap-1 px-2.5 py-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 rounded-lg bg-zinc-200/50 dark:bg-zinc-900/40 animate-pulse" />
          ))}
        </div>
      ) : clients.length > 0 ? (
        <nav className="flex flex-col gap-0.5">
          {clients.map((client) => (
            <Link
              key={client.engagementId}
              href={`/dashboard/engagements/${client.engagementId}/skills/${skillId}`}
              title={`${client.buyer} — ${manifest.name}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all truncate"
            >
              <span className="w-4 h-4 shrink-0 rounded-[5px] bg-teal-500/90 flex items-center justify-center text-[8px] font-bold text-white">
                {client.buyer.slice(0, 1).toUpperCase()}
              </span>
              {/* The client's name, not the skill name repeated on every
                  row — every row here is already the same skill, so the
                  name is the only thing that actually tells rows apart. */}
              <span className="truncate">{client.buyer}</span>
            </Link>
          ))}
        </nav>
      ) : (
        <p className="px-2.5 py-1 text-xs text-zinc-400 dark:text-zinc-600">
          No other clients have {manifest.name} active.
        </p>
      )}

      <div className="my-3 border-t border-sidebar-border" />
      <Link
        href={`/dashboard/modules/${skillId}`}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all"
      >
        View all {manifest.name} clients →
      </Link>
    </>
  );
}
