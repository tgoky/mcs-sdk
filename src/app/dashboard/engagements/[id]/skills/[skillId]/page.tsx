// src/app/dashboard/engagements/[id]/skills/[skillId]/page.tsx
//
// Every client-scoped skill page. What each one shows lives in
// ../../skill-pages.tsx; this file is the shell they share: the access
// check, back link, breadcrumb and header. Before, each skill had its own
// copy of this shell and they had drifted (the Whop pages had no dot grid,
// no subtitle and ignored ?from=).

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { loadOwnedEngagement } from "../../owned-engagement";
import { SKILL_PAGES, skillPageBackLink, type SkillPageContext } from "../../skill-pages";

export const revalidate = 0;

export default async function SkillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; skillId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, skillId } = await params;
  const query = await searchParams;

  const page = Object.prototype.hasOwnProperty.call(SKILL_PAGES, skillId) ? SKILL_PAGES[skillId] : undefined;
  if (!page) notFound();

  const engagement = await loadOwnedEngagement(id);
  if (!engagement) notFound();

  const ctx: SkillPageContext = { engagement, searchParams: query };
  const back = skillPageBackLink(id, query.from);

  return (
    <div className="relative min-h-screen w-full mx-auto tracking-tight antialiased px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200 overflow-hidden pb-10">
      {/* Dot Grid Background — same as the main engagement page */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" aria-hidden="true" />

      <div className="relative z-10 space-y-4 font-sans antialiased">
        <SetBreadcrumbLabel label={`${engagement.buyer} · ${page.breadcrumb ?? page.title}`} />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={back.href}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0"
              aria-label={back.label}
              title={back.label}
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>

            <div className="min-w-0">
              <h1 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
                {page.title} for {engagement.buyer}
              </h1>
              {page.subtitle && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{page.subtitle}</p>}
            </div>
          </div>

          {page.headerAction?.(ctx)}
        </div>

        {await page.body(ctx)}
      </div>
    </div>
  );
}
