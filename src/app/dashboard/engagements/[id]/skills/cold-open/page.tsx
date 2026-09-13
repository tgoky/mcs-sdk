// src/app/dashboard/engagements/[id]/skills/cold-open/page.tsx
//
// Cold Open's dedicated per-engagement page — the real, confirmed gap:
// every one of its 7 skills previously fell through to the bare
// engagement page's Run History, with no way to see what the pipeline
// actually did (leads pushed, replies classified). Mirrors
// skills/reputation-manager/page.tsx and skills/pile-on/page.tsx's shell
// exactly (back link, breadcrumb, title) — this app's established shape
// for a client-scoped skill page.

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { ColdOpenFindingsPanel } from "../../cold-open-findings-panel";

export const revalidate = 0;

export default async function ColdOpenSkillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const session = await getSession();
  const activeWorkspace = await getActiveWorkspace(session?.whopUserId ?? "");

  const [engagement] = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session?.whopUserId ?? ""),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);

  if (!engagement) notFound();

  const isFromModule = from && from.startsWith("/dashboard/modules");
  const backHref = isFromModule ? from : `/dashboard/engagements/${id}`;
  const backLabel = isFromModule ? "Back to Module" : "Back to engagement";

  return (
    <div className="relative min-h-screen w-full mx-auto tracking-tight antialiased px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200 overflow-hidden pb-10">
      <div className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" aria-hidden="true" />

      <div className="relative z-10 space-y-4 font-sans antialiased">
        <SetBreadcrumbLabel label={`${engagement.buyer} · Cold Open`} />

        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0"
            aria-label={backLabel}
            title={backLabel}
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>

          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
              Cold Open — {engagement.buyer}
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Every lead pushed and every reply classified across ICP Lock, Voice Capture, Source Connect, Send
              Connect, Daily Send, Reply Sort, and Send Report for this client.
            </p>
          </div>
        </div>

        <ColdOpenFindingsPanel engagementId={id} />
      </div>
    </div>
  );
}
